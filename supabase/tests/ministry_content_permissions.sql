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
INSERT INTO private.general_admins VALUES ('e1000000-0000-0000-0000-000000000005');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
DO $$
DECLARE a uuid; b uuid; mid1 uuid:=current_setting('test.mid1')::uuid; mid2 uuid:=current_setting('test.mid2')::uuid;
 args jsonb:=jsonb_build_object('title','Permission test','startsAt','2032-03-04T12:00Z','endsAt','2032-03-04T13:00Z');
 period jsonb:= '{"start":"2032-03-01","end":"2032-04-01"}';
 song jsonb:='{"title":"Audit song","version":"","key":"","chords":"","url":""}'; data jsonb; grants jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 a:=(public.event_portal('save',args||jsonb_build_object('ministryId',mid1))->>'id')::uuid;
 IF NOT (public.event_portal('list',period||jsonb_build_object('assignedMinistry',mid1))->'items' @> jsonb_build_array(jsonb_build_object('id',a))) THEN RAISE EXCEPTION 'Leader feed'; END IF;
 PERFORM public.repertoire_portal('save',jsonb_build_object('eventId',a,'version',0,'songs',jsonb_build_array(song)));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 b:=(public.event_portal('save',args||jsonb_build_object('ministryId',mid2))->>'id')::uuid;
 IF NOT (public.repertoire_library_portal('list',jsonb_build_object('eventId',b,'search','Audit song')) @> jsonb_build_array(jsonb_build_object('song',song))) THEN RAISE EXCEPTION 'Shared library'; END IF;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 IF public.event_portal('list',period||jsonb_build_object('assignedMinistry',mid1))->'items' @> jsonb_build_array(jsonb_build_object('id',a)) THEN RAISE EXCEPTION 'Unassigned member'; END IF;
 grants:=jsonb_build_object('personId','e1000000-0000-0000-0000-000000000003','ministryId',mid1,'editScript',true,'editSongs',false,'active',true);
 BEGIN PERFORM public.save_content_membership(grants); RAISE EXCEPTION 'Self grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000005',true);
 IF NOT (public.event_portal('list',period||jsonb_build_object('assignedMinistry',mid1))->'items' @> jsonb_build_array(jsonb_build_object('id',a),jsonb_build_object('id',b))) THEN RAISE EXCEPTION 'Admin feed'; END IF;
 PERFORM public.save_content_membership(grants);
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 data:=public.repertoire_portal('save',jsonb_build_object('eventId',a,'version',1,'script','Opening'));
 IF data->'songs'<>jsonb_build_array(song) OR NOT (data->>'canEditScript')::boolean OR (data->>'canEditSongs')::boolean THEN RAISE EXCEPTION 'Separated permissions'; END IF;
 BEGIN PERFORM public.repertoire_portal('save',jsonb_build_object('eventId',a,'version',2,'songs','[]'::jsonb)); RAISE EXCEPTION 'Unauthorized music edit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000005',true);
 PERFORM public.save_content_membership(grants || '{"editSongs":true,"editScript":false}');
 BEGIN
  PERFORM public.save_content_membership(grants || jsonb_build_object('editSongs',true,'ministryId',(SELECT id FROM jsonb_to_recordset(public.people_portal('catalog')) AS m(id uuid,name text) WHERE name='Ministério de Ensino')));
  RAISE EXCEPTION 'Music grant outside the two ministries';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 data:=public.repertoire_portal('save',jsonb_build_object('eventId',a,'version',2,'songs',jsonb_build_array(song||'{"title":"Delegate song"}')));
 IF data->>'script'<>'Opening' THEN RAISE EXCEPTION 'Script lost'; END IF;
 BEGIN PERFORM public.repertoire_portal('save',jsonb_build_object('eventId',a,'version',3,'script','')); RAISE EXCEPTION 'Script permission not revoked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'permission matrix and shared library passed' AS result;
