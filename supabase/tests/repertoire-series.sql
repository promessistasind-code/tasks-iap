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
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE eid uuid;aid uuid;sid uuid;period uuid;preview jsonb;args jsonb;snap jsonb;BEGIN
 eid:=(public.event_portal('save',jsonb_build_object('ministryId',current_setting('test.mid1'),'title','Workflow fixture','startsAt','2030-01-31T18:00:00Z','endsAt','2030-01-31T20:00:00Z','sharedWith',jsonb_build_array(current_setting('test.mid2'))))->>'id')::uuid;
 PERFORM set_config('test.eid',eid::text,true);

 PERFORM public.repertoire_portal('configure',jsonb_build_object('eventId',eid,'enabled',true));
 PERFORM public.repertoire_portal('save',jsonb_build_object('eventId',eid,'version',0,'songs','[{"title":"Teste","key":"C","version":"","chords":"C G","url":""}]'::jsonb,'script','Roteiro original'));

 args:=jsonb_build_object('eventId',eid,'version',1,'frequency','monthly','count',3,'timezone','America/Sao_Paulo','copyAssignments',false,'copyRepertoire',true,'repertoireVersion',1,'confirmed',true);
 preview:=public.scheduling_portal('repeatPreview',args);
 IF (preview->1->>'startsAt')::timestamptz<>'2030-02-28T18:00:00Z'::timestamptz OR (preview->2->>'startsAt')::timestamptz<>'2030-03-31T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'monthly dates drift';END IF;

 BEGIN PERFORM public.scheduling_portal('repeat',args||'{"repertoireVersion":0}'); RAISE EXCEPTION 'stale repertoire'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale repertoire' THEN RAISE; END IF; END;
 PERFORM public.scheduling_portal('repeat',args);
 BEGIN PERFORM public.scheduling_portal('repeat',args);RAISE EXCEPTION 'duplicate series allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM='duplicate series allowed' THEN RAISE;END IF;END;
 -- Ineligible person must be rejected by the new wrapper before any write.
 BEGIN PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',current_setting('test.mid1'),'personId','e1000000-0000-0000-0000-000000000005','functionId',current_setting('test.fid1')));RAISE EXCEPTION 'ineligible assigned';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',eid,'ministryId',current_setting('test.mid1'),'personId','e1000000-0000-0000-0000-000000000003','functionId',current_setting('test.fid1')));
 aid:=(public.event_portal('detail',jsonb_build_object('eventId',eid))->'assignments'->0->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','confirmed'));
 PERFORM public.scheduling_portal('availabilityAdd','{"startsAt":"2030-01-31T19:00:00Z","endsAt":"2030-01-31T21:00:00Z","frequency":"weekly","count":2,"timezone":"America/Sao_Paulo"}');
 preview:=public.scheduling_portal('availabilityList');
 IF jsonb_array_length(preview)<>2 THEN RAISE EXCEPTION 'availability recurrence missing';END IF;
 period:=(preview->0->>'id')::uuid;
 IF public.event_portal('detail',jsonb_build_object('eventId',eid))->'assignments'->0->>'response'<>'pending' THEN RAISE EXCEPTION 'conflict kept confirmed response';END IF;
 BEGIN PERFORM public.event_portal('respond',jsonb_build_object('eventId',eid,'assignmentId',aid,'response','confirmed'));RAISE EXCEPTION 'unavailable confirmed';EXCEPTION WHEN raise_exception THEN IF SQLERRM='unavailable confirmed' THEN RAISE;END IF;END;
 -- Another account cannot inspect or remove my availability.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
 IF jsonb_array_length(public.scheduling_portal('availabilityList'))<>0 THEN RAISE EXCEPTION 'private availability leaked';END IF;
 BEGIN PERFORM public.scheduling_portal('availabilityCancel',jsonb_build_object('id',period));RAISE EXCEPTION 'other removed availability';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 PERFORM public.scheduling_portal('requestSwap',jsonb_build_object('eventId',eid,'assignmentId',aid,'replacementId','e1000000-0000-0000-0000-000000000004'));
 sid:=(public.scheduling_portal('state',jsonb_build_object('eventId',eid))->'swaps'->0->>'id')::uuid;
 BEGIN PERFORM public.scheduling_portal('requestSwap',jsonb_build_object('eventId',eid,'assignmentId',aid,'replacementId','e1000000-0000-0000-0000-000000000004'));RAISE EXCEPTION 'duplicate request';EXCEPTION WHEN unique_violation THEN NULL;END;
 BEGIN PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',eid,'swapId',sid,'decision','approve'));RAISE EXCEPTION 'member approved own request';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
 BEGIN PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',eid,'swapId',sid,'decision','approve'));RAISE EXCEPTION 'shared leader approved other scale';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- Substitute becomes unavailable after request: approval must revalidate.
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
 PERFORM public.scheduling_portal('availabilityAdd','{"startsAt":"2030-01-31T19:00:00Z","endsAt":"2030-01-31T21:00:00Z","frequency":"none","count":1,"timezone":"America/Sao_Paulo"}');
 period:=(public.scheduling_portal('availabilityList')->0->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 BEGIN PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',eid,'swapId',sid,'decision','approve'));RAISE EXCEPTION 'unavailable substitute approved';EXCEPTION WHEN raise_exception THEN IF SQLERRM='unavailable substitute approved' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',true);
 PERFORM public.scheduling_portal('availabilityCancel',jsonb_build_object('id',period));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 PERFORM public.scheduling_portal('decideSwap',jsonb_build_object('eventId',eid,'swapId',sid,'decision','approve'));
 preview:=public.event_portal('detail',jsonb_build_object('eventId',eid));
 IF jsonb_array_length(preview->'assignments')<>1 OR preview->'assignments'->0->>'personId'<>'e1000000-0000-0000-0000-000000000004' OR preview->'assignments'->0->>'response'<>'pending' THEN RAISE EXCEPTION 'swap not atomic/pending';END IF;
 -- Backup and deletion must include swap history.
 snap:=public.delete_event_safely('preview',jsonb_build_object('eventId',eid));
 IF jsonb_array_length(snap->'swaps')<>1 OR jsonb_array_length(snap->'assignments')<>2 THEN RAISE EXCEPTION 'incomplete event backup';END IF;
 PERFORM set_config('test.snapshot',snap::text,true);
 PERFORM public.delete_event_safely('remove',jsonb_build_object('eventId',eid,'snapshot',snap,'confirmed',true));
END $$;
DO $$ DECLARE e2 uuid;BEGIN
 e2:=(public.event_portal('save',jsonb_build_object('ministryId',current_setting('test.mid1'),'title','Atomic series fixture','startsAt','2031-01-01T18:00:00Z','endsAt','2031-01-01T20:00:00Z'))->>'id')::uuid;
 PERFORM set_config('test.atomic_eid',e2::text,true);
 PERFORM public.event_portal('assign',jsonb_build_object('eventId',e2,'ministryId',current_setting('test.mid1'),'personId','e1000000-0000-0000-0000-000000000003','functionId',current_setting('test.fid1')));
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
 PERFORM public.scheduling_portal('availabilityAdd','{"startsAt":"2031-01-08T18:00:00Z","endsAt":"2031-01-08T20:00:00Z","frequency":"none","count":1,"timezone":"America/Sao_Paulo"}');
 PERFORM set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
 BEGIN PERFORM public.scheduling_portal('repeat',jsonb_build_object('eventId',e2,'version',1,'frequency','weekly','count',3,'timezone','America/Sao_Paulo','copyAssignments',true,'confirmed',true));RAISE EXCEPTION 'conflicting series copied';EXCEPTION WHEN raise_exception THEN IF SQLERRM='conflicting series copied' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.events WHERE title='Atomic series fixture')<>1 OR (SELECT series_id IS NOT NULL FROM private.events WHERE id=current_setting('test.atomic_eid')::uuid) THEN RAISE EXCEPTION 'series rollback incomplete';END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',true);
DO $$ DECLARE u jsonb;BEGIN
 FOR u IN SELECT value FROM jsonb_array_elements(public.scheduling_portal('availabilityList')) LOOP
  IF (u->>'starts_at')::timestamptz>='2031-01-01' THEN PERFORM public.scheduling_portal('availabilityCancel',jsonb_build_object('id',u->>'id'));END IF;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
SELECT public.scheduling_portal('repeat',jsonb_build_object('eventId',current_setting('test.atomic_eid'),'version',1,'frequency','weekly','count',3,'timezone','America/Sao_Paulo','copyAssignments',true,'confirmed',true));
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.event_assignments a JOIN private.events e ON e.id=a.event_id WHERE e.title='Atomic series fixture' AND a.active AND a.response='pending')<>3 THEN RAISE EXCEPTION 'series scale copies missing or confirmed';END IF;
END $$;
DO $$ DECLARE snap jsonb:=current_setting('test.snapshot')::jsonb;BEGIN
 INSERT INTO private.events SELECT * FROM jsonb_populate_record(NULL::private.events,snap->'event');
 INSERT INTO private.event_assignments SELECT * FROM jsonb_populate_recordset(NULL::private.event_assignments,snap->'assignments');
 INSERT INTO private.scale_swaps SELECT * FROM jsonb_populate_recordset(NULL::private.scale_swaps,snap->'swaps');
 IF public.delete_event_safely('preview',jsonb_build_object('eventId',current_setting('test.eid'))) IS DISTINCT FROM snap THEN RAISE EXCEPTION 'workflow restore mismatch';END IF;
 IF private.schedule_time('2030-03-03 14:00Z','America/New_York','weekly',1)<>'2030-03-10 13:00Z'::timestamptz THEN RAISE EXCEPTION 'DST wall time not preserved';END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT public.scheduling_portal('cancelSeries',jsonb_build_object('eventId',current_setting('test.eid'),'confirmed',true));
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.events WHERE series_id=(SELECT series_id FROM private.events WHERE id=current_setting('test.eid')::uuid) AND NOT cancelled) THEN RAISE EXCEPTION 'series cancellation incomplete';END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.scheduling_portal('availabilityList');RAISE EXCEPTION 'anonymous access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ DECLARE n integer; target uuid; BEGIN
 SELECT count(*) INTO n FROM private.event_repertoires r JOIN private.events e ON e.id=r.event_id WHERE e.series_id=(SELECT series_id FROM private.events WHERE id=current_setting('test.eid')::uuid) AND r.script='Roteiro original';
 -- The regression may delete the source event; assert copies by fixture title instead.
 SELECT count(*) INTO n FROM private.event_repertoires r JOIN private.events e ON e.id=r.event_id WHERE e.title='Workflow fixture' AND r.script='Roteiro original';
 IF n<2 THEN RAISE EXCEPTION 'missing copies'; END IF;
 SELECT r.event_id INTO target FROM private.event_repertoires r JOIN private.events e ON e.id=r.event_id WHERE e.title='Workflow fixture' LIMIT 1;
 UPDATE private.event_repertoires SET script='Independent' WHERE event_id=target;
 IF NOT EXISTS(SELECT 1 FROM private.event_repertoires r JOIN private.events e ON e.id=r.event_id WHERE e.title='Workflow fixture' AND r.script='Roteiro original') THEN RAISE EXCEPTION 'copies linked'; END IF;
END $$;
ROLLBACK;
SELECT 'scheduling workflows security, recurrence, DST, privacy, conflicts, swap approval and complete backup restore passed; fixtures rolled back' AS result;
