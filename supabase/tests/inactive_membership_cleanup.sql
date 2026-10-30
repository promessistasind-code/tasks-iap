-- All fixtures and writes are rolled back, including audit rows.
BEGIN;
INSERT INTO auth.users(id,email) SELECT ('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'event-test-'||i||'@example.invalid' FROM generate_series(1,5)i;
INSERT INTO public.profiles(id,email,name,initials,is_admin) SELECT id,email,'Event Test','ET',false FROM auth.users WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at) SELECT id,id,'Event','Test',email,'11999999999','1990-01-01',now() FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
SELECT set_config('test.mid1',(SELECT id::text FROM private.ministries WHERE name='Ministério de Celebração'),true);
SELECT set_config('test.mid2',(SELECT id::text FROM private.ministries WHERE name='Ministério de Comunicação'),true);
SELECT set_config('test.fid1',(SELECT id::text FROM private.ministry_functions WHERE ministry_id=current_setting('test.mid1')::uuid LIMIT 1),true);
SELECT set_config('test.fid2',(SELECT id::text FROM private.ministry_functions WHERE ministry_id=current_setting('test.mid2')::uuid LIMIT 1),true);
INSERT INTO private.ministry_members(person_id,ministry_id,leader,function_ids,added_by)
SELECT id,CASE WHEN right(id::text,1) IN ('1','3') THEN current_setting('test.mid1')::uuid ELSE current_setting('test.mid2')::uuid END,right(id::text,1) IN ('1','2'),ARRAY[CASE WHEN right(id::text,1) IN ('1','3') THEN current_setting('test.fid1')::uuid ELSE current_setting('test.fid2')::uuid END],'e1000000-0000-0000-0000-000000000001'::uuid FROM private.people WHERE email LIKE 'event-test-%@example.invalid' AND right(id::text,1)<>'5';
INSERT INTO private.general_admins VALUES('e1000000-0000-0000-0000-000000000001');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 BEGIN PERFORM public.cleanup_inactive_membership('preview',jsonb_build_object('personId','e1000000-0000-0000-0000-000000000003','ministryId',current_setting('test.mid1')));RAISE EXCEPTION 'active deletion allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM='active deletion allowed' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
UPDATE private.ministry_members SET active=false WHERE person_id='e1000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb:=jsonb_build_object('personId','e1000000-0000-0000-0000-000000000003','ministryId',current_setting('test.mid1')); snap jsonb;result jsonb;
BEGIN
 snap:=public.cleanup_inactive_membership('preview',p);
 BEGIN PERFORM public.cleanup_inactive_membership('remove',p||jsonb_build_object('snapshot',snap));RAISE EXCEPTION 'confirmation bypass';EXCEPTION WHEN raise_exception THEN IF SQLERRM='confirmation bypass' THEN RAISE;END IF;END;
 BEGIN PERFORM public.cleanup_inactive_membership('remove',p||jsonb_build_object('snapshot',snap||'{"leader":true}'::jsonb,'confirmed',true));RAISE EXCEPTION 'stale snapshot accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale snapshot accepted' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 BEGIN PERFORM public.cleanup_inactive_membership('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));RAISE EXCEPTION 'leader deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 result:=public.cleanup_inactive_membership('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));
 PERFORM set_config('test.backup',result->>'backupId',true);
 PERFORM set_config('test.snapshot',snap::text,true);
 BEGIN PERFORM public.cleanup_inactive_membership('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));RAISE EXCEPTION 'duplicate removal';EXCEPTION WHEN raise_exception THEN IF SQLERRM='duplicate removal' THEN RAISE;END IF;END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.cleanup_inactive_membership('preview','{}');RAISE EXCEPTION 'anonymous access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ DECLARE saved jsonb; restored private.ministry_members;BEGIN
 IF EXISTS(SELECT 1 FROM private.ministry_members WHERE person_id='e1000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'membership remains';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.people WHERE id='e1000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'person removed';END IF;
 SELECT details->'backup' INTO saved FROM private.people_audit WHERE id=current_setting('test.backup')::bigint;
 IF saved IS DISTINCT FROM current_setting('test.snapshot')::jsonb THEN RAISE EXCEPTION 'backup mismatch';END IF;
 INSERT INTO private.ministry_members SELECT * FROM jsonb_populate_record(NULL::private.ministry_members,saved) RETURNING * INTO restored;
 IF to_jsonb(restored) IS DISTINCT FROM saved THEN RAISE EXCEPTION 'restore mismatch';END IF;
END $$;
ROLLBACK;
SELECT 'inactive membership cleanup: authorization, active protection, confirmation, stale snapshot, verified backup and restore passed; fixtures rolled back' AS result;
