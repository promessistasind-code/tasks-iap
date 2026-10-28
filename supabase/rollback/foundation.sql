-- Emergency rollback only. Reintroduces legacy access rules; do not run routinely.
-- Abort rather than making any new private note shared.
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.lt_notes) THEN
  RAISE EXCEPTION 'Private notes exist: keep security migration and roll back frontend only';
END IF; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_notes' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_notes'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_project_members' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_project_members'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_notifications' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_notifications'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_projects' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_projects'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_tasks' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_tasks'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_task_comments' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_task_comments'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_task_checklist' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_task_checklist'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_task_activity' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_task_activity'); END LOOP; END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lt_task_links' LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,'lt_task_links'); END LOOP; END $$;
DROP TRIGGER generate_task_recurrence ON public.lt_tasks;
DROP TRIGGER guard_recurrence_source ON public.lt_tasks;
DROP TRIGGER enroll_project_owner ON public.lt_projects;
DROP TRIGGER guard_project_owner ON public.lt_projects;
DROP FUNCTION public.send_project_invite(uuid,uuid),public.respond_project_invite(uuid,boolean),public.cancel_project_invite(uuid,uuid);
DROP FUNCTION private.send_project_invite(uuid,uuid),private.respond_project_invite(uuid,boolean),private.cancel_project_invite(uuid,uuid);
DROP FUNCTION private.generate_task_recurrence(),private.guard_recurrence_source(),private.enroll_project_owner(),private.guard_project_owner(),private.can_write_task(uuid);
CREATE OR REPLACE FUNCTION public.prevent_non_admin_suspend_toggle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.suspended is distinct from old.suspended and not public.is_admin() then
    raise exception 'Só administradores podem suspender ou reativar um projeto';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$function$
;
CREATE OR REPLACE FUNCTION public.has_project_access(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select public.is_admin() or exists (
    select 1 from public.lt_project_members where project_id = pid and user_id = auth.uid()
  );
$function$
;
DROP FUNCTION private.has_project_access(uuid),private.is_admin();
GRANT EXECUTE ON FUNCTION public.is_admin(),public.has_project_access(uuid),public.prevent_non_admin_suspend_toggle() TO PUBLIC;
DROP INDEX public.project_members_unique;
DROP INDEX public.pending_project_invite_unique;
DROP INDEX public.notes_user_updated;
DROP INDEX public.tasks_recurrence_source_unique;
ALTER TABLE public.lt_tasks DROP COLUMN recurrence_source_id;
ALTER TABLE public.lt_notes DROP COLUMN user_id;
CREATE POLICY "projects_delete" ON public."lt_projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((created_by = auth.uid()) OR is_admin()));
CREATE POLICY "projects_insert" ON public."lt_projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "projects_select" ON public."lt_projects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_project_access(id));
CREATE POLICY "projects_update" ON public."lt_projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((created_by = auth.uid()) OR is_admin()));
CREATE POLICY "project_members_delete" ON public."lt_project_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM lt_projects p
  WHERE ((p.id = lt_project_members.project_id) AND (p.created_by = auth.uid()))))));
CREATE POLICY "project_members_insert" ON public."lt_project_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_admin() OR (EXISTS ( SELECT 1
   FROM lt_projects p
  WHERE ((p.id = lt_project_members.project_id) AND (p.created_by = auth.uid()))))));
CREATE POLICY "project_members_insert_self" ON public."lt_project_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "project_members_select" ON public."lt_project_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_project_access(project_id));
CREATE POLICY "notifications_delete" ON public."lt_notifications" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((recipient_id = auth.uid()) OR (actor_id = auth.uid())));
CREATE POLICY "notifications_insert" ON public."lt_notifications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((actor_id = auth.uid()));
CREATE POLICY "notifications_select" ON public."lt_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_id = auth.uid()) OR (actor_id = auth.uid())));
CREATE POLICY "notifications_update" ON public."lt_notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((recipient_id = auth.uid()));
CREATE POLICY "tasks_delete" ON public."lt_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_project_access(project_id) AND (is_admin() OR (NOT (EXISTS ( SELECT 1
   FROM lt_projects p
  WHERE ((p.id = lt_tasks.project_id) AND p.suspended)))))));
CREATE POLICY "tasks_select" ON public."lt_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_project_access(project_id));
CREATE POLICY "tasks_update" ON public."lt_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (has_project_access(project_id)) WITH CHECK ((is_admin() OR (NOT (EXISTS ( SELECT 1
   FROM lt_projects p
  WHERE ((p.id = lt_tasks.project_id) AND p.suspended))))));
CREATE POLICY "tasks_write" ON public."lt_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_project_access(project_id) AND (is_admin() OR (NOT (EXISTS ( SELECT 1
   FROM lt_projects p
  WHERE ((p.id = lt_tasks.project_id) AND p.suspended)))))));
CREATE POLICY "task_comments_all" ON public."lt_task_comments" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_comments.task_id)))) WITH CHECK (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_comments.task_id))));
CREATE POLICY "task_checklist_all" ON public."lt_task_checklist" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_checklist.task_id)))) WITH CHECK (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_checklist.task_id))));
CREATE POLICY "task_activity_all" ON public."lt_task_activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_activity.task_id)))) WITH CHECK (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_activity.task_id))));
CREATE POLICY "task_links_all" ON public."lt_task_links" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_links.task_id)))) WITH CHECK (has_project_access(( SELECT lt_tasks.project_id
   FROM lt_tasks
  WHERE (lt_tasks.id = lt_task_links.task_id))));
CREATE POLICY "notes_all" ON public."lt_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);
GRANT INSERT ON public.lt_notifications TO "postgres";
GRANT SELECT ON public.lt_notifications TO "postgres";
GRANT UPDATE ON public.lt_notifications TO "postgres";
GRANT DELETE ON public.lt_notifications TO "postgres";
GRANT TRUNCATE ON public.lt_notifications TO "postgres";
GRANT REFERENCES ON public.lt_notifications TO "postgres";
GRANT TRIGGER ON public.lt_notifications TO "postgres";
GRANT INSERT ON public.lt_notifications TO "anon";
GRANT SELECT ON public.lt_notifications TO "anon";
GRANT UPDATE ON public.lt_notifications TO "anon";
GRANT DELETE ON public.lt_notifications TO "anon";
GRANT TRUNCATE ON public.lt_notifications TO "anon";
GRANT REFERENCES ON public.lt_notifications TO "anon";
GRANT TRIGGER ON public.lt_notifications TO "anon";
GRANT INSERT ON public.lt_notifications TO "authenticated";
GRANT SELECT ON public.lt_notifications TO "authenticated";
GRANT UPDATE ON public.lt_notifications TO "authenticated";
GRANT DELETE ON public.lt_notifications TO "authenticated";
GRANT TRUNCATE ON public.lt_notifications TO "authenticated";
GRANT REFERENCES ON public.lt_notifications TO "authenticated";
GRANT TRIGGER ON public.lt_notifications TO "authenticated";
GRANT INSERT ON public.lt_notifications TO "service_role";
GRANT SELECT ON public.lt_notifications TO "service_role";
GRANT UPDATE ON public.lt_notifications TO "service_role";
GRANT DELETE ON public.lt_notifications TO "service_role";
GRANT TRUNCATE ON public.lt_notifications TO "service_role";
GRANT REFERENCES ON public.lt_notifications TO "service_role";
GRANT TRIGGER ON public.lt_notifications TO "service_role";
ALTER PUBLICATION supabase_realtime DROP TABLE public.lt_projects;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lt_project_members;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lt_task_checklist;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lt_task_activity;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lt_task_links;
COMMIT;
