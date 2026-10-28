-- Keep history atomic when assigning away the caller's editing authority.
CREATE FUNCTION private.record_task_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.lt_task_activity(task_id,text) VALUES(NEW.id,'Tarefa criada');
 ELSE
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
   INSERT INTO public.lt_task_activity(task_id,text) VALUES(NEW.id,'Responsável alterado');
  END IF;
  IF NEW.team_ids IS DISTINCT FROM OLD.team_ids THEN
   INSERT INTO public.lt_task_activity(task_id,text) VALUES(NEW.id,'Equipe alterada');
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.record_task_assignment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_task_assignment AFTER INSERT OR UPDATE OF assignee_id,team_ids ON public.lt_tasks FOR EACH ROW EXECUTE FUNCTION private.record_task_assignment();
