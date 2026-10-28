-- Run after task_permissions.sql, in the same BEGIN / ROLLBACK transaction.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
INSERT INTO public.lt_task_comments(id,task_id,text,author_id) VALUES('95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','Team comment',auth.uid());
DO $$ BEGIN
 BEGIN
  INSERT INTO public.lt_task_activity(task_id,text) VALUES('94000000-0000-0000-0000-000000000001','Forged history');
  RAISE EXCEPTION 'Team forged history';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.lt_task_comments(task_id,text,author_id) VALUES('94000000-0000-0000-0000-000000000001','Forged comment','91000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Comment author spoofed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
UPDATE public.lt_tasks SET status='done' WHERE id='94000000-0000-0000-0000-000000000001';
UPDATE public.lt_tasks SET status='todo' WHERE id='94000000-0000-0000-0000-000000000001';
UPDATE public.lt_tasks SET status='done' WHERE id='94000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.lt_tasks WHERE recurrence_source_id='94000000-0000-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'Recurrence not exactly once'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lt_tasks t JOIN public.lt_task_checklist c ON c.task_id=t.id WHERE t.recurrence_source_id='94000000-0000-0000-0000-000000000001' AND t.assignee_id=auth.uid() AND '91000000-0000-0000-0000-000000000003'=ANY(t.team_ids) AND t.due_date='2026-11-06' AND NOT c.done) THEN RAISE EXCEPTION 'Recurrence lost assignment, team or checklist'; END IF;
 BEGIN
  UPDATE public.lt_tasks SET team_ids=ARRAY['91000000-0000-0000-0000-000000000004']::uuid[] WHERE id='94000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Outsider assigned';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.lt_tasks SET created_by=auth.uid() WHERE id='94000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Creator overwritten';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Renaming to an existing display name must never transfer responsibility.
RESET ROLE;
UPDATE public.profiles SET name='Permissions 3' WHERE id='91000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.lt_tasks WHERE id='94000000-0000-0000-0000-000000000001' AND assignee_id='91000000-0000-0000-0000-000000000002' AND assignee='Permissions 3') THEN RAISE EXCEPTION 'Rename lost canonical assignment'; END IF;
END $$;
-- Removed ministry membership revokes responsible access if no explicit project access exists.
UPDATE private.ministry_members SET active=false WHERE person_id='91000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 UPDATE public.lt_tasks SET title='Forbidden after removal' WHERE id='94000000-0000-0000-0000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Removed member still edits'; END IF;
END $$;
RESET ROLE;
