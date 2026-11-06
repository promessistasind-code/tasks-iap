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
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE e jsonb; a jsonb; eid uuid; aid uuid; payload jsonb; mid1 uuid:=current_setting('test.mid1')::uuid;mid2 uuid:=current_setting('test.mid2')::uuid;
BEGIN
 payload:=jsonb_build_object('ministryId',mid1,'title','Event fixture','startsAt','2030-01-01T18:00:00Z','endsAt','2030-01-01T20:00:00Z','sharedWith',jsonb_build_array(mid2));
 eid:=(public.event_portal('save',payload)->>'id')::uuid;
 PERFORM set_config('test.eid',eid::text,true);
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid1,'personId','e1000000-0000-0000-0000-000000000003','functionId',current_setting('test.fid1')));
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid1,'personId','e1000000-0000-0000-0000-000000000003','functionId',current_setting('test.fid1')));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 a:=public.assignment_notifications();
 IF jsonb_array_length(a)<>1 OR a->0->>'event_id' IS DISTINCT FROM eid::text THEN RAISE EXCEPTION 'Missing or duplicated notice'; END IF;
 aid:=(a->0->>'id')::uuid;
 PERFORM public.event_portal('detail',jsonb_build_object('eventId',eid));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000005',true);
 IF public.assignment_notifications(aid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Recipient isolation'; END IF;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 IF jsonb_array_length(public.assignment_notifications())<>1 THEN RAISE EXCEPTION 'Third party marked read'; END IF;
 IF public.assignment_notifications(aid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Still unread'; END IF;
 IF (public.event_portal('detail',jsonb_build_object('eventId',eid))->'assignments'->0->>'response') IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Reading changed response'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'assignment notifications passed' AS result;
