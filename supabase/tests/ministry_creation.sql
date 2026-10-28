-- Run after task_permissions.sql in the same rolled-back transaction.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
SELECT public.people_portal('membership','{"personId":"91000000-0000-0000-0000-000000000003","ministryId":"92000000-0000-0000-0000-000000000001","canAdd":true,"canEditRoles":true,"canCreateTasks":true}');
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
INSERT INTO public.lt_tasks(id,title,project_id) VALUES('94000000-0000-0000-0000-000000000002','Delegated creation','93000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lt_tasks WHERE id='94000000-0000-0000-0000-000000000002' AND assignee_id=auth.uid() AND created_by=auth.uid()) THEN RAISE EXCEPTION 'Default responsibility/creator incorrect'; END IF;
 BEGIN
  INSERT INTO public.lt_projects(name,color,emoji,created_by,ministry_id) VALUES('Forbidden','#fff','folder',auth.uid(),'92000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Task creation grant also granted projects';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.send_project_invite('93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'Member extended project access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.lt_tasks SET assignee_id='91000000-0000-0000-0000-000000000002' WHERE id='94000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 UPDATE public.lt_tasks SET title='Forbidden creator edit' WHERE id='94000000-0000-0000-0000-000000000002';
 IF FOUND THEN RAISE EXCEPTION 'Creator retained unauthorized edit after assignment'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
SELECT public.people_portal('membership','{"personId":"91000000-0000-0000-0000-000000000003","ministryId":"92000000-0000-0000-0000-000000000001","canAdd":true,"canEditRoles":true,"canCreateProjects":true}');
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
INSERT INTO public.lt_projects(name,color,emoji,created_by,ministry_id) VALUES('Delegated project','#fff','folder',auth.uid(),'92000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.lt_tasks(title,project_id) VALUES('Forbidden after revocation','93000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Revoked task creation still allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$ BEGIN IF (SELECT count(*) FROM public.lt_task_activity WHERE task_id='94000000-0000-0000-0000-000000000002')<>2 THEN RAISE EXCEPTION 'Creation or reassignment history missing'; END IF; END $$;
