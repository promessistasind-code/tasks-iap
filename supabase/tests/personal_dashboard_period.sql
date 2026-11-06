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
INSERT INTO private.ministry_members(person_id,ministry_id,function_ids,added_by) VALUES ('e1000000-0000-0000-0000-000000000003',current_setting('test.mid2')::uuid,ARRAY[current_setting('test.fid2')::uuid],'e1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
DO $$ DECLARE eid uuid; payload jsonb; rows_seen int; counted int; BEGIN
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 payload:=jsonb_build_object('ministryId',current_setting('test.mid1'),'title','Dashboard fixture','startsAt','2031-06-01T10:00Z','endsAt','2031-06-01T12:00Z','sharedWith',jsonb_build_array(current_setting('test.mid2')));
 eid:=(public.event_portal('save',payload)->>'id')::uuid;
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',current_setting('test.mid1'),'functionId',current_setting('test.fid1'),'personId','e1000000-0000-0000-0000-000000000003'));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 SELECT count(*),sum(events_count) INTO rows_seen,counted FROM public.my_ministry_scale_counts('2031-06-01','2031-06-02');
 IF rows_seen<>2 OR counted<>1 THEN RAISE EXCEPTION 'Incorrect personal totals'; END IF;
 IF EXISTS(SELECT 1 FROM public.my_ministry_scale_counts('2031-06-01T12:00Z','2031-06-02') WHERE events_count<>0) THEN RAISE EXCEPTION 'Period boundary'; END IF;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 IF EXISTS(SELECT 1 FROM public.my_ministry_scale_counts('2031-06-01','2031-06-02')) THEN RAISE EXCEPTION 'Unexpected report'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'dashboard role eligibility, personal counts and boundaries passed' AS result;
