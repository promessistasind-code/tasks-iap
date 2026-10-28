-- Foundation security. Apply atomically; see docs/implementation.md for recovery.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_admin)
$$;
CREATE FUNCTION private.has_project_access(pid uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (private.is_admin() OR EXISTS(
    SELECT 1 FROM public.lt_project_members WHERE project_id=pid AND user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION private.is_admin(),private.has_project_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_admin(),private.has_project_access(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
SECURITY INVOKER SET search_path = '' AS $$ SELECT private.is_admin() $$;
CREATE OR REPLACE FUNCTION public.has_project_access(pid uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY INVOKER SET search_path = '' AS $$ SELECT private.has_project_access(pid) $$;

ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.has_project_access(uuid) SET search_path = '';
ALTER FUNCTION public.prevent_non_admin_suspend_toggle() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.is_admin(), public.has_project_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.has_project_access(uuid) TO authenticated;
ALTER FUNCTION public.prevent_non_admin_suspend_toggle() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.prevent_non_admin_suspend_toggle() FROM PUBLIC,anon,authenticated;

DROP POLICY project_members_insert_self ON public.lt_project_members;
CREATE UNIQUE INDEX project_members_unique ON public.lt_project_members(project_id,user_id);

-- The owner is enrolled before INSERT ... RETURNING is checked by SELECT RLS.
CREATE FUNCTION private.enroll_project_owner() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Invalid project owner' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.lt_project_members(project_id,user_id,role)
  VALUES(NEW.id,NEW.created_by,'owner');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enroll_project_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enroll_project_owner AFTER INSERT ON public.lt_projects
FOR EACH ROW EXECUTE FUNCTION private.enroll_project_owner();

-- Keep the creator visible during INSERT RETURNING; enrollment is transactional.
DROP POLICY projects_select ON public.lt_projects;
CREATE POLICY projects_select ON public.lt_projects FOR SELECT TO authenticated
USING(created_by=(SELECT auth.uid()) OR public.has_project_access(id));

CREATE FUNCTION private.guard_project_owner() RETURNS trigger LANGUAGE plpgsql
SET search_path = '' AS $$ BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Project ownership cannot be changed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_project_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_project_owner BEFORE UPDATE ON public.lt_projects
FOR EACH ROW EXECUTE FUNCTION private.guard_project_owner();

-- Notifications are immutable to clients. Only validated RPCs change invites.
DROP POLICY notifications_insert ON public.lt_notifications;
DROP POLICY notifications_update ON public.lt_notifications;
DROP POLICY notifications_delete ON public.lt_notifications;
REVOKE INSERT,UPDATE,DELETE ON public.lt_notifications FROM authenticated,anon;
CREATE UNIQUE INDEX pending_project_invite_unique
ON public.lt_notifications(project_id,recipient_id)
WHERE type='project_invite' AND status='pending';

CREATE FUNCTION private.send_project_invite(p_project_id uuid,p_recipient_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE='42501';
  END IF;
  -- Serialize send/cancel/respond and membership changes per project.
  PERFORM 1 FROM public.lt_projects WHERE id=p_project_id AND NOT suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.lt_project_members WHERE project_id=p_project_id AND user_id=p_recipient_id) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;
  INSERT INTO public.lt_notifications(project_id,recipient_id,actor_id,type)
  VALUES(p_project_id,p_recipient_id,auth.uid(),'project_invite')
  ON CONFLICT(project_id,recipient_id) WHERE type='project_invite' AND status='pending'
  DO UPDATE SET actor_id=EXCLUDED.actor_id RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION private.respond_project_invite(p_notification_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invite public.lt_notifications; pid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT project_id INTO pid FROM public.lt_notifications WHERE id=p_notification_id AND recipient_id=auth.uid() AND type='project_invite';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.lt_projects WHERE id=pid AND NOT suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable'; END IF;
  SELECT * INTO invite FROM public.lt_notifications WHERE id=p_notification_id AND recipient_id=auth.uid() AND type='project_invite' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='42501'; END IF;
  IF invite.status=(CASE WHEN p_accept THEN 'accepted' ELSE 'dismissed' END) THEN RETURN; END IF;
  IF invite.status<>'pending' THEN RAISE EXCEPTION 'Invitation already answered'; END IF;
  IF p_accept THEN
    IF invite.actor_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.profiles WHERE id=invite.actor_id AND is_admin
      UNION ALL SELECT 1 FROM public.lt_project_members WHERE project_id=pid AND user_id=invite.actor_id
    ) THEN RAISE EXCEPTION 'Inviter no longer has access' USING ERRCODE='42501'; END IF;
    INSERT INTO public.lt_project_members(project_id,user_id,role)
    VALUES(pid,auth.uid(),'member') ON CONFLICT(project_id,user_id) DO NOTHING;
  END IF;
  UPDATE public.lt_notifications SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'dismissed' END, responded_at=now() WHERE id=invite.id;
END $$;

CREATE FUNCTION private.cancel_project_invite(p_project_id uuid,p_recipient_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT public.has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'Project access required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.lt_projects WHERE id=p_project_id FOR UPDATE;
  DELETE FROM public.lt_notifications WHERE project_id=p_project_id AND recipient_id=p_recipient_id
    AND type='project_invite' AND status='pending'
    AND (actor_id=auth.uid() OR public.is_admin() OR EXISTS(
      SELECT 1 FROM public.lt_projects WHERE id=p_project_id AND created_by=auth.uid()));
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
END $$;

REVOKE ALL ON FUNCTION private.send_project_invite(uuid,uuid), private.respond_project_invite(uuid,boolean), private.cancel_project_invite(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.send_project_invite(uuid,uuid), private.respond_project_invite(uuid,boolean), private.cancel_project_invite(uuid,uuid) TO authenticated;
CREATE FUNCTION public.send_project_invite(p_project_id uuid,p_recipient_id uuid) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.send_project_invite(p_project_id,p_recipient_id) $$;
CREATE FUNCTION public.respond_project_invite(p_notification_id uuid,p_accept boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.respond_project_invite(p_notification_id,p_accept) $$;
CREATE FUNCTION public.cancel_project_invite(p_project_id uuid,p_recipient_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT private.cancel_project_invite(p_project_id,p_recipient_id) $$;
REVOKE ALL ON FUNCTION public.send_project_invite(uuid,uuid), public.respond_project_invite(uuid,boolean), public.cancel_project_invite(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_project_invite(uuid,uuid), public.respond_project_invite(uuid,boolean), public.cancel_project_invite(uuid,uuid) TO authenticated;

-- Existing notes were confirmed empty. Fail closed if that changes before apply.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.lt_notes) THEN
  RAISE EXCEPTION 'Notes changed since backup; back up and review before proceeding';
END IF; END $$;
ALTER TABLE public.lt_notes ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id);
DROP POLICY notes_all ON public.lt_notes;
CREATE POLICY notes_private ON public.lt_notes FOR ALL TO authenticated
USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE INDEX notes_user_updated ON public.lt_notes(user_id,updated_at DESC);

-- Prevent moving a task to a project the caller cannot access.
DROP POLICY tasks_update ON public.lt_tasks;
CREATE POLICY tasks_update ON public.lt_tasks FOR UPDATE TO authenticated
USING(public.has_project_access(project_id) AND (public.is_admin() OR NOT EXISTS(SELECT 1 FROM public.lt_projects p WHERE p.id=project_id AND p.suspended)))
WITH CHECK(public.has_project_access(project_id) AND (public.is_admin() OR NOT EXISTS(SELECT 1 FROM public.lt_projects p WHERE p.id=project_id AND p.suspended)));

-- Each source task creates at most one successor, including concurrent retries.
ALTER TABLE public.lt_tasks ADD COLUMN recurrence_source_id uuid;
CREATE UNIQUE INDEX tasks_recurrence_source_unique ON public.lt_tasks(recurrence_source_id);
CREATE FUNCTION private.guard_recurrence_source() RETURNS trigger LANGUAGE plpgsql
SET search_path = '' AS $$ BEGIN
  IF (TG_OP='UPDATE' AND NEW.recurrence_source_id IS DISTINCT FROM OLD.recurrence_source_id)
     OR (TG_OP='INSERT' AND NEW.recurrence_source_id IS NOT NULL AND pg_trigger_depth() < 2) THEN
    RAISE EXCEPTION 'Recurrence source is managed by the database' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_recurrence_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_recurrence_source BEFORE INSERT OR UPDATE ON public.lt_tasks
FOR EACH ROW EXECUTE FUNCTION private.guard_recurrence_source();
CREATE FUNCTION private.generate_task_recurrence() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path = '' AS $$
DECLARE next_id uuid; next_date date;
BEGIN
  IF NEW.status<>'done' OR OLD.status='done' OR NEW.due_date IS NULL OR NEW.recurring IS NULL THEN RETURN NEW; END IF;
  next_date := CASE NEW.recurring WHEN 'daily' THEN NEW.due_date+1
    WHEN 'weekly' THEN NEW.due_date+7 WHEN 'biweekly' THEN NEW.due_date+14
    WHEN 'monthly' THEN (NEW.due_date+interval '1 month')::date ELSE NULL END;
  IF next_date IS NULL THEN RAISE EXCEPTION 'Unsupported recurrence'; END IF;
  INSERT INTO public.lt_tasks(title,description,status,priority,project_id,due_date,tags,recurring,assignee,recurrence_source_id)
  VALUES(NEW.title,NEW.description,'todo',NEW.priority,NEW.project_id,next_date,NEW.tags,NEW.recurring,NEW.assignee,NEW.id)
  ON CONFLICT(recurrence_source_id) DO NOTHING RETURNING id INTO next_id;
  IF next_id IS NOT NULL THEN
    INSERT INTO public.lt_task_checklist(task_id,text,done,position)
    SELECT next_id,text,false,position FROM public.lt_task_checklist WHERE task_id=NEW.id;
    INSERT INTO public.lt_task_activity(task_id,text) VALUES(next_id,'Recorrência gerada automaticamente');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.generate_task_recurrence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER generate_task_recurrence AFTER UPDATE OF status ON public.lt_tasks
FOR EACH ROW EXECUTE FUNCTION private.generate_task_recurrence();

-- Suspension is enforced for child rows, not just the task's main fields.
CREATE FUNCTION private.can_write_task(tid uuid) RETURNS boolean LANGUAGE sql STABLE
SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.lt_tasks t LEFT JOIN public.lt_projects p ON p.id=t.project_id
    WHERE t.id=tid AND public.has_project_access(t.project_id) AND (public.is_admin() OR NOT p.suspended))
$$;
REVOKE ALL ON FUNCTION private.can_write_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_write_task(uuid) TO authenticated;
DO $$ DECLARE entry record; BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('lt_task_comments','task_comments_all'),('lt_task_checklist','task_checklist_all'),
    ('lt_task_activity','task_activity_all'),('lt_task_links','task_links_all')
  ) AS policies(table_name,policy_name) LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',entry.policy_name,entry.table_name);
    EXECUTE format('CREATE POLICY child_select ON public.%I FOR SELECT TO authenticated USING(public.has_project_access((SELECT project_id FROM public.lt_tasks WHERE id=task_id)))',entry.table_name);
    EXECUTE format('CREATE POLICY child_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(private.can_write_task(task_id))',entry.table_name);
    EXECUTE format('CREATE POLICY child_update ON public.%I FOR UPDATE TO authenticated USING(private.can_write_task(task_id)) WITH CHECK(private.can_write_task(task_id))',entry.table_name);
    EXECUTE format('CREATE POLICY child_delete ON public.%I FOR DELETE TO authenticated USING(private.can_write_task(task_id))',entry.table_name);
  END LOOP;
END $$;

-- Publish the tables subscribed by the consolidated lifecycle, only once.
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['lt_tasks','lt_projects','lt_project_members','lt_task_comments','lt_task_checklist','lt_task_activity','lt_task_links'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_publication_tables p WHERE p.pubname='supabase_realtime' AND p.schemaname='public' AND p.tablename=table_name) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',table_name);
    END IF;
  END LOOP;
END $$;
