-- Execute after the migration inside BEGIN/ROLLBACK; never persist these fixtures.
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.denied(statement text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Unexpected authorization: %',statement;
END $$;
INSERT INTO auth.users(id,email) VALUES
('51000000-0000-0000-0000-000000000001','leader@phase2.invalid'),
('51000000-0000-0000-0000-000000000002','member@phase2.invalid'),
('51000000-0000-0000-0000-000000000003','outsider@phase2.invalid'),
('51000000-0000-0000-0000-000000000004','pending@phase2.invalid');
INSERT INTO public.profiles(id,email,name,initials) SELECT id,email,'Phase Two','PT' FROM auth.users WHERE email LIKE '%@phase2.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE '%@phase2.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at,consent_by,consent_version)
SELECT id,id,'Phase','Two',email,'11999999999','1990-06-15',CASE WHEN email<>'pending@phase2.invalid' THEN now() END,id,'2026-10-28-v1' FROM public.profiles WHERE email LIKE '%@phase2.invalid';
-- General administrators receive test-only completion without touching Auth credentials.
UPDATE private.people SET first_name='Test',last_name='Admin',phone='11999999999',birth_date='1990-01-01',consent_at=now() WHERE user_id IN (SELECT user_id FROM private.general_admins);
SELECT pg_temp.assert_true((SELECT count(*)=12 FROM private.ministries),'12 ministries');
SELECT pg_temp.assert_true((SELECT count(*)=35 FROM private.ministry_functions),'35 ministry functions');
SELECT set_config('test.ministry',(SELECT id::text FROM private.ministries WHERE name='Ministério de Celebração'),true);
SELECT set_config('test.other_ministry',(SELECT id::text FROM private.ministries WHERE name='Ministério de Ensino'),true);
SELECT set_config('test.function',(SELECT id::text FROM private.ministry_functions WHERE ministry_id=current_setting('test.ministry')::uuid LIMIT 1),true);
INSERT INTO private.ministry_members(person_id,ministry_id,leader,can_add,can_edit_roles,can_remove,added_by)
VALUES('51000000-0000-0000-0000-000000000001',current_setting('test.ministry')::uuid,true,true,true,true,'51000000-0000-0000-0000-000000000003');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true(private.account_ready(),'leader ready');
SELECT public.people_portal('membership',jsonb_build_object('personId','51000000-0000-0000-0000-000000000002','ministryId',current_setting('test.ministry'),'functionIds',jsonb_build_array(current_setting('test.function'))));
SELECT pg_temp.assert_true((SELECT jsonb_array_length(public.people_portal('management'))=1),'leader management only added member');
SELECT pg_temp.assert_true((SELECT p->>'email'='member@phase2.invalid' FROM jsonb_array_elements(public.people_portal('directory')) p WHERE p->>'id'='51000000-0000-0000-0000-000000000002'),'leader can see ministry contact');
SELECT pg_temp.assert_true((SELECT p->>'email' IS NULL FROM jsonb_array_elements(public.people_portal('directory')) p WHERE p->>'id'='51000000-0000-0000-0000-000000000003'),'leader cannot see outsider contact');
SELECT pg_temp.denied($s$SELECT public.people_portal('account','{"userId":"51000000-0000-0000-0000-000000000002","isAdmin":true}')$s$);
SELECT pg_temp.denied(format('SELECT public.people_portal(''membership'',%L::jsonb)',jsonb_build_object('personId','51000000-0000-0000-0000-000000000002','ministryId',current_setting('test.ministry'),'leader',true)::text));
SELECT pg_temp.denied(format('SELECT public.people_portal(''membership'',%L::jsonb)',jsonb_build_object('personId','51000000-0000-0000-0000-000000000002','ministryId',current_setting('test.other_ministry'))::text));
SELECT pg_temp.denied('SELECT email FROM public.profiles');
SELECT pg_temp.denied('SELECT * FROM private.people');
SELECT pg_temp.denied($s$SELECT public.people_account_service('51000000-0000-0000-0000-000000000001','resetStart','{}')$s$);
SELECT pg_temp.assert_true(NOT (public.people_portal('directory')::text LIKE '%1990-%'),'no birth year in directory');
SELECT pg_temp.assert_true(NOT (public.people_portal('directory')::text LIKE '%pending@%'),'no pending person in directory');
-- A regular member sees names and birthdays, not another person's contacts.
SELECT set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true((SELECT p->>'email' IS NULL FROM jsonb_array_elements(public.people_portal('directory')) p WHERE p->>'id'='51000000-0000-0000-0000-000000000002'),'member contact isolation');
SELECT pg_temp.denied($s$SELECT public.people_portal('savePerson','{}')$s$);
SELECT pg_temp.denied($s$SELECT public.people_portal('audit')$s$);
SELECT pg_temp.assert_true(jsonb_array_length(public.people_portal('management'))=0,'no management scope');
-- Non-consenting accounts can only inspect their own onboarding status.
SELECT set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true(NOT private.account_ready(),'pending account blocked');
SELECT pg_temp.assert_true((public.people_portal('status')->>'ready')::boolean=false,'status shows pending');
SELECT pg_temp.denied($s$SELECT public.people_portal('directory')$s$);
SELECT pg_temp.denied($s$SELECT public.send_project_invite('00000000-0000-0000-0000-000000000000','51000000-0000-0000-0000-000000000001')$s$);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.lt_tasks),'pending cannot read tasks');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.lt_notes),'pending cannot read notes');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects),'pending cannot read files');
DO $$ BEGIN
 BEGIN PERFORM public.people_portal('complete','{"firstName":"Test","lastName":"Person","phone":"11999999999","birthDate":"1990-01-01","consent":false}'); RAISE EXCEPTION 'Unexpected consent bypass';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Consent required' THEN RAISE; END IF; END;
END $$;
SELECT public.people_portal('complete','{"firstName":"Test","lastName":"Person","phone":"11999999999","birthDate":"1990-01-01","consent":true}');
SELECT pg_temp.assert_true(private.account_ready(),'explicit consent completes registration');
RESET ROLE;
UPDATE private.account_access SET password_required=true WHERE user_id='51000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true(NOT private.account_ready(),'temporary password blocks account');
UPDATE auth.users SET encrypted_password='test-only-first-change' WHERE id='51000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true(private.account_ready(),'Auth password change releases gate');
UPDATE private.account_access SET password_required=true,reset_in_progress=true WHERE user_id='51000000-0000-0000-0000-000000000004';
UPDATE auth.users SET encrypted_password='test-only-admin-reset' WHERE id='51000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true((SELECT password_required FROM private.account_access WHERE user_id='51000000-0000-0000-0000-000000000004'),'admin reset does not release gate');
UPDATE private.account_access SET password_required=false,reset_in_progress=false,reset_after=now() WHERE user_id='51000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true(NOT private.account_ready(),'pre-reset session cannot re-enter');
-- Revocation immediately removes contact access and mutation rights.
UPDATE private.ministry_members SET leader=false WHERE person_id='51000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((SELECT p->>'email' IS NULL FROM jsonb_array_elements(public.people_portal('directory')) p WHERE p->>'id'='51000000-0000-0000-0000-000000000002'),'revoked leader loses contacts');
SELECT pg_temp.denied(format('SELECT public.people_portal(''membership'',%L::jsonb)',jsonb_build_object('personId','51000000-0000-0000-0000-000000000002','ministryId',current_setting('test.ministry'))::text));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)>=2 FROM private.people_audit),'audit captured consent and membership');
SET LOCAL ROLE anon;
SELECT pg_temp.denied($s$SELECT public.people_portal('status')$s$);
RESET ROLE;

-- Service-only account provisioning and reset lifecycle, all reverted by runner.
SELECT set_config('test.admin',(SELECT user_id::text FROM private.general_admins LIMIT 1),true);
INSERT INTO auth.users(id,email) VALUES('51000000-0000-0000-0000-000000000005','invite@phase2.invalid');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.people_account_service(current_setting('test.admin')::uuid,'provision','{"userId":"51000000-0000-0000-0000-000000000005","email":"invite@phase2.invalid","firstName":"","lastName":"","phone":"","birthDate":null,"consent":false}');
SELECT pg_temp.assert_true((SELECT password_required FROM private.account_access WHERE user_id='51000000-0000-0000-0000-000000000005'),'invited account requires password change');
SELECT pg_temp.assert_true((SELECT consent_at IS NULL FROM private.people WHERE user_id='51000000-0000-0000-0000-000000000005'),'invited account has no consent');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('test.reset_token',public.people_account_service(current_setting('test.admin')::uuid,'resetStart','{"userId":"51000000-0000-0000-0000-000000000005"}')->>'resetToken',true);
SELECT pg_temp.assert_true((SELECT reset_in_progress FROM private.account_access WHERE user_id='51000000-0000-0000-0000-000000000005'),'reset blocks account');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.people_account_service(current_setting('test.admin')::uuid,'resetStart','{"userId":"51000000-0000-0000-0000-000000000005"}'); RAISE EXCEPTION 'Concurrent reset accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Reset already in progress; retry after five minutes' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.people_account_service(current_setting('test.admin')::uuid,'resetFinish',jsonb_build_object('userId','51000000-0000-0000-0000-000000000005','resetToken',current_setting('test.reset_token')));
SELECT pg_temp.assert_true((SELECT password_required AND NOT reset_in_progress AND reset_token IS NULL FROM private.account_access WHERE user_id='51000000-0000-0000-0000-000000000005'),'reset completion keeps password change required');
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.sub','51000000-0000-0000-0000-000000000001',true);
UPDATE private.ministry_members SET leader=true,can_edit_roles=false WHERE person_id='51000000-0000-0000-0000-000000000001';
INSERT INTO private.ministry_members(person_id,ministry_id,added_by) VALUES('51000000-0000-0000-0000-000000000003',current_setting('test.ministry')::uuid,current_setting('test.admin')::uuid);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(jsonb_array_length(public.people_portal('management'))=1,'leader cannot manage others added by administrator');
SELECT pg_temp.denied(format('SELECT public.people_portal(''membership'',%L::jsonb)',jsonb_build_object('personId','51000000-0000-0000-0000-000000000003','ministryId',current_setting('test.ministry'),'active',false)::text));
SELECT public.people_portal('membership',jsonb_build_object('personId','51000000-0000-0000-0000-000000000002','ministryId',current_setting('test.ministry'),'functionIds',jsonb_build_array(current_setting('test.function')),'active',false));
SELECT pg_temp.denied('UPDATE public.profiles SET is_admin=true WHERE id=auth.uid()');
RESET ROLE;
SELECT pg_temp.assert_true(NOT (SELECT active FROM private.ministry_members WHERE person_id='51000000-0000-0000-0000-000000000002' AND ministry_id=current_setting('test.ministry')::uuid),'remove permission independent of edit functions');
-- Verify that completing an existing assignee's display name preserves tasks.
DO $$ DECLARE original_name text; person_id uuid; expected bigint; BEGIN
 SELECT p.name,p.id INTO original_name,person_id FROM public.profiles p JOIN public.lt_tasks t ON t.assignee=p.name LIMIT 1;
 IF person_id IS NOT NULL THEN
  SELECT count(*) INTO expected FROM public.lt_tasks WHERE assignee=original_name;
  UPDATE public.profiles SET name=original_name||' Phase2 Test' WHERE id=person_id;
  PERFORM pg_temp.assert_true((SELECT count(*)=expected FROM public.lt_tasks WHERE assignee=original_name||' Phase2 Test'),'task assignees preserved after profile rename');
 END IF;
END $$;
