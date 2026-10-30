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
DO $$ DECLARE eid uuid; snap jsonb; p jsonb; result jsonb; aid uuid;
BEGIN
 eid:=(public.event_portal('save',jsonb_build_object('ministryId',current_setting('test.mid1'),'title','Deletion fixture','startsAt','2030-01-01T18:00:00Z','endsAt','2030-01-01T20:00:00Z'))->>'id')::uuid;
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',current_setting('test.mid1'),'personId','e1000000-0000-0000-0000-000000000003','functionId',current_setting('test.fid1')));
 p:=jsonb_build_object('eventId',eid);
 snap:=public.delete_event_safely('preview',p);
 aid:=(snap->'assignments'->0->>'id')::uuid;
 BEGIN PERFORM public.delete_event_safely('remove',p||jsonb_build_object('snapshot',snap));RAISE EXCEPTION 'confirmation bypass';EXCEPTION WHEN raise_exception THEN IF SQLERRM='confirmation bypass' THEN RAISE;END IF;END;
 PERFORM public.event_portal('unassign',p||jsonb_build_object('assignmentId',aid));
 BEGIN PERFORM public.delete_event_safely('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));RAISE EXCEPTION 'stale scale accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale scale accepted' THEN RAISE;END IF;END;
 snap:=public.delete_event_safely('preview',p);
 IF jsonb_array_length(snap->'assignments')<>1 OR (snap->'assignments'->0->>'active')::boolean THEN RAISE EXCEPTION 'inactive scale not backed up';END IF;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 BEGIN PERFORM public.delete_event_safely('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));RAISE EXCEPTION 'leader deleted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 BEGIN PERFORM public.delete_event_safely('preview',p);RAISE EXCEPTION 'member previewed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 result:=public.delete_event_safely('remove',p||jsonb_build_object('snapshot',snap,'confirmed',true));
 PERFORM set_config('test.backup',result->>'backupId',true);
 PERFORM set_config('test.snapshot',snap::text,true);
 PERFORM set_config('test.eid',eid::text,true);
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.delete_event_safely('preview','{}');RAISE EXCEPTION 'anonymous access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ DECLARE saved jsonb;restored jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM private.events WHERE id=current_setting('test.eid')::uuid) OR EXISTS(SELECT 1 FROM private.event_assignments WHERE event_id=current_setting('test.eid')::uuid) THEN RAISE EXCEPTION 'event or scale remains';END IF;
 SELECT details->'backup' INTO saved FROM private.people_audit WHERE id=current_setting('test.backup')::bigint;
 IF saved IS DISTINCT FROM current_setting('test.snapshot')::jsonb THEN RAISE EXCEPTION 'backup mismatch';END IF;
 INSERT INTO private.events SELECT * FROM jsonb_populate_record(NULL::private.events,saved->'event');
 INSERT INTO private.event_assignments SELECT * FROM jsonb_populate_recordset(NULL::private.event_assignments,saved->'assignments');
 restored:=public.delete_event_safely('preview',jsonb_build_object('eventId',current_setting('test.eid')));
 IF restored IS DISTINCT FROM saved THEN RAISE EXCEPTION 'restore mismatch';END IF;
 IF NOT (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.lt_tasks'::regclass AND attname='project_id') THEN RAISE EXCEPTION 'project not required';END IF;
 BEGIN INSERT INTO public.lt_tasks(title,project_id) VALUES('Missing project fixture',null);RAISE EXCEPTION 'unlinked task inserted';EXCEPTION WHEN not_null_violation OR insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lt_projects(id,name,color,emoji,created_by,ministry_id) VALUES('e9000000-0000-0000-0000-000000000001','Required project fixture','#fff','folder',auth.uid(),current_setting('test.mid1')::uuid);
INSERT INTO public.lt_tasks(id,title,project_id) VALUES('e9000000-0000-0000-0000-000000000002','Linked fixture','e9000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 BEGIN UPDATE public.lt_tasks SET project_id=null WHERE id='e9000000-0000-0000-0000-000000000002';RAISE EXCEPTION 'project cleared';EXCEPTION WHEN not_null_violation OR insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'event deletion and task project: permissions, confirmation, stale scale, full backup/restore and required project passed; fixtures rolled back' AS result;
