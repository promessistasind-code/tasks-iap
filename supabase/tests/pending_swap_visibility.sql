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
-- Give the replacement the same ministry/function as the requesting member.
INSERT INTO private.ministry_members(person_id,ministry_id,function_ids,added_by) VALUES('e1000000-0000-0000-0000-000000000004',current_setting('test.mid1')::uuid,ARRAY[current_setting('test.fid1')::uuid],'e1000000-0000-0000-0000-000000000001');
INSERT INTO private.general_admins VALUES('e1000000-0000-0000-0000-000000000001');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000001';
INSERT INTO private.ministry_members(person_id,ministry_id,function_ids,added_by) VALUES('e1000000-0000-0000-0000-000000000005',current_setting('test.mid1')::uuid,ARRAY[current_setting('test.fid1')::uuid],'e1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE eid uuid; aid uuid; sid uuid; owner_id uuid:='e1000000-0000-0000-0000-000000000001';
 member_id uuid:='e1000000-0000-0000-0000-000000000003'; sub_id uuid:='e1000000-0000-0000-0000-000000000004';peer_id uuid:='e1000000-0000-0000-0000-000000000005'; person uuid;
 args jsonb:=jsonb_build_object('ministryId',current_setting('test.mid1'),'functionId',current_setting('test.fid1'));
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 eid:=(public.event_portal('save',args||jsonb_build_object('title','Troca fixture','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 1 hour'))->>'id')::uuid;
 args:=args||jsonb_build_object('eventId',eid);
 FOREACH person IN ARRAY ARRAY[member_id,peer_id] LOOP
  PERFORM public.event_portal('assign',args||jsonb_build_object('personId',person));
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
 SELECT (x->>'id')::uuid INTO STRICT aid FROM jsonb_array_elements(public.event_portal('detail',args)->'assignments') x WHERE x->>'personId'=member_id::text;
 PERFORM public.event_portal('respond',args||jsonb_build_object('assignmentId',aid,'response','confirmed'));
 PERFORM public.scheduling_portal('requestSwap',args||jsonb_build_object('assignmentId',aid,'replacementId',sub_id));
 FOREACH person IN ARRAY ARRAY[member_id,peer_id,owner_id,sub_id] LOOP
  PERFORM set_config('request.jwt.claim.sub',person::text,true);
  IF (public.event_portal('detail',args)->'assignments' @> jsonb_build_array(jsonb_build_object('id',aid,'swapPending',true))) IS DISTINCT FROM (person<>sub_id) THEN RAISE EXCEPTION 'Badge visibility'; END IF;
  IF person<>owner_id AND public.schedule_notifications_v2() @> '[{"kind":"swap_requested"}]' THEN RAISE EXCEPTION 'Notice privacy'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 SELECT (x->>'id')::uuid INTO STRICT sid FROM jsonb_array_elements(public.schedule_notifications_v2()) x WHERE x->>'kind'='swap_requested' AND x->>'event_id'=eid::text;
 IF public.schedule_notifications_v2(sid) @> jsonb_build_array(jsonb_build_object('id',sid)) THEN RAISE EXCEPTION 'Read receipt failed'; END IF;
 IF NOT public.request_center('review') @> jsonb_build_array(jsonb_build_object('id',sid)) THEN RAISE EXCEPTION 'Reading decided request'; END IF;
 PERFORM public.scheduling_portal('decideSwap',args||jsonb_build_object('swapId',sid,'decision','reject'));
 IF public.event_portal('detail',args)->'assignments' @> '[{"swapPending":true}]' THEN RAISE EXCEPTION 'Stale badge'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'swap badge and reviewer notification passed' AS result;
