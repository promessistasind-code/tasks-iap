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
SET LOCAL ROLE authenticated;
DO $$
DECLARE owner_id uuid:='e1000000-0000-0000-0000-000000000001';member_id uuid:='e1000000-0000-0000-0000-000000000003';replacement uuid:='e1000000-0000-0000-0000-000000000004'; outsider uuid:='e1000000-0000-0000-0000-000000000005';
 eid uuid;aid uuid;sid uuid;nid uuid; qid uuid; mid uuid:=current_setting('test.mid1')::uuid;
 args jsonb:=jsonb_build_object('title','Central fixture','ministryId',mid,'startsAt',now()+interval '2 days','endsAt',now()+interval '2 days 2 hours'); notices jsonb; decision text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 eid:=(public.event_portal('save',args)->>'id')::uuid;
 PERFORM set_config('test.eid',eid::text,true);
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid,'personId',member_id,'functionId',current_setting('test.fid1')));
 PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
 aid:=(public.assignment_notifications()->0->>'id')::uuid;
 PERFORM public.people_portal('requestChange',jsonb_build_object('personId',member_id,'message','Teste da central'));
 SELECT (x->>'id')::uuid INTO qid FROM jsonb_array_elements(public.request_center('mine',0)) x WHERE x->>'kind'='profile';
 IF qid IS NULL THEN RAISE EXCEPTION 'Missing profile request'; END IF;
 FOREACH decision IN ARRAY ARRAY['reject','approve'] LOOP
  PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
  PERFORM public.scheduling_portal('requestSwap',jsonb_build_object('eventId',eid,'assignmentId',aid,'replacementId',replacement));
  SELECT (x->>'id')::uuid INTO STRICT sid FROM jsonb_array_elements(public.request_center('mine',0)) x WHERE x->>'status'='pending' AND x->>'kind'='swap' AND (x->>'can_cancel')::boolean;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  IF public.request_center('review',0)<>'[]' OR public.request_center('mine',0)<>'[]' THEN RAISE EXCEPTION 'Request leak'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  IF NOT public.request_center('review',0) @> jsonb_build_array(jsonb_build_object('id',sid,'can_approve',true)) THEN RAISE EXCEPTION 'Reviewer missing'; END IF;
  PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',eid,'swapId',sid,'decision',decision));
  PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
  SELECT (x->>'id')::uuid INTO STRICT nid FROM jsonb_array_elements(public.schedule_notifications()) x WHERE x->>'kind'=CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  PERFORM public.schedule_notifications(nid);
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM public.people_portal('resolveRequest',jsonb_build_object('id',qid));
END $$;
RESET ROLE;
UPDATE private.events SET starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour' WHERE id=current_setting('test.eid')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
DO $$ BEGIN IF (SELECT count(*) FROM jsonb_array_elements(public.schedule_notifications()) x WHERE x->>'kind'='time')<>1 THEN RAISE EXCEPTION 'Time notification'; END IF; END $$;
RESET ROLE;
UPDATE private.events SET cancelled=true WHERE id=current_setting('test.eid')::uuid;
UPDATE private.events SET cancelled=true WHERE id=current_setting('test.eid')::uuid;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF jsonb_array_length(public.schedule_notifications())<>1 OR public.schedule_notifications()->0->>'kind'<>'cancelled' THEN RAISE EXCEPTION 'Cancellation not deduplicated'; END IF; END $$;
RESET ROLE;
UPDATE private.ministry_members SET active=false WHERE person_id='e1000000-0000-0000-0000-000000000004';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF public.schedule_notifications()<>'[]' THEN RAISE EXCEPTION 'Revoked membership leak'; END IF; END $$;
RESET ROLE;
ROLLBACK;
SELECT 'request center and notifications passed' AS result;
