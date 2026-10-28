-- Append to foundation.sql in the same rollback-only transaction.
UPDATE public.profiles SET is_admin=false WHERE id='10000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
SELECT public.cancel_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.lt_notifications WHERE project_id='20000000-0000-0000-0000-000000000001' AND recipient_id='10000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Cancel failed'; END IF;
END $$;
SELECT public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
SELECT set_config('foundation.invite',(SELECT id::text FROM public.lt_notifications WHERE project_id='20000000-0000-0000-0000-000000000001' AND recipient_id='10000000-0000-0000-0000-000000000003' AND status='pending'),true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT public.respond_project_invite(current_setting('foundation.invite')::uuid,false);
DO $$ BEGIN
  BEGIN
    PERFORM public.respond_project_invite(current_setting('foundation.invite')::uuid,true);
    RAISE EXCEPTION 'Dismissed invite accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
-- A delegated ministry leader loses both explicit and ministry access.
RESET ROLE;
INSERT INTO private.ministry_members(person_id,ministry_id,leader,added_by) SELECT id,'29000000-0000-0000-0000-000000000001',true,user_id FROM private.people WHERE user_id='10000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
RESET ROLE;
SELECT set_config('foundation.invite',(SELECT id::text FROM public.lt_notifications WHERE project_id='20000000-0000-0000-0000-000000000001' AND recipient_id='10000000-0000-0000-0000-000000000003' AND status='pending'),true);
UPDATE private.ministry_members SET active=false WHERE person_id=(SELECT id FROM private.people WHERE user_id='10000000-0000-0000-0000-000000000002');
DELETE FROM public.lt_project_members WHERE project_id='20000000-0000-0000-0000-000000000001' AND user_id='10000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.respond_project_invite(current_setting('foundation.invite')::uuid,true);
    RAISE EXCEPTION 'Revoked inviter accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.lt_project_members WHERE project_id='20000000-0000-0000-0000-000000000001' AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid invitation granted access'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_admin=true WHERE id='10000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
UPDATE public.lt_projects SET suspended=true WHERE id='20000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET is_admin=false WHERE id='10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
  UPDATE public.lt_tasks SET title='Blocked' WHERE id='40000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Suspended task updated'; END IF;
  BEGIN
    INSERT INTO public.lt_task_comments(task_id,text,author_id) VALUES('40000000-0000-0000-0000-000000000001','Blocked',auth.uid());
    RAISE EXCEPTION 'Suspended child written';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'Anonymous RPC allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
