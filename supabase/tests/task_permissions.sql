-- Test-only identities. Runner must wrap this file in BEGIN / ROLLBACK.
INSERT INTO auth.users(id,email) SELECT ('91000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'permissions-'||i||'@example.invalid' FROM generate_series(1,4) i;
INSERT INTO public.profiles(id,email,name,initials) SELECT id,email,'Permissions '||right(id::text,1),'PT' FROM auth.users WHERE email LIKE 'permissions-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'permissions-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at,consent_by,consent_version)
 SELECT id,id,'Permissions','Test',email,'11999999999','1990-01-01',now(),id,'test-only' FROM public.profiles WHERE email LIKE 'permissions-%@example.invalid';
INSERT INTO private.ministries(id,name) VALUES('92000000-0000-0000-0000-000000000001','Permission test ministry A'),('92000000-0000-0000-0000-000000000002','Permission test ministry B');
INSERT INTO private.ministry_members(person_id,ministry_id,leader,can_add,can_edit_roles,added_by)
 SELECT id,'92000000-0000-0000-0000-000000000001',right(id::text,1)='1',true,true,'91000000-0000-0000-0000-000000000001' FROM public.profiles WHERE email LIKE 'permissions-%@example.invalid' AND right(id::text,1)<>'4';
INSERT INTO private.ministry_members(person_id,ministry_id,leader,added_by) VALUES('91000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000002',true,'91000000-0000-0000-0000-000000000004');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lt_projects(id,name,color,emoji,created_by,ministry_id) VALUES('93000000-0000-0000-0000-000000000001','Permissions project','#fff','folder',auth.uid(),'92000000-0000-0000-0000-000000000001');
INSERT INTO public.lt_tasks(id,title,project_id,assignee_id,team_ids,recurring,due_date) VALUES('94000000-0000-0000-0000-000000000001','Permissions task','93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002',ARRAY['91000000-0000-0000-0000-000000000003']::uuid[],'weekly','2026-10-30');
INSERT INTO public.lt_task_checklist(task_id,text) VALUES('94000000-0000-0000-0000-000000000001','Checklist test');
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lt_projects WHERE id='93000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Ministry member cannot view project'; END IF;
 BEGIN
  INSERT INTO public.lt_projects(name,color,emoji,created_by,ministry_id) VALUES('Forbidden','#fff','folder',auth.uid(),'92000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Member created project without permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.lt_tasks(title,project_id) VALUES('Forbidden','93000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Member created task without permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.lt_tasks SET title='Forbidden' WHERE id='94000000-0000-0000-0000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Team changed primary fields'; END IF;
 UPDATE public.lt_task_checklist SET done=true WHERE task_id='94000000-0000-0000-0000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Team changed checklist'; END IF;
END $$;
-- Own ministry leader can edit a project even when its creator is another member.
RESET ROLE;
ALTER TABLE public.lt_projects DISABLE TRIGGER guard_project_owner;
UPDATE public.lt_projects SET created_by='91000000-0000-0000-0000-000000000002' WHERE id='93000000-0000-0000-0000-000000000001';
ALTER TABLE public.lt_projects ENABLE TRIGGER guard_project_owner;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 UPDATE public.lt_projects SET name='Leader edit' WHERE id='93000000-0000-0000-0000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Leader cannot edit member project'; END IF;
 UPDATE public.lt_tasks SET title='Leader edit' WHERE id='94000000-0000-0000-0000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Leader cannot edit member task'; END IF;
END $$;
-- Restore fixture ownership so responsibility tests do not inherit owner authority.
RESET ROLE;
ALTER TABLE public.lt_projects DISABLE TRIGGER guard_project_owner;
UPDATE public.lt_projects SET created_by='91000000-0000-0000-0000-000000000001' WHERE id='93000000-0000-0000-0000-000000000001';
ALTER TABLE public.lt_projects ENABLE TRIGGER guard_project_owner;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000004',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.lt_projects WHERE id='93000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Other ministry project leaked'; END IF;
 UPDATE public.lt_tasks SET title='Forbidden' WHERE id='94000000-0000-0000-0000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Other ministry leader changed task'; END IF;
END $$;
RESET ROLE;
