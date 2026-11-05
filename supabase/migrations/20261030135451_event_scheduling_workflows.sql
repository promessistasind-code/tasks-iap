ALTER TABLE private.events ADD COLUMN series_id uuid;
CREATE INDEX events_series ON private.events(series_id) WHERE series_id IS NOT NULL;
CREATE TABLE private.unavailability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),person_id uuid NOT NULL REFERENCES private.people(id),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unavailability_person ON private.unavailability(person_id,starts_at,ends_at) WHERE active;
CREATE TABLE private.scale_swaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid NOT NULL REFERENCES private.event_assignments(id),
 replacement_id uuid NOT NULL REFERENCES private.people(id),requested_by uuid NOT NULL,event_version integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),decided_by uuid,decided_at timestamptz
);
CREATE UNIQUE INDEX scale_swaps_pending ON private.scale_swaps(assignment_id) WHERE status='pending';
ALTER TABLE private.unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.scale_swaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.unavailability,private.scale_swaps FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.schedule_conflict(pid uuid,st timestamptz,en timestamptz,eid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.unavailability u WHERE u.person_id=pid AND u.active AND u.starts_at<en AND u.ends_at>st)
 OR EXISTS(SELECT 1 FROM private.event_assignments a JOIN private.events e ON e.id=a.event_id WHERE a.person_id=pid AND a.active AND a.response<>'declined' AND NOT e.cancelled AND e.id IS DISTINCT FROM eid AND e.starts_at<en AND e.ends_at>st)
$$;
CREATE FUNCTION private.scale_eligible(pid uuid,mid uuid,fid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id JOIN private.ministry_functions f ON f.id=fid AND f.ministry_id=mid WHERE m.person_id=pid AND m.ministry_id=mid AND m.active AND fid=ANY(m.function_ids) AND p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access a WHERE a.user_id=p.user_id AND a.active)))
$$;
CREATE FUNCTION private.schedule_time(base timestamptz,tz text,freq text,n integer) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ((base AT TIME ZONE tz)+CASE freq WHEN 'weekly' THEN make_interval(days=>7*n) WHEN 'fortnightly' THEN make_interval(days=>14*n) WHEN 'monthly' THEN make_interval(months=>n) ELSE interval '0' END) AT TIME ZONE tz
$$;
REVOKE ALL ON FUNCTION private.schedule_conflict(uuid,timestamptz,timestamptz,uuid),private.scale_eligible(uuid,uuid,uuid),private.schedule_time(timestamptz,text,text,integer) FROM PUBLIC,anon,authenticated;
-- Preserve the validated base operations, adding one shared scheduling lock and conflict checks.
ALTER FUNCTION private.event_write(text,jsonb) RENAME TO event_write_base;
CREATE FUNCTION private.event_write(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e private.events;pid uuid;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(71250341);
 IF op='assign' OR (op='respond' AND payload->>'response'='confirmed') THEN
  SELECT * INTO e FROM private.events WHERE id=(payload->>'eventId')::uuid;
  IF NOT private.event_visible(e.id) THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501';END IF;
  IF op='assign' THEN
   IF NOT private.event_manager((payload->>'ministryId')::uuid) THEN RAISE EXCEPTION 'Own shared ministry required' USING ERRCODE='42501';END IF;
   pid:=(payload->>'personId')::uuid;
   IF NOT private.scale_eligible(pid,(payload->>'ministryId')::uuid,(payload->>'functionId')::uuid) THEN RAISE EXCEPTION 'Active member with this function required' USING ERRCODE='42501';END IF;
  ELSE
   SELECT a.person_id INTO pid FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id WHERE a.id=(payload->>'assignmentId')::uuid AND a.event_id=e.id AND p.user_id=auth.uid();
   IF pid IS NULL THEN RAISE EXCEPTION 'Only the assigned person can respond' USING ERRCODE='42501';END IF;
  END IF;
  IF private.schedule_conflict(pid,e.starts_at,e.ends_at,e.id) THEN RAISE EXCEPTION 'Pessoa indisponível ou escalada em outro evento neste horário.';END IF;
 END IF;
 RETURN private.event_write_base(op,payload);
END $$;
REVOKE ALL ON FUNCTION private.event_write(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.scheduling_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid;eid uuid;pid uuid;sid uuid;ev private.events;a private.event_assignments;s private.scale_swaps;
 st timestamptz;en timestamptz;freq text;tz text;cnt integer;i integer;result jsonb;newid uuid;groupid uuid;copied record;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Conta ativa e cadastro autorizado são necessários.' USING ERRCODE='42501';END IF;
 SELECT id INTO me FROM private.people WHERE user_id=auth.uid();
 PERFORM pg_advisory_xact_lock(71250341);
 IF op='availabilityList' THEN
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.starts_at),'[]') FROM private.unavailability u WHERE u.person_id=me AND u.active);
 ELSIF op='availabilityAdd' THEN
  st:=(payload->>'startsAt')::timestamptz;en:=(payload->>'endsAt')::timestamptz;
  freq:=coalesce(payload->>'frequency','none');cnt:=coalesce((payload->>'count')::integer,1);tz:=payload->>'timezone';
  IF st IS NULL OR en IS NULL OR en<=st OR en-st>interval '31 days' OR cnt NOT BETWEEN 1 AND 26 OR freq NOT IN ('none','weekly','fortnightly','monthly') OR (freq='none' AND cnt<>1) OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RAISE EXCEPTION 'Confira período, fuso e quantidade (até 26 ocorrências).';END IF;
  FOR i IN 0..cnt-1 LOOP
   INSERT INTO private.unavailability(person_id,starts_at,ends_at) VALUES(me,private.schedule_time(st,tz,freq,i),private.schedule_time(st,tz,freq,i)+(en-st));
  END LOOP;
  UPDATE private.event_assignments a SET response='pending',responded_at=NULL FROM private.events e WHERE a.event_id=e.id AND a.person_id=me AND a.active AND NOT e.cancelled AND EXISTS(SELECT 1 FROM private.unavailability u WHERE u.person_id=me AND u.active AND u.starts_at<e.ends_at AND u.ends_at>e.starts_at);
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'availability.added',me,payload);
  RETURN jsonb_build_object('ok',true);
 ELSIF op='availabilityCancel' THEN
  UPDATE private.unavailability SET active=false WHERE id=(payload->>'id')::uuid AND person_id=me AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período indisponível para alteração.' USING ERRCODE='42501';END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'availability.cancelled',me,payload);
  RETURN jsonb_build_object('ok',true);
 END IF;
 eid:=(payload->>'eventId')::uuid;
 SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501';END IF;
 IF op='state' THEN
  RETURN jsonb_build_object('conflicts',(SELECT coalesce(jsonb_agg(a.id),'[]') FROM private.event_assignments a WHERE a.event_id=eid AND a.active AND (private.event_manager(a.ministry_id) OR a.person_id=me) AND private.schedule_conflict(a.person_id,ev.starts_at,ev.ends_at,eid)),
   'swaps',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'assignmentId',a.id,'personName',p.first_name||' '||p.last_name,'replacementName',r.first_name||' '||r.last_name,'status',s.status,'canDecide',private.event_manager(a.ministry_id) AND s.status='pending' AND a.active AND NOT ev.cancelled AND (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)),'canCancel',s.requested_by=auth.uid() AND s.status='pending') ORDER BY s.created_at),'[]') FROM private.scale_swaps s JOIN private.event_assignments a ON a.id=s.assignment_id JOIN private.people p ON p.id=a.person_id JOIN private.people r ON r.id=s.replacement_id WHERE a.event_id=eid AND (s.requested_by=auth.uid() OR private.event_manager(a.ministry_id))));
 END IF;
 IF op IN ('repeatPreview','repeat','cancelSeries') THEN
  IF NOT private.event_manager(ev.ministry_id) THEN RAISE EXCEPTION 'Somente a liderança do ministério responsável pode administrar a série.' USING ERRCODE='42501';END IF;
  IF op='cancelSeries' THEN
   IF ev.series_id IS NULL OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme o cancelamento da série.';END IF;
   UPDATE private.events SET cancelled=true,version=version+1,updated_at=now() WHERE series_id=ev.series_id AND ministry_id=ev.ministry_id AND starts_at>=ev.starts_at;
   INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'event.series_cancelled',eid,payload);
   RETURN jsonb_build_object('ok',true);
  END IF;
  IF ev.cancelled OR ev.series_id IS NOT NULL OR ev.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'Evento alterado, cancelado ou já pertencente a uma série. Reabra para atualizar.';END IF;
  freq:=payload->>'frequency';cnt:=(payload->>'count')::integer;tz:=payload->>'timezone';
  IF freq IS NULL OR cnt IS NULL OR freq NOT IN ('weekly','fortnightly','monthly') OR cnt NOT BETWEEN 2 AND 26 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RAISE EXCEPTION 'Escolha frequência, fuso e quantidade entre 2 e 26.';END IF;
  SELECT jsonb_agg(jsonb_build_object('startsAt',private.schedule_time(ev.starts_at,tz,freq,n),'endsAt',private.schedule_time(ev.starts_at,tz,freq,n)+(ev.ends_at-ev.starts_at)) ORDER BY n) INTO result FROM generate_series(0,cnt-1)n;
  IF op='repeatPreview' THEN RETURN result;END IF;
  IF (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme a criação da série.';END IF;
  groupid:=gen_random_uuid();UPDATE private.events SET series_id=groupid,version=version+1 WHERE id=eid;
  FOR i IN 1..cnt-1 LOOP
   st:=private.schedule_time(ev.starts_at,tz,freq,i);en:=st+(ev.ends_at-ev.starts_at);
   newid:=(private.event_write('save',jsonb_build_object('ministryId',ev.ministry_id,'title',ev.title,'description',ev.description,'location',ev.location,'startsAt',st,'endsAt',en,'sharedWith',to_jsonb(ev.shared_with)))->>'id')::uuid;
   UPDATE private.events SET series_id=groupid WHERE id=newid;
   IF coalesce((payload->>'copyAssignments')::boolean,false) THEN
    FOR copied IN SELECT * FROM private.event_assignments WHERE event_id=eid AND active AND ministry_id=ev.ministry_id LOOP
     PERFORM private.event_write('assign',jsonb_build_object('eventId',newid,'ministryId',copied.ministry_id,'personId',copied.person_id,'functionId',copied.function_id));
    END LOOP;
   END IF;
  END LOOP;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'event.series_created',eid,payload);
  RETURN jsonb_build_object('count',cnt);
 END IF;
 IF ev.cancelled OR ev.ends_at<=now() THEN RAISE EXCEPTION 'Trocas exigem evento não cancelado e ainda não encerrado.';END IF;
 IF op IN ('swapCandidates','requestSwap') THEN
  SELECT * INTO a FROM private.event_assignments WHERE id=(payload->>'assignmentId')::uuid AND event_id=eid AND active;
  IF a.id IS NULL OR a.person_id<>me OR NOT private.event_member(a.ministry_id) OR NOT (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Somente a pessoa escalada pode solicitar troca.' USING ERRCODE='42501';END IF;
  IF op='swapCandidates' THEN
   RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name) ORDER BY p.first_name),'[]') FROM private.people p WHERE p.id<>me AND private.scale_eligible(p.id,a.ministry_id,a.function_id) AND NOT private.schedule_conflict(p.id,ev.starts_at,ev.ends_at,eid) AND NOT EXISTS(SELECT 1 FROM private.event_assignments x WHERE x.event_id=eid AND x.person_id=p.id AND x.function_id=a.function_id AND x.ministry_id=a.ministry_id AND x.active));
  END IF;
  pid:=(payload->>'replacementId')::uuid;
  IF pid IS NULL OR pid=me OR NOT private.scale_eligible(pid,a.ministry_id,a.function_id) OR private.schedule_conflict(pid,ev.starts_at,ev.ends_at,eid) OR EXISTS(SELECT 1 FROM private.event_assignments x WHERE x.event_id=eid AND x.person_id=pid AND x.ministry_id=a.ministry_id AND x.function_id=a.function_id AND x.active) THEN RAISE EXCEPTION 'Substituto sem função válida ou indisponível.';END IF;
  INSERT INTO private.scale_swaps(assignment_id,replacement_id,requested_by,event_version) VALUES(a.id,pid,auth.uid(),ev.version) RETURNING id INTO sid;
 ELSIF op IN ('decideSwap','cancelSwap') THEN
  SELECT s0.* INTO s FROM private.scale_swaps s0 JOIN private.event_assignments a0 ON a0.id=s0.assignment_id WHERE s0.id=(payload->>'swapId')::uuid AND a0.event_id=eid FOR UPDATE OF s0;
  IF s.id IS NULL OR s.status<>'pending' THEN RAISE EXCEPTION 'Solicitação já resolvida ou indisponível.';END IF;
  SELECT * INTO a FROM private.event_assignments WHERE id=s.assignment_id;
  IF op='cancelSwap' THEN
   IF s.requested_by<>auth.uid() THEN RAISE EXCEPTION 'Somente o solicitante pode cancelar.' USING ERRCODE='42501';END IF;
   UPDATE private.scale_swaps SET status='cancelled',decided_by=auth.uid(),decided_at=now() WHERE id=s.id;
  ELSE
   IF NOT private.event_manager(a.ministry_id) OR NOT (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Somente a liderança deste ministério pode decidir.' USING ERRCODE='42501';END IF;
   IF payload->>'decision' NOT IN ('approve','reject') OR payload->>'decision' IS NULL THEN RAISE EXCEPTION 'Decisão inválida.';END IF;
   IF payload->>'decision'='approve' THEN
    IF s.event_version<>ev.version OR NOT a.active OR NOT private.scale_eligible(a.person_id,a.ministry_id,a.function_id) OR NOT private.scale_eligible(s.replacement_id,a.ministry_id,a.function_id) OR private.schedule_conflict(s.replacement_id,ev.starts_at,ev.ends_at,eid) OR EXISTS(SELECT 1 FROM private.event_assignments x WHERE x.event_id=eid AND x.person_id=s.replacement_id AND x.ministry_id=a.ministry_id AND x.function_id=a.function_id AND x.active) THEN RAISE EXCEPTION 'A escala ou a disponibilidade mudou. Revise a solicitação.';END IF;
    PERFORM private.event_write('unassign',jsonb_build_object('eventId',eid,'assignmentId',a.id));
    PERFORM private.event_write('assign',jsonb_build_object('eventId',eid,'ministryId',a.ministry_id,'personId',s.replacement_id,'functionId',a.function_id));
   END IF;
   UPDATE private.scale_swaps SET status=CASE WHEN payload->>'decision'='approve' THEN 'approved' ELSE 'rejected' END,decided_by=auth.uid(),decided_at=now() WHERE id=s.id;
  END IF;
  sid:=s.id;
 ELSE RAISE EXCEPTION 'Operação inválida.';END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'scale.'||op,sid,payload);
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE FUNCTION public.scheduling_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.scheduling_portal(op,payload) $$;
REVOKE ALL ON FUNCTION private.scheduling_portal(text,jsonb),public.scheduling_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.scheduling_portal(text,jsonb),public.scheduling_portal(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.delete_event_safely(op text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ev private.events; snapshot jsonb; backup_id bigint; verified jsonb;
BEGIN
 IF NOT private.general_admin() THEN RAISE EXCEPTION 'Somente o administrador geral pode excluir eventos.' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(71250341);
 SELECT * INTO ev FROM private.events WHERE id=(payload->>'eventId')::uuid FOR UPDATE;
 IF ev.id IS NULL THEN RAISE EXCEPTION 'Evento não encontrado. Atualize a lista.';END IF;
 -- All assignment writes also lock the event, so the snapshot remains stable.
 snapshot:=jsonb_build_object('event',to_jsonb(ev),'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM private.event_assignments a WHERE a.event_id=ev.id),'swaps',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM private.scale_swaps s JOIN private.event_assignments a ON a.id=s.assignment_id WHERE a.event_id=ev.id));
 IF op='preview' THEN RETURN snapshot;END IF;
 IF op<>'remove' OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme a exclusão do evento.';END IF;
 IF payload->'snapshot' IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'O evento ou a escala mudou. Atualize e tente novamente.';END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,ministry_id,details)
 VALUES(auth.uid(),'event.removed',ev.id,ev.ministry_id,jsonb_build_object('backup',snapshot,'backupVersion',1)) RETURNING id INTO backup_id;
 SELECT details->'backup' INTO verified FROM private.people_audit WHERE id=backup_id;
 IF verified IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'A cópia de segurança não foi verificada. Nada foi excluído.';END IF;
 DELETE FROM private.scale_swaps WHERE assignment_id IN (SELECT id FROM private.event_assignments WHERE event_id=ev.id);
 DELETE FROM private.event_assignments WHERE event_id=ev.id;
 DELETE FROM private.events WHERE id=ev.id;
 RETURN jsonb_build_object('ok',true,'backupId',backup_id);
END $$;

CREATE OR REPLACE FUNCTION private.event_read(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; eid uuid;mid uuid;start_time timestamptz;end_time timestamptz;ev private.events;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  start_time:=(payload->>'start')::timestamptz;end_time:=(payload->>'end')::timestamptz;
  IF start_time IS NULL OR end_time IS NULL OR end_time<=start_time OR end_time-start_time>interval '94 days' THEN RAISE EXCEPTION 'Choose a period up to 94 days';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('canManage',private.event_manager(e.ministry_id)) ORDER BY e.starts_at),'[]') INTO result FROM private.events e WHERE e.starts_at<end_time AND e.ends_at>start_time AND private.event_visible(e.id);
  RETURN jsonb_build_object('items',result,'creatableMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE private.event_manager(id)));
 END IF;
 eid:=(payload->>'eventId')::uuid;
 IF NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid;
 IF op='detail' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ministryId',a.ministry_id,'personId',a.person_id,'name',p.first_name||' '||p.last_name,'functionId',a.function_id,'functionName',f.name,'response',a.response,'canManage',private.event_manager(a.ministry_id) AND (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)),'canRespond',(a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)) AND p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM private.ministry_members mm WHERE mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active)) ORDER BY a.created_at),'[]') INTO result
  FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id JOIN private.ministry_functions f ON f.id=a.function_id WHERE a.event_id=eid AND a.active AND p.consent_at IS NOT NULL;
  RETURN jsonb_build_object('event',to_jsonb(ev)||jsonb_build_object('canManage',private.event_manager(ev.ministry_id)),'assignments',result,'scheduleMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE (id=ev.ministry_id OR id=ANY(ev.shared_with)) AND private.event_manager(id)));
 ELSIF op='candidates' THEN
  mid:=(payload->>'ministryId')::uuid;
  IF ev.cancelled OR NOT private.event_manager(mid) OR NOT (mid=ev.ministry_id OR mid=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Own shared ministry required' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,'functionIds',mm.function_ids,'available',NOT private.schedule_conflict(p.id,ev.starts_at,ev.ends_at,eid)) ORDER BY p.first_name),'[]') INTO result FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id WHERE mm.ministry_id=mid AND mm.active AND p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access a WHERE a.user_id=p.user_id AND a.active));
  RETURN result;
 END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;
REVOKE ALL ON FUNCTION private.event_read(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.event_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF op IN ('list','detail','candidates') THEN RETURN private.event_read(op,payload);ELSE RETURN private.event_write(op,payload);END IF;
END $$;
