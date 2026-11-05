CREATE OR REPLACE FUNCTION private.scheduling_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  UPDATE private.event_assignments assignment_row SET response='pending',responded_at=NULL FROM private.events e WHERE assignment_row.event_id=e.id AND assignment_row.person_id=me AND assignment_row.active AND NOT e.cancelled AND EXISTS(SELECT 1 FROM private.unavailability u WHERE u.person_id=me AND u.active AND u.starts_at<e.ends_at AND u.ends_at>e.starts_at);
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
  RETURN jsonb_build_object('conflicts',(SELECT coalesce(jsonb_agg(assignment_row.id),'[]') FROM private.event_assignments assignment_row WHERE assignment_row.event_id=eid AND assignment_row.active AND (private.event_manager(assignment_row.ministry_id) OR assignment_row.person_id=me) AND private.schedule_conflict(assignment_row.person_id,ev.starts_at,ev.ends_at,eid)),
   'swaps',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',swap_row.id,'assignmentId',assignment_row.id,'personName',p.first_name||' '||p.last_name,'replacementName',r.first_name||' '||r.last_name,'status',swap_row.status,'canDecide',private.event_manager(assignment_row.ministry_id) AND swap_row.status='pending' AND assignment_row.active AND NOT ev.cancelled AND (assignment_row.ministry_id=ev.ministry_id OR assignment_row.ministry_id=ANY(ev.shared_with)),'canCancel',swap_row.requested_by=auth.uid() AND swap_row.status='pending') ORDER BY swap_row.created_at),'[]') FROM private.scale_swaps swap_row JOIN private.event_assignments assignment_row ON assignment_row.id=swap_row.assignment_id JOIN private.people p ON p.id=assignment_row.person_id JOIN private.people r ON r.id=swap_row.replacement_id WHERE assignment_row.event_id=eid AND (swap_row.requested_by=auth.uid() OR private.event_manager(assignment_row.ministry_id))));
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
