-- All fixtures and writes are rolled back, including audit rows.
BEGIN;
INSERT INTO auth.users(id,email) SELECT ('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'event-test-'||i||'@example.invalid' FROM generate_series(1,7)i;
INSERT INTO public.profiles(id,email,name,initials,is_admin) SELECT id,email,'Event Test','ET',false FROM auth.users WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at) SELECT id,id,'Event','Test',email,'11999999999','1990-01-01',now() FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.general_admins VALUES('e1000000-0000-0000-0000-000000000001');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000001';
-- Stand in for the master only within this rollback-only fixture.
UPDATE private.master_account SET user_id='e1000000-0000-0000-0000-000000000001';
INSERT INTO private.general_admins VALUES('e1000000-0000-0000-0000-000000000002');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
DO $$
DECLARE owner_id uuid:='e1000000-0000-0000-0000-000000000001'; admin_id uuid:='e1000000-0000-0000-0000-000000000002'; member_id uuid:='e1000000-0000-0000-0000-000000000003';
BEGIN
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 BEGIN PERFORM public.people_portal('account',jsonb_build_object('userId',member_id,'isAdmin',true)); RAISE EXCEPTION 'Unauthorized promotion'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.people_portal('account',jsonb_build_object('userId',owner_id,'isAdmin',false)); RAISE EXCEPTION 'Master was demoted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 IF (public.people_portal('status')->>'isMaster')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Missing master capability'; END IF;
 PERFORM public.people_portal('account',jsonb_build_object('userId',admin_id,'isAdmin',false));
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 IF private.is_admin() OR private.general_admin() THEN RAISE EXCEPTION 'Demotion ineffective'; END IF;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM public.people_portal('account',jsonb_build_object('userId',admin_id,'isAdmin',true));
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Promotion ineffective'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.people_account_service('e1000000-0000-0000-0000-000000000002','resetStart','{"userId":"e1000000-0000-0000-0000-000000000001"}'); RAISE EXCEPTION 'Master reset allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'master permissions passed' AS result;
