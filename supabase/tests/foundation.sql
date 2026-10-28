-- Runs in a surrounding transaction and is always rolled back by the runner.
INSERT INTO auth.users(id,email) VALUES
('10000000-0000-0000-0000-000000000001','foundation-owner@example.invalid'),
('10000000-0000-0000-0000-000000000002','foundation-member@example.invalid'),
('10000000-0000-0000-0000-000000000003','foundation-outsider@example.invalid');
INSERT INTO public.profiles(id,email,name,initials) SELECT id,email,'Foundation test','FT' FROM auth.users WHERE email LIKE 'foundation-%@example.invalid';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lt_projects(id,name,color,emoji,created_by) VALUES
('20000000-0000-0000-0000-000000000001','Foundation test','#fff','folder',auth.uid());
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.lt_project_members WHERE project_id='20000000-0000-0000-0000-000000000001' AND user_id=auth.uid() AND role='owner') THEN RAISE EXCEPTION 'Owner enrollment failed'; END IF;
END $$;
INSERT INTO public.lt_notes(id,title) VALUES('30000000-0000-0000-0000-000000000001','Private test');
INSERT INTO public.lt_tasks(id,title,project_id,recurring,due_date,assignee)
VALUES('40000000-0000-0000-0000-000000000001','Recurring test','20000000-0000-0000-0000-000000000001','monthly','2026-01-31','Owner');
INSERT INTO public.lt_task_checklist(task_id,text,done,position) VALUES('40000000-0000-0000-0000-000000000001','Copy me',true,0);
UPDATE public.lt_tasks SET status='done' WHERE id='40000000-0000-0000-0000-000000000001';
UPDATE public.lt_tasks SET status='todo' WHERE id='40000000-0000-0000-0000-000000000001';
UPDATE public.lt_tasks SET status='done' WHERE id='40000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.lt_tasks WHERE recurrence_source_id='40000000-0000-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'Duplicate recurrence'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lt_tasks t JOIN public.lt_task_checklist c ON c.task_id=t.id WHERE t.recurrence_source_id='40000000-0000-0000-0000-000000000001' AND t.due_date='2026-02-28' AND t.assignee='Owner' AND c.text='Copy me' AND NOT c.done) THEN RAISE EXCEPTION 'Recurrence payload/checklist mismatch'; END IF;
  BEGIN
    INSERT INTO public.lt_tasks(title,project_id,recurrence_source_id) VALUES('Spoof','20000000-0000-0000-0000-000000000001',gen_random_uuid());
    RAISE EXCEPTION 'Recurrence spoof allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
SELECT public.send_project_invite('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.lt_notifications WHERE project_id='20000000-0000-0000-0000-000000000001' AND status='pending')<>1 THEN RAISE EXCEPTION 'Duplicate invite'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.lt_notes WHERE id='30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Private note leaked'; END IF;
  IF EXISTS(SELECT 1 FROM public.lt_projects WHERE id='20000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Project leaked'; END IF;
  BEGIN
    INSERT INTO public.lt_project_members(project_id,user_id) VALUES('20000000-0000-0000-0000-000000000001',auth.uid());
    RAISE EXCEPTION 'Self enrollment allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.send_project_invite('20000000-0000-0000-0000-000000000001',auth.uid());
    RAISE EXCEPTION 'Unauthorized invite allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.lt_notes(title,user_id) VALUES('Spoofed','10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Note ownership spoof allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.lt_notes SET title='stolen' WHERE id='30000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Foreign note updated'; END IF;
  DELETE FROM public.lt_notes WHERE id='30000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Foreign note deleted'; END IF;
END $$;
RESET ROLE;
-- Capture invitation ID without exposing it to unauthorized SELECT policies.
SELECT set_config('foundation.invite',(SELECT id::text FROM public.lt_notifications WHERE project_id='20000000-0000-0000-0000-000000000001' AND status='pending'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.respond_project_invite(current_setting('foundation.invite')::uuid,true);
    RAISE EXCEPTION 'Foreign invitation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT public.respond_project_invite(current_setting('foundation.invite')::uuid,true);
SELECT public.respond_project_invite(current_setting('foundation.invite')::uuid,true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.lt_project_members WHERE project_id='20000000-0000-0000-0000-000000000001' AND user_id=auth.uid())<>1 THEN RAISE EXCEPTION 'Acceptance not idempotent'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lt_notifications WHERE id=current_setting('foundation.invite')::uuid AND status='accepted') THEN RAISE EXCEPTION 'Acceptance not atomic'; END IF;
  BEGIN
    UPDATE public.lt_notifications SET recipient_id='10000000-0000-0000-0000-000000000003' WHERE id=current_setting('foundation.invite')::uuid;
    RAISE EXCEPTION 'Notification tamper allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Even administrators must not see another user's notes.
RESET ROLE;
UPDATE public.profiles SET is_admin=true WHERE id='10000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.lt_notes WHERE id='30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Admin note leak'; END IF;
END $$;
RESET ROLE;
