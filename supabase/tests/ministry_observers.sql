-- All fixtures and writes are rolled back, including audit rows.
BEGIN;
INSERT INTO auth.users(id,email) SELECT ('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'event-test-'||i||'@example.invalid' FROM generate_series(1,7)i;
INSERT INTO public.profiles(id,email,name,initials,is_admin) SELECT id,email,'Event Test','ET',false FROM auth.users WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at) SELECT id,id,'Event','Test',email,'11999999999','1990-01-01',now() FROM public.profiles WHERE email LIKE 'event-test-%@example.invalid';
INSERT INTO private.general_admins VALUES('e1000000-0000-0000-0000-000000000001');
UPDATE public.profiles SET is_admin=true WHERE id='e1000000-0000-0000-0000-000000000001';
SELECT set_config('test.pastor',(SELECT id::text FROM private.ministries WHERE name='Pastor'),true);
SELECT set_config('test.secretaria',(SELECT id::text FROM private.ministries WHERE name='Secretaria'),true);
SELECT set_config('test.ensino',(SELECT id::text FROM private.ministries WHERE name='Ministério de Ensino'),true);
SELECT set_config('test.celebracao',(SELECT id::text FROM private.ministries WHERE name='Ministério de Celebração'),true);
SELECT set_config('test.mensageiro',(SELECT f.id::text FROM private.ministry_functions f WHERE f.ministry_id=current_setting('test.ensino')::uuid AND lower(f.name)='mensageiro'),true);
SELECT set_config('test.professor',(SELECT f.id::text FROM private.ministry_functions f WHERE f.ministry_id=current_setting('test.ensino')::uuid AND lower(f.name)='professor'),true);
INSERT INTO private.ministry_members(person_id,ministry_id,added_by) VALUES
 ('e1000000-0000-0000-0000-000000000002',current_setting('test.pastor')::uuid,'e1000000-0000-0000-0000-000000000001'),
 ('e1000000-0000-0000-0000-000000000007',current_setting('test.pastor')::uuid,'e1000000-0000-0000-0000-000000000001'),
 ('e1000000-0000-0000-0000-000000000003',current_setting('test.secretaria')::uuid,'e1000000-0000-0000-0000-000000000001');
INSERT INTO private.ministry_members(person_id,ministry_id,function_ids,added_by) VALUES
 ('e1000000-0000-0000-0000-000000000004',current_setting('test.ensino')::uuid,ARRAY[current_setting('test.mensageiro')::uuid],'e1000000-0000-0000-0000-000000000001'),
 ('e1000000-0000-0000-0000-000000000005',current_setting('test.ensino')::uuid,ARRAY[current_setting('test.professor')::uuid],'e1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lt_projects(id,name,color,emoji,created_by,ministry_id) VALUES('e9000000-0000-0000-0000-000000000001','Observer project fixture','#fff','folder',auth.uid(),current_setting('test.celebracao')::uuid);
INSERT INTO public.lt_tasks(id,title,project_id) VALUES('e9000000-0000-0000-0000-000000000002','Observer task fixture','e9000000-0000-0000-0000-000000000001');
DO $$ DECLARE other_e uuid;teaching_e uuid;pastor_e uuid;args jsonb;detail jsonb;aid uuid;BEGIN
 args:=jsonb_build_object('title','Observer event fixture','startsAt','2032-01-01T18:00:00Z','endsAt','2032-01-01T20:00:00Z','sharedWith','[]'::jsonb);
 other_e:=(public.event_portal('save',args||jsonb_build_object('ministryId',current_setting('test.celebracao')))->>'id')::uuid;
 teaching_e:=(public.event_portal('save',args||jsonb_build_object('ministryId',current_setting('test.ensino')))->>'id')::uuid;
 PERFORM set_config('test.other_e',other_e::text,true);
 -- Pastor reads unrelated projects and events, but cannot write them.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 IF NOT EXISTS(SELECT 1 FROM public.lt_projects WHERE id='e9000000-0000-0000-0000-000000000001') OR NOT EXISTS(SELECT 1 FROM public.lt_tasks WHERE id='e9000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'pastor cannot read project/tasks';END IF;
 detail:=public.event_portal('detail',jsonb_build_object('eventId',other_e));
 IF (detail->'event'->>'canManage')::boolean THEN RAISE EXCEPTION 'pastor can manage unrelated event';END IF;
 UPDATE public.lt_projects SET name='Forbidden' WHERE id='e9000000-0000-0000-0000-000000000001';IF FOUND THEN RAISE EXCEPTION 'pastor edited project';END IF;
 UPDATE public.lt_tasks SET title='Forbidden' WHERE id='e9000000-0000-0000-0000-000000000002';IF FOUND THEN RAISE EXCEPTION 'pastor edited task';END IF;
 BEGIN PERFORM public.event_portal('save',args||jsonb_build_object('id',other_e,'version',1));RAISE EXCEPTION 'pastor edited unrelated event';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.lt_tasks(title,project_id) VALUES('Forbidden','e9000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'pastor created task';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('save',args||jsonb_build_object('ministryId',current_setting('test.celebracao')));RAISE EXCEPTION 'pastor created other ministry event';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 pastor_e:=(public.event_portal('save',args||jsonb_build_object('title','Pastor own fixture','ministryId',current_setting('test.pastor'),'startsAt','2032-02-01T18:00:00Z','endsAt','2032-02-01T20:00:00Z'))->>'id')::uuid;
 PERFORM set_config('test.pastor_e',pastor_e::text,true);
 detail:=public.event_portal('pastorCandidates',jsonb_build_object('eventId',pastor_e));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(detail) x WHERE x->>'id'='e1000000-0000-0000-0000-000000000004') OR EXISTS(SELECT 1 FROM jsonb_array_elements(detail) x WHERE x->>'id'='e1000000-0000-0000-0000-000000000005') THEN RAISE EXCEPTION 'pastor candidates not restricted to Mensageiro';END IF;
 BEGIN PERFORM public.event_portal('pastorAssign',jsonb_build_object('eventId',pastor_e,'personId','e1000000-0000-0000-0000-000000000005'));RAISE EXCEPTION 'professor assigned as messenger';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.event_portal('pastorAssign',jsonb_build_object('eventId',pastor_e,'personId','e1000000-0000-0000-0000-000000000004'));
 detail:=public.event_portal('detail',jsonb_build_object('eventId',pastor_e));
 IF NOT (detail->'event'->>'canManage')::boolean OR NOT (detail->'event'->>'canPastorSchedule')::boolean THEN RAISE EXCEPTION 'own event controls missing';END IF;
 aid:=(detail->'assignments'->0->>'id')::uuid;
 -- Another pastor can only read this pastor's event.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000007',true);
 IF (public.event_portal('detail',jsonb_build_object('eventId',pastor_e))->'event'->>'canManage')::boolean THEN RAISE EXCEPTION 'other pastor manages';END IF;
 BEGIN PERFORM public.event_portal('pastorAssign',jsonb_build_object('eventId',pastor_e,'personId','e1000000-0000-0000-0000-000000000004'));RAISE EXCEPTION 'other pastor assigns';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- Assigned Mensageiro can view/respond even without sharing all Pastor events with Ensino.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
 PERFORM public.event_portal('respond',jsonb_build_object('eventId',pastor_e,'assignmentId',aid,'response','confirmed'));
 detail:=public.event_portal('list',jsonb_build_object('start','2032-01-01','end','2032-03-01','assignedMinistry',current_setting('test.ensino')));
 IF jsonb_array_length(detail->'items')<>1 OR detail->'items'->0->>'id'<>pastor_e::text THEN RAISE EXCEPTION 'ministry list includes unassigned or misses pastoral assignment';END IF;
 detail:=public.event_portal('list',jsonb_build_object('start','2032-01-01','end','2032-03-01'));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'items') item WHERE item->>'id'=teaching_e::text) THEN RAISE EXCEPTION 'calendar lost unassigned ministry event';END IF;
 -- Secretaria global read does not grant writes or the pastor exception.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 PERFORM public.event_portal('detail',jsonb_build_object('eventId',other_e));
 IF NOT EXISTS(SELECT 1 FROM public.lt_projects WHERE id='e9000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'secretaria cannot view projects';END IF;
 UPDATE public.lt_projects SET name='Forbidden' WHERE id='e9000000-0000-0000-0000-000000000001';IF FOUND THEN RAISE EXCEPTION 'secretaria edited project';END IF;
 DELETE FROM public.lt_tasks WHERE id='e9000000-0000-0000-0000-000000000002';IF FOUND THEN RAISE EXCEPTION 'secretaria deleted task';END IF;
 BEGIN PERFORM public.event_portal('save',args||jsonb_build_object('ministryId',current_setting('test.secretaria')));RAISE EXCEPTION 'secretaria created event';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.event_portal('pastorAssign',jsonb_build_object('eventId',pastor_e,'personId','e1000000-0000-0000-0000-000000000004'));RAISE EXCEPTION 'secretaria assigned messenger';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
UPDATE private.ministry_members SET function_ids=array_append(function_ids,current_setting('test.mensageiro')::uuid) WHERE person_id='e1000000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
DO $$ DECLARE aid uuid;sid uuid;BEGIN
 aid:=(public.event_portal('detail',jsonb_build_object('eventId',current_setting('test.pastor_e')))->'assignments'->0->>'id')::uuid;
 PERFORM public.scheduling_portal('requestSwap',jsonb_build_object('eventId',current_setting('test.pastor_e'),'assignmentId',aid,'replacementId','e1000000-0000-0000-0000-000000000005'));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 sid:=(public.scheduling_portal('state',jsonb_build_object('eventId',current_setting('test.pastor_e')))->'swaps'->0->>'id')::uuid;
 IF sid IS NULL THEN RAISE EXCEPTION 'pastor cannot see own messenger swap';END IF;
 PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',current_setting('test.pastor_e'),'swapId',sid,'decision','approve'));
 PERFORM public.scheduling_portal('repeat',jsonb_build_object('eventId',current_setting('test.pastor_e'),'version',1,'frequency','weekly','count',2,'timezone','America/Sao_Paulo','copyAssignments',true,'confirmed',true));
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.events e JOIN private.event_assignments a ON a.event_id=e.id WHERE e.series_id=(SELECT series_id FROM private.events WHERE id=current_setting('test.pastor_e')::uuid) AND a.active AND a.person_id='e1000000-0000-0000-0000-000000000005')<>2 THEN RAISE EXCEPTION 'pastor series did not copy messenger';END IF;
END $$;
UPDATE private.ministry_members SET active=false WHERE person_id='e1000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.lt_projects WHERE id='e9000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'revoked observer still reads';END IF;
 BEGIN PERFORM public.event_portal('detail',jsonb_build_object('eventId',current_setting('test.other_e')));RAISE EXCEPTION 'revoked observer sees event';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'observer and pastor tests passed: global read only, revocation, own-event exception, messenger eligibility, assignment-only ministry list and full ministry calendar; fixtures rolled back' AS result;
