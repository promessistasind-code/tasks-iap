-- Ministry-scoped creation and task collaboration. Existing projects remain unassigned.
ALTER TABLE private.ministry_members ADD COLUMN can_create_projects boolean NOT NULL DEFAULT false, ADD COLUMN can_create_tasks boolean NOT NULL DEFAULT false;
ALTER TABLE public.lt_projects ADD COLUMN ministry_id uuid REFERENCES private.ministries(id);
CREATE INDEX projects_ministry ON public.lt_projects(ministry_id);
ALTER TABLE public.lt_tasks ADD COLUMN assignee_id uuid REFERENCES public.profiles(id), ADD COLUMN team_ids uuid[] NOT NULL DEFAULT '{}', ADD COLUMN created_by uuid REFERENCES public.profiles(id) DEFAULT auth.uid();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.lt_tasks t WHERE t.assignee IS NOT NULL AND (SELECT count(*) FROM public.profiles p WHERE p.name=t.assignee)<>1) THEN RAISE EXCEPTION 'Resolve ambiguous legacy assignees before migration'; END IF; END $$;
UPDATE public.lt_tasks t SET assignee_id=p.id FROM public.profiles p WHERE p.name=t.assignee;
UPDATE public.lt_tasks t SET created_by=p.created_by FROM public.lt_projects p WHERE p.id=t.project_id;
CREATE INDEX tasks_assignee_id ON public.lt_tasks(assignee_id);

CREATE FUNCTION private.ministry_permission(mid uuid, permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND (private.is_admin() OR EXISTS(SELECT 1 FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id WHERE p.user_id=auth.uid() AND m.ministry_id=mid AND m.active AND (m.leader OR CASE permission WHEN 'create_projects' THEN m.can_create_projects WHEN 'create_tasks' THEN m.can_create_tasks ELSE false END)))
$$;
CREATE OR REPLACE FUNCTION private.has_project_access(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND (private.is_admin() OR EXISTS(SELECT 1 FROM public.lt_project_members WHERE project_id=pid AND user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.lt_projects pr JOIN private.ministry_members m ON m.ministry_id=pr.ministry_id JOIN private.people p ON p.id=m.person_id WHERE pr.id=pid AND p.user_id=auth.uid() AND m.active))
$$;
CREATE FUNCTION private.manage_project(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM public.lt_projects p WHERE p.id=pid AND (private.is_admin() OR (private.has_project_access(pid) AND (p.created_by=auth.uid() OR private.ministry_leader(p.ministry_id)))))
$$;
CREATE FUNCTION private.create_task_in(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM public.lt_projects p WHERE p.id=pid AND (private.is_admin() OR (NOT p.suspended AND private.has_project_access(pid) AND private.ministry_permission(p.ministry_id,'create_tasks'))))
$$;
CREATE OR REPLACE FUNCTION private.can_write_task(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM public.lt_tasks t JOIN public.lt_projects p ON p.id=t.project_id WHERE t.id=tid AND private.has_project_access(p.id) AND (private.is_admin() OR (NOT p.suspended AND (private.manage_project(p.id) OR t.assignee_id=auth.uid()))))
$$;
CREATE FUNCTION private.comment_task(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.can_write_task(tid) OR (private.account_ready() AND EXISTS(SELECT 1 FROM public.lt_tasks t JOIN public.lt_projects p ON p.id=t.project_id WHERE t.id=tid AND NOT p.suspended AND private.has_project_access(p.id) AND auth.uid()=ANY(t.team_ids)))
$$;
CREATE FUNCTION private.eligible_for_project(uid uuid,pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles u JOIN private.account_access a ON a.user_id=u.id JOIN private.people pe ON pe.user_id=u.id JOIN public.lt_projects pr ON pr.id=pid WHERE u.id=uid AND a.active AND pe.consent_at IS NOT NULL AND (u.is_admin OR EXISTS(SELECT 1 FROM public.lt_project_members WHERE project_id=pid AND user_id=uid) OR EXISTS(SELECT 1 FROM private.ministry_members m WHERE m.person_id=pe.id AND m.ministry_id=pr.ministry_id AND m.active)))
$$;

DROP POLICY projects_update ON public.lt_projects;
CREATE POLICY projects_update ON public.lt_projects FOR UPDATE TO authenticated USING(private.manage_project(id)) WITH CHECK(private.has_project_access(id));
-- Existing insertion policy names are discovered rather than assumed.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_projects' AND cmd='INSERT' LOOP EXECUTE format('DROP POLICY %I ON public.lt_projects',r.policyname); END LOOP; END $$;
CREATE POLICY project_create_ministry ON public.lt_projects FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND ministry_id IS NOT NULL AND private.ministry_permission(ministry_id,'create_projects'));
CREATE FUNCTION private.guard_project_ministry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.ministry_id IS DISTINCT FROM OLD.ministry_id THEN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Only administrators can move a project between ministries' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_project_ministry BEFORE UPDATE ON public.lt_projects FOR EACH ROW EXECUTE FUNCTION private.guard_project_ministry();
CREATE OR REPLACE FUNCTION public.prevent_non_admin_suspend_toggle() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF NEW.suspended IS DISTINCT FROM OLD.suspended AND NOT private.manage_project(OLD.id) THEN RAISE EXCEPTION 'Project manager required' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
DROP POLICY tasks_write ON public.lt_tasks;
CREATE POLICY tasks_write ON public.lt_tasks FOR INSERT TO authenticated WITH CHECK(private.create_task_in(project_id));
DROP POLICY tasks_update ON public.lt_tasks;
CREATE POLICY tasks_update ON public.lt_tasks FOR UPDATE TO authenticated USING(private.can_write_task(id)) WITH CHECK(private.has_project_access(project_id));
DROP POLICY tasks_delete ON public.lt_tasks;
CREATE POLICY tasks_delete ON public.lt_tasks FOR DELETE TO authenticated USING(private.can_write_task(id));

CREATE FUNCTION private.workspace_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN private.account_ready() THEN jsonb_build_object(
 'ministries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM private.ministries WHERE private.ministry_permission(id,'create_projects')),
 'projects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'canManage',private.manage_project(p.id),'canCreateTasks',private.create_task_in(p.id),'eligibleMemberIds',(SELECT coalesce(jsonb_agg(u.id),'[]') FROM public.profiles u WHERE private.eligible_for_project(u.id,p.id)))),'[]') FROM public.lt_projects p WHERE private.has_project_access(p.id))) ELSE '{}'::jsonb END
$$;
CREATE FUNCTION public.workspace_access() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.workspace_access() $$;

REVOKE ALL ON FUNCTION private.ministry_permission(uuid,text),private.manage_project(uuid),private.create_task_in(uuid),private.comment_task(uuid),private.eligible_for_project(uuid,uuid),private.guard_project_ministry(),private.workspace_access(),public.workspace_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.ministry_permission(uuid,text),private.manage_project(uuid),private.create_task_in(uuid),private.comment_task(uuid),private.workspace_access(),public.workspace_access() TO authenticated;
