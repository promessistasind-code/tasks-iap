INSERT INTO private.ministries(name) VALUES('Secretaria') ON CONFLICT(name) DO NOTHING;
CREATE FUNCTION private.member_of_named_ministry(label text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.ministry_members mm JOIN private.people p ON p.id=mm.person_id JOIN private.ministries m ON m.id=mm.ministry_id WHERE p.user_id=auth.uid() AND mm.active AND m.name=label)
$$;
CREATE FUNCTION private.global_observer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.member_of_named_ministry('Pastor') OR private.member_of_named_ministry('Secretaria') $$;
CREATE FUNCTION private.event_assigned(eid uuid,mid uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id JOIN private.ministry_members mm ON mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active WHERE a.event_id=eid AND a.active AND p.user_id=auth.uid() AND (mid IS NULL OR a.ministry_id=mid))
$$;
CREATE FUNCTION private.pastor_event(eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.member_of_named_ministry('Pastor') AND EXISTS(SELECT 1 FROM private.events e JOIN private.ministries m ON m.id=e.ministry_id WHERE e.id=eid AND m.name='Pastor' AND e.created_by=auth.uid())
$$;
CREATE FUNCTION private.event_messenger_slot(eid uuid,mid uuid,fid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.events e JOIN private.ministries owner_m ON owner_m.id=e.ministry_id JOIN private.ministries teaching ON teaching.id=mid JOIN private.ministry_functions f ON f.id=fid AND f.ministry_id=teaching.id WHERE e.id=eid AND owner_m.name='Pastor' AND teaching.name='Ministério de Ensino' AND lower(f.name)='mensageiro')
$$;
CREATE FUNCTION private.event_can_create(mid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.event_manager(mid) OR (private.member_of_named_ministry('Pastor') AND EXISTS(SELECT 1 FROM private.ministries WHERE id=mid AND name='Pastor'))
$$;
CREATE FUNCTION private.event_can_manage(eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.pastor_event(eid) OR EXISTS(SELECT 1 FROM private.events e WHERE e.id=eid AND private.event_manager(e.ministry_id))
$$;
CREATE OR REPLACE FUNCTION private.event_visible(eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.events e WHERE e.id=eid AND (private.general_admin() OR private.global_observer() OR private.event_assigned(eid) OR private.event_member(e.ministry_id) OR EXISTS(SELECT 1 FROM unnest(e.shared_with) mid WHERE private.event_member(mid))))
$$;
REVOKE ALL ON FUNCTION private.member_of_named_ministry(text),private.global_observer(),private.event_assigned(uuid,uuid),private.pastor_event(uuid),private.event_messenger_slot(uuid,uuid,uuid),private.event_can_create(uuid),private.event_can_manage(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.global_observer() TO authenticated;
-- New SELECT-only policies leave every existing write predicate unchanged.
CREATE POLICY observer_read ON public.lt_projects FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_project_members FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_tasks FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_task_comments FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_task_checklist FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_task_activity FOR SELECT TO authenticated USING((SELECT private.global_observer()));
CREATE POLICY observer_read ON public.lt_task_links FOR SELECT TO authenticated USING((SELECT private.global_observer()));
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('private.workspace_access()'::regprocedure);
 IF position('WHERE private.has_project_access(p.id)' IN d)=0 THEN RAISE EXCEPTION 'Workspace definition changed';END IF;
 d:=replace(d,'WHERE private.has_project_access(p.id)','WHERE (private.has_project_access(p.id) OR private.global_observer())');EXECUTE d;
 d:=pg_get_functiondef('private.event_write_base(text,jsonb)'::regprocedure);
 IF position('IF NOT private.event_manager(mid) THEN' IN d)=0 THEN RAISE EXCEPTION 'Event write definition changed';END IF;
 d:=replace(d,'IF NOT private.event_manager(mid) THEN','IF (eid IS NULL AND NOT private.event_can_create(mid)) OR (eid IS NOT NULL AND NOT private.event_can_manage(eid)) THEN');
 d:=replace(d,'assignment.ministry_id=ANY(ev.shared_with))','assignment.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,assignment.ministry_id,assignment.function_id))');EXECUTE d;
END $$;
-- Pastors manage only Mensageiro assignments in their own Pastor events.
ALTER FUNCTION private.event_write(text,jsonb) RENAME TO event_write_scheduling;
CREATE FUNCTION private.event_write(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid;mid uuid;fid uuid;pid uuid;ev private.events;row_a private.event_assignments;result jsonb;
BEGIN
 IF op NOT IN ('pastorCandidates','pastorAssign','pastorUnassign') THEN RETURN private.event_write_scheduling(op,payload);END IF;
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Conta ativa necessária.' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(71250341);
 eid:=(payload->>'eventId')::uuid;SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT private.pastor_event(eid) OR ev.cancelled THEN RAISE EXCEPTION 'Somente o pastor responsável por este evento pode administrar seus mensageiros.' USING ERRCODE='42501';END IF;
 SELECT f.ministry_id,f.id INTO mid,fid FROM private.ministry_functions f JOIN private.ministries m ON m.id=f.ministry_id WHERE m.name='Ministério de Ensino' AND lower(f.name)='mensageiro';
 IF mid IS NULL THEN RAISE EXCEPTION 'Função Mensageiro indisponível.';END IF;
 IF op='pastorCandidates' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,'available',NOT private.schedule_conflict(p.id,ev.starts_at,ev.ends_at,eid)) ORDER BY p.first_name),'[]') INTO result FROM private.people p WHERE private.scale_eligible(p.id,mid,fid);RETURN result;
 ELSIF op='pastorAssign' THEN
  pid:=(payload->>'personId')::uuid;
  IF NOT private.scale_eligible(pid,mid,fid) THEN RAISE EXCEPTION 'A pessoa precisa ter vínculo ativo e a função Mensageiro no Ensino.' USING ERRCODE='42501';END IF;
  IF private.schedule_conflict(pid,ev.starts_at,ev.ends_at,eid) THEN RAISE EXCEPTION 'Pessoa indisponível ou escalada em outro evento neste horário.';END IF;
  INSERT INTO private.event_assignments(event_id,ministry_id,person_id,function_id,created_by) VALUES(eid,mid,pid,fid,auth.uid()) ON CONFLICT(event_id,ministry_id,person_id,function_id) WHERE active DO NOTHING;
 ELSE
  SELECT * INTO row_a FROM private.event_assignments WHERE id=(payload->>'assignmentId')::uuid AND event_id=eid AND active FOR UPDATE;
  IF row_a.id IS NULL OR NOT private.event_messenger_slot(eid,row_a.ministry_id,row_a.function_id) THEN RAISE EXCEPTION 'Atribuição fora do escopo pastoral.' USING ERRCODE='42501';END IF;
  UPDATE private.event_assignments SET active=false WHERE id=row_a.id;
 END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'event.'||op,eid,payload);
 RETURN jsonb_build_object('id',eid);
END $$;
REVOKE ALL ON FUNCTION private.event_write(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.event_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF op IN ('list','detail','candidates') THEN RETURN private.event_read(op,payload);ELSE RETURN private.event_write(op,payload);END IF;
END $$;

CREATE OR REPLACE FUNCTION private.event_read(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; eid uuid;mid uuid;start_time timestamptz;end_time timestamptz;ev private.events;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  start_time:=(payload->>'start')::timestamptz;end_time:=(payload->>'end')::timestamptz;
  IF start_time IS NULL OR end_time IS NULL OR end_time<=start_time OR end_time-start_time>interval '94 days' THEN RAISE EXCEPTION 'Choose a period up to 94 days';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('canManage',private.event_can_manage(e.id),'isAssigned',private.event_assigned(e.id)) ORDER BY e.starts_at),'[]') INTO result FROM private.events e WHERE e.starts_at<end_time AND e.ends_at>start_time AND private.event_visible(e.id) AND (nullif(payload->>'assignedMinistry','') IS NULL OR private.event_assigned(e.id,(payload->>'assignedMinistry')::uuid));
  RETURN jsonb_build_object('items',result,'creatableMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE private.event_can_create(id)));
 END IF;
 eid:=(payload->>'eventId')::uuid;
 IF NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid;
 IF op='detail' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ministryId',a.ministry_id,'personId',a.person_id,'name',p.first_name||' '||p.last_name,'functionId',a.function_id,'functionName',f.name,'response',a.response,'canManage',private.event_manager(a.ministry_id) AND (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,a.ministry_id,a.function_id)),'canPastorManage',private.pastor_event(eid) AND private.event_messenger_slot(eid,a.ministry_id,a.function_id),'canRespond',(a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,a.ministry_id,a.function_id)) AND p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM private.ministry_members mm WHERE mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active)) ORDER BY a.created_at),'[]') INTO result
  FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id JOIN private.ministry_functions f ON f.id=a.function_id WHERE a.event_id=eid AND a.active AND p.consent_at IS NOT NULL;
  RETURN jsonb_build_object('event',to_jsonb(ev)||jsonb_build_object('canManage',private.event_can_manage(ev.id),'canPastorSchedule',private.pastor_event(ev.id)),'assignments',result,'scheduleMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE (id=ev.ministry_id OR id=ANY(ev.shared_with)) AND private.event_manager(id)));
 ELSIF op='candidates' THEN
  mid:=(payload->>'ministryId')::uuid;
  IF ev.cancelled OR NOT private.event_manager(mid) OR NOT (mid=ev.ministry_id OR mid=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Own shared ministry required' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,'functionIds',mm.function_ids,'available',NOT private.schedule_conflict(p.id,ev.starts_at,ev.ends_at,eid)) ORDER BY p.first_name),'[]') INTO result FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id WHERE mm.ministry_id=mid AND mm.active AND p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access a WHERE a.user_id=p.user_id AND a.active));
  RETURN result;
 END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;
REVOKE ALL ON FUNCTION private.event_read(text,jsonb) FROM PUBLIC,anon,authenticated;


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
  RETURN jsonb_build_object('conflicts',(SELECT coalesce(jsonb_agg(assignment_row.id),'[]') FROM private.event_assignments assignment_row WHERE assignment_row.event_id=eid AND assignment_row.active AND (private.event_manager(assignment_row.ministry_id) OR assignment_row.person_id=me OR (private.pastor_event(eid) AND private.event_messenger_slot(eid,assignment_row.ministry_id,assignment_row.function_id))) AND private.schedule_conflict(assignment_row.person_id,ev.starts_at,ev.ends_at,eid)),
   'swaps',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',swap_row.id,'assignmentId',assignment_row.id,'personName',p.first_name||' '||p.last_name,'replacementName',r.first_name||' '||r.last_name,'status',swap_row.status,'canDecide',(private.event_manager(assignment_row.ministry_id) OR (private.pastor_event(eid) AND private.event_messenger_slot(eid,assignment_row.ministry_id,assignment_row.function_id))) AND swap_row.status='pending' AND assignment_row.active AND NOT ev.cancelled AND (assignment_row.ministry_id=ev.ministry_id OR assignment_row.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,assignment_row.ministry_id,assignment_row.function_id)),'canCancel',swap_row.requested_by=auth.uid() AND swap_row.status='pending') ORDER BY swap_row.created_at),'[]') FROM private.scale_swaps swap_row JOIN private.event_assignments assignment_row ON assignment_row.id=swap_row.assignment_id JOIN private.people p ON p.id=assignment_row.person_id JOIN private.people r ON r.id=swap_row.replacement_id WHERE assignment_row.event_id=eid AND (swap_row.requested_by=auth.uid() OR private.event_manager(assignment_row.ministry_id) OR (private.pastor_event(eid) AND private.event_messenger_slot(eid,assignment_row.ministry_id,assignment_row.function_id)))));
 END IF;
 IF op IN ('repeatPreview','repeat','cancelSeries') THEN
  IF NOT private.event_can_manage(eid) THEN RAISE EXCEPTION 'Somente a liderança do ministério responsável pode administrar a série.' USING ERRCODE='42501';END IF;
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
    FOR copied IN SELECT * FROM private.event_assignments WHERE event_id=eid AND active AND (ministry_id=ev.ministry_id OR (private.pastor_event(eid) AND private.event_messenger_slot(eid,ministry_id,function_id))) LOOP
     IF private.pastor_event(newid) AND private.event_messenger_slot(newid,copied.ministry_id,copied.function_id) THEN PERFORM private.event_write('pastorAssign',jsonb_build_object('eventId',newid,'personId',copied.person_id));ELSE PERFORM private.event_write('assign',jsonb_build_object('eventId',newid,'ministryId',copied.ministry_id,'personId',copied.person_id,'functionId',copied.function_id));END IF;
    END LOOP;
   END IF;
  END LOOP;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'event.series_created',eid,payload);
  RETURN jsonb_build_object('count',cnt);
 END IF;
 IF ev.cancelled OR ev.ends_at<=now() THEN RAISE EXCEPTION 'Trocas exigem evento não cancelado e ainda não encerrado.';END IF;
 IF op IN ('swapCandidates','requestSwap') THEN
  SELECT * INTO a FROM private.event_assignments WHERE id=(payload->>'assignmentId')::uuid AND event_id=eid AND active;
  IF a.id IS NULL OR a.person_id<>me OR NOT private.event_member(a.ministry_id) OR NOT (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,a.ministry_id,a.function_id)) THEN RAISE EXCEPTION 'Somente a pessoa escalada pode solicitar troca.' USING ERRCODE='42501';END IF;
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
   IF NOT (private.event_manager(a.ministry_id) OR (private.pastor_event(eid) AND private.event_messenger_slot(eid,a.ministry_id,a.function_id))) OR NOT (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with) OR private.event_messenger_slot(eid,a.ministry_id,a.function_id)) THEN RAISE EXCEPTION 'Somente a liderança deste ministério pode decidir.' USING ERRCODE='42501';END IF;
   IF payload->>'decision' NOT IN ('approve','reject') OR payload->>'decision' IS NULL THEN RAISE EXCEPTION 'Decisão inválida.';END IF;
   IF payload->>'decision'='approve' THEN
    IF s.event_version<>ev.version OR NOT a.active OR NOT private.scale_eligible(a.person_id,a.ministry_id,a.function_id) OR NOT private.scale_eligible(s.replacement_id,a.ministry_id,a.function_id) OR private.schedule_conflict(s.replacement_id,ev.starts_at,ev.ends_at,eid) OR EXISTS(SELECT 1 FROM private.event_assignments x WHERE x.event_id=eid AND x.person_id=s.replacement_id AND x.ministry_id=a.ministry_id AND x.function_id=a.function_id AND x.active) THEN RAISE EXCEPTION 'A escala ou a disponibilidade mudou. Revise a solicitação.';END IF;
    IF private.pastor_event(eid) AND private.event_messenger_slot(eid,a.ministry_id,a.function_id) THEN
     PERFORM private.event_write('pastorUnassign',jsonb_build_object('eventId',eid,'assignmentId',a.id));
     PERFORM private.event_write('pastorAssign',jsonb_build_object('eventId',eid,'personId',s.replacement_id));
    ELSE
     PERFORM private.event_write('unassign',jsonb_build_object('eventId',eid,'assignmentId',a.id));
    PERFORM private.event_write('assign',jsonb_build_object('eventId',eid,'ministryId',a.ministry_id,'personId',s.replacement_id,'functionId',a.function_id));
    END IF;
   END IF;
   UPDATE private.scale_swaps SET status=CASE WHEN payload->>'decision'='approve' THEN 'approved' ELSE 'rejected' END,decided_by=auth.uid(),decided_at=now() WHERE id=s.id;
  END IF;
  sid:=s.id;
 ELSE RAISE EXCEPTION 'Operação inválida.';END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'scale.'||op,sid,payload);
 RETURN jsonb_build_object('ok',true);
END $$;
