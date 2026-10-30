-- All existing tasks were checked: none lack a project. Abort instead of inventing assignments.
ALTER TABLE public.lt_tasks ALTER COLUMN project_id SET NOT NULL;

CREATE FUNCTION private.delete_event_safely(op text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ev private.events; snapshot jsonb; backup_id bigint; verified jsonb;
BEGIN
 IF NOT private.general_admin() THEN RAISE EXCEPTION 'Somente o administrador geral pode excluir eventos.' USING ERRCODE='42501';END IF;
 SELECT * INTO ev FROM private.events WHERE id=(payload->>'eventId')::uuid FOR UPDATE;
 IF ev.id IS NULL THEN RAISE EXCEPTION 'Evento não encontrado. Atualize a lista.';END IF;
 -- All assignment writes also lock the event, so the snapshot remains stable.
 snapshot:=jsonb_build_object('event',to_jsonb(ev),'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM private.event_assignments a WHERE a.event_id=ev.id));
 IF op='preview' THEN RETURN snapshot;END IF;
 IF op<>'remove' OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme a exclusão do evento.';END IF;
 IF payload->'snapshot' IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'O evento ou a escala mudou. Atualize e tente novamente.';END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,ministry_id,details)
 VALUES(auth.uid(),'event.removed',ev.id,ev.ministry_id,jsonb_build_object('backup',snapshot,'backupVersion',1)) RETURNING id INTO backup_id;
 SELECT details->'backup' INTO verified FROM private.people_audit WHERE id=backup_id;
 IF verified IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'A cópia de segurança não foi verificada. Nada foi excluído.';END IF;
 DELETE FROM private.event_assignments WHERE event_id=ev.id;
 DELETE FROM private.events WHERE id=ev.id;
 RETURN jsonb_build_object('ok',true,'backupId',backup_id);
END $$;
CREATE FUNCTION public.delete_event_safely(op text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.delete_event_safely(op,payload) $$;
REVOKE ALL ON FUNCTION private.delete_event_safely(text,jsonb),public.delete_event_safely(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.delete_event_safely(text,jsonb),public.delete_event_safely(text,jsonb) TO authenticated;
