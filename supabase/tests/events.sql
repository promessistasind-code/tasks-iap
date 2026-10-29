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
 e:=public.event_portal('detail',jsonb_build_object('eventId',eid));
 IF jsonb_array_length(e->'assignments')<>1 THEN RAISE EXCEPTION 'duplicate assignment';END IF;
 aid:=(e->'assignments'->0->>'id')::uuid;
 PERFORM set_config('test.aid',aid::text,true);
 -- Another ministry leader can read and add its own people, but cannot edit owner or scale.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 e:=public.event_portal('detail',jsonb_build_object('eventId',eid));
 IF (e->'event'->>'canManage')::boolean THEN RAISE EXCEPTION 'shared leader manages owner';END IF;
 BEGIN PERFORM public.event_portal('save',payload||jsonb_build_object('id',eid,'version',1));RAISE EXCEPTION 'shared leader edited';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('unassign',jsonb_build_object('eventId',eid,'assignmentId',aid));RAISE EXCEPTION 'shared leader removed owner assignment';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','confirmed'));RAISE EXCEPTION 'leader impersonated respondent';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('candidates',jsonb_build_object('eventId',eid,'ministryId',mid1));RAISE EXCEPTION 'shared leader read owner candidates';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid2,'personId','e1000000-0000-0000-0000-000000000004','functionId',current_setting('test.fid2')));
 BEGIN PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid2,'personId','e1000000-0000-0000-0000-000000000004','functionId',current_setting('test.fid1')));RAISE EXCEPTION 'wrong function accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='wrong function accepted' THEN RAISE;END IF;END;
 -- Member may only answer own assignment.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','confirmed'));
 e:=public.event_portal('detail',jsonb_build_object('eventId',eid));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e->'assignments') x WHERE x->>'id'=aid::text AND x->>'response'='confirmed') THEN RAISE EXCEPTION 'response not saved';END IF;
 BEGIN PERFORM public.event_portal('save',payload);RAISE EXCEPTION 'member created event';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',mid1));RAISE EXCEPTION 'member assigned';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',(SELECT x->>'id' FROM jsonb_array_elements(e->'assignments') x WHERE x->>'id'<>aid::text LIMIT 1),'response','declined'));RAISE EXCEPTION 'member responded for another';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','declined'));
 -- An unlinked account sees neither list nor details; direct access is forbidden.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000005',true);
 IF jsonb_array_length(public.event_portal('list','{"start":"2030-01-01","end":"2030-01-02"}')->'items')<>0 THEN RAISE EXCEPTION 'outsider sees event';END IF;
 BEGIN PERFORM public.event_portal('detail',jsonb_build_object('eventId',eid));RAISE EXCEPTION 'outsider detail access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM count(*) FROM private.events;RAISE EXCEPTION 'direct table access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- Owner revokes sharing, version protects edits, cancellation blocks responses.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 PERFORM public.event_portal('save',payload||jsonb_build_object('id',eid,'version',1,'sharedWith','[]'::jsonb,'startsAt','2030-01-01T17:00:00Z'));
 e:=public.event_portal('detail',jsonb_build_object('eventId',eid));
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(e->'assignments') x WHERE x->>'response'<>'pending') THEN RAISE EXCEPTION 'Schedule change kept old RSVP';END IF;
 BEGIN PERFORM public.event_portal('save',payload||jsonb_build_object('id',eid,'version',1));RAISE EXCEPTION 'stale version accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale version accepted' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 BEGIN PERFORM public.event_portal('detail',jsonb_build_object('eventId',eid));RAISE EXCEPTION 'revoked share access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 PERFORM public.event_portal('save',payload||jsonb_build_object('id',eid,'version',2,'cancelled',true));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 BEGIN PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','confirmed'));RAISE EXCEPTION 'cancelled event response';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.event_portal('list','{}');RAISE EXCEPTION 'anonymous access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'events security tests passed; all fixtures rolled back' AS result;
