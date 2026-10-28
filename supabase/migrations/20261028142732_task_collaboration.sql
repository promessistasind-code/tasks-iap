CREATE FUNCTION private.task_assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate uuid; candidates uuid[]; assignment_changed boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  IF pg_trigger_depth()<2 THEN NEW.created_by:=auth.uid(); END IF;
  IF NEW.assignee_id IS NULL AND NEW.assignee IS NULL THEN NEW.assignee_id:=auth.uid(); END IF;
 ELSE
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Task creator is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND NOT private.create_task_in(NEW.project_id) THEN RAISE EXCEPTION 'Destination project creation permission required' USING ERRCODE='42501'; END IF;
 END IF;
 -- Compatibility for old clients, rejecting ambiguous names rather than guessing.
 IF NEW.assignee_id IS NULL AND NEW.assignee IS NOT NULL THEN
  SELECT array_agg(id) INTO candidates FROM public.profiles WHERE name=NEW.assignee;
  IF cardinality(candidates) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Assignee must identify one account'; END IF;
  NEW.assignee_id:=candidates[1];
 ELSIF TG_OP='UPDATE' AND pg_trigger_depth()=1 AND NEW.assignee IS DISTINCT FROM OLD.assignee AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
  IF NEW.assignee IS NULL THEN NEW.assignee_id:=NULL;
  ELSE
   SELECT array_agg(id) INTO candidates FROM public.profiles WHERE name=NEW.assignee;
   IF cardinality(candidates) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Assignee must identify one account'; END IF;
   NEW.assignee_id:=candidates[1];
  END IF;
 END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}') INTO NEW.team_ids FROM unnest(NEW.team_ids) id WHERE id IS NOT NULL;
 IF cardinality(NEW.team_ids)>100 THEN RAISE EXCEPTION 'Team limit is 100'; END IF;
 assignment_changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN assignment_changed:=NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.team_ids IS DISTINCT FROM OLD.team_ids; END IF;
 IF assignment_changed THEN
  FOREACH candidate IN ARRAY array_append(NEW.team_ids,NEW.assignee_id) LOOP
   IF candidate IS NOT NULL AND NOT private.eligible_for_project(candidate,NEW.project_id) THEN RAISE EXCEPTION 'Participant must have active access to the project' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 SELECT name INTO NEW.assignee FROM public.profiles WHERE id=NEW.assignee_id;
 RETURN NEW;
END $$;
CREATE TRIGGER task_assignment_guard BEFORE INSERT OR UPDATE ON public.lt_tasks FOR EACH ROW EXECUTE FUNCTION private.task_assignment_guard();
-- Renaming a profile updates the display snapshot by ID, never task ownership.
CREATE OR REPLACE FUNCTION private.preserve_assignee_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.name IS DISTINCT FROM OLD.name THEN UPDATE public.lt_tasks SET assignee=NEW.name WHERE assignee_id=OLD.id; END IF; RETURN NEW;
END $$;
-- Avoid interpreting a profile-triggered display refresh as a reassignment.
-- The assignment guard uses the stored profile name below; AFTER timing keeps it current.
DROP TRIGGER preserve_assignee_name ON public.profiles;
CREATE TRIGGER preserve_assignee_name AFTER UPDATE OF name ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.preserve_assignee_name();

DROP POLICY child_insert ON public.lt_task_comments;
DROP POLICY child_update ON public.lt_task_comments;
DROP POLICY child_delete ON public.lt_task_comments;
CREATE POLICY child_insert ON public.lt_task_comments FOR INSERT TO authenticated WITH CHECK(private.comment_task(task_id) AND author_id=auth.uid());
CREATE POLICY child_update ON public.lt_task_comments FOR UPDATE TO authenticated USING(private.comment_task(task_id) AND author_id=auth.uid()) WITH CHECK(private.comment_task(task_id) AND author_id=auth.uid());
CREATE POLICY child_delete ON public.lt_task_comments FOR DELETE TO authenticated USING(private.can_write_task(task_id) OR (private.comment_task(task_id) AND author_id=auth.uid()));
-- Team members may read history, but cannot forge, update or erase it.
REVOKE UPDATE,DELETE ON public.lt_task_activity FROM authenticated;

CREATE OR REPLACE FUNCTION private.generate_task_recurrence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE next_id uuid; next_date date; next_team uuid[];
BEGIN
 IF NEW.status<>'done' OR OLD.status='done' OR NEW.due_date IS NULL OR NEW.recurring IS NULL THEN RETURN NEW; END IF;
 next_date:=CASE NEW.recurring WHEN 'daily' THEN NEW.due_date+1 WHEN 'weekly' THEN NEW.due_date+7 WHEN 'biweekly' THEN NEW.due_date+14 WHEN 'monthly' THEN (NEW.due_date+interval '1 month')::date END;
 SELECT coalesce(array_agg(id),'{}') INTO next_team FROM unnest(NEW.team_ids) id WHERE private.eligible_for_project(id,NEW.project_id);
 INSERT INTO public.lt_tasks(title,description,status,priority,project_id,due_date,tags,recurring,assignee_id,team_ids,created_by,recurrence_source_id)
 VALUES(NEW.title,NEW.description,'todo',NEW.priority,NEW.project_id,next_date,NEW.tags,NEW.recurring,CASE WHEN private.eligible_for_project(NEW.assignee_id,NEW.project_id) THEN NEW.assignee_id ELSE auth.uid() END,next_team,NEW.created_by,NEW.id)
 ON CONFLICT(recurrence_source_id) DO NOTHING RETURNING id INTO next_id;
 IF next_id IS NOT NULL THEN INSERT INTO public.lt_task_checklist(task_id,text,done,position) SELECT next_id,text,false,position FROM public.lt_task_checklist WHERE task_id=NEW.id;
 INSERT INTO public.lt_task_activity(task_id,text) VALUES(next_id,'Recorrência gerada automaticamente'); END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.task_assignment_guard() FROM PUBLIC,anon,authenticated;
