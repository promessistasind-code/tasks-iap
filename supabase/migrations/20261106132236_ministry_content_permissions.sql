ALTER TABLE private.ministry_members
 ADD COLUMN can_edit_repertoire boolean NOT NULL DEFAULT false,
 ADD COLUMN can_edit_script boolean NOT NULL DEFAULT false;

CREATE TABLE private.music_ministries(ministry_id uuid PRIMARY KEY REFERENCES private.ministries(id), library_owner boolean NOT NULL);
CREATE UNIQUE INDEX music_library_owner ON private.music_ministries(library_owner) WHERE library_owner;
INSERT INTO private.music_ministries SELECT id,name='Ministério de Celebração' FROM private.ministries WHERE name IN ('Ministério de Celebração','Ministério de Comunicação');
DO $$ BEGIN IF (SELECT count(*) FROM private.music_ministries)<>2 THEN RAISE EXCEPTION 'Ministérios musicais não identificados'; END IF; END $$;
ALTER TABLE private.music_ministries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.music_ministries FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.content_allowed(mid uuid, part text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS (
  SELECT 1 FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id
  WHERE m.ministry_id=mid AND m.active AND p.user_id=auth.uid()
    AND CASE part WHEN 'songs' THEN (m.leader OR m.can_edit_repertoire)
     AND EXISTS(SELECT 1 FROM private.music_ministries music WHERE music.ministry_id=mid)
     WHEN 'script' THEN m.can_edit_script ELSE false END)
$$;
REVOKE ALL ON FUNCTION private.content_allowed(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.save_content_membership(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mid uuid:=(payload->>'ministryId')::uuid; pid uuid:=(payload->>'personId')::uuid; result jsonb;
BEGIN
 IF NOT private.account_ready() OR NOT private.general_admin() THEN RAISE insufficient_privilege; END IF;
 IF jsonb_typeof(payload->'editSongs') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'editScript') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Permissões inválidas'; END IF;
 IF (payload->>'editSongs')::boolean AND NOT EXISTS(SELECT 1 FROM private.music_ministries WHERE ministry_id=mid) THEN RAISE insufficient_privilege; END IF;
 result:=private.people_portal('membership',payload);
 UPDATE private.ministry_members SET can_edit_repertoire=active AND (payload->>'editSongs')::boolean,can_edit_script=active AND (payload->>'editScript')::boolean WHERE person_id=pid AND ministry_id=mid;
 INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'membership.content_grants',pid,jsonb_build_object('ministryId',mid,'songs',payload->'editSongs','script',payload->'editScript'));
 RETURN result;
END $$;
CREATE FUNCTION public.save_content_membership(payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_content_membership(payload) $$;
REVOKE ALL ON FUNCTION private.save_content_membership(jsonb),public.save_content_membership(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.save_content_membership(jsonb),public.save_content_membership(jsonb) TO authenticated;


-- Assigned slots may belong to a ministry outside the shared list (pastoral messenger).
CREATE OR REPLACE FUNCTION private.event_visible(eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS (
  SELECT 1 FROM private.events e WHERE e.id=eid AND (private.general_admin() OR private.global_observer()
   OR private.event_assigned(eid) OR private.event_member(e.ministry_id)
   OR EXISTS(SELECT 1 FROM unnest(e.shared_with) mid WHERE private.event_member(mid))
   OR EXISTS(SELECT 1 FROM private.event_assignments a WHERE a.event_id=eid AND a.active AND private.event_messenger_slot(eid,a.ministry_id,a.function_id) AND private.ministry_leader(a.ministry_id))))
$$;
CREATE OR REPLACE FUNCTION private.event_read(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; eid uuid;mid uuid;start_time timestamptz;end_time timestamptz;ev private.events;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  start_time:=(payload->>'start')::timestamptz;end_time:=(payload->>'end')::timestamptz;
  IF start_time IS NULL OR end_time IS NULL OR end_time<=start_time OR end_time-start_time>interval '94 days' THEN RAISE EXCEPTION 'Choose a period up to 94 days';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('ministryName',(SELECT name FROM private.ministries WHERE id=e.ministry_id),'canManage',private.event_can_manage(e.id),'isAssigned',private.event_assigned(e.id)) ORDER BY e.starts_at),'[]') INTO result FROM private.events e WHERE e.starts_at<end_time AND e.ends_at>start_time AND private.event_visible(e.id) AND (nullif(payload->>'assignedMinistry','') IS NULL OR private.general_admin() OR (private.ministry_leader((payload->>'assignedMinistry')::uuid) AND
      ((payload->>'assignedMinistry')::uuid=e.ministry_id OR (payload->>'assignedMinistry')::uuid=ANY(e.shared_with)
       OR EXISTS(SELECT 1 FROM private.event_assignments a WHERE a.event_id=e.id AND a.active AND private.event_messenger_slot(e.id,a.ministry_id,a.function_id) AND a.ministry_id=(payload->>'assignedMinistry')::uuid)))
     OR private.event_assigned(e.id,(payload->>'assignedMinistry')::uuid));
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

CREATE OR REPLACE FUNCTION private.repertoire_library_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=(payload->>'eventId')::uuid; ev private.events; v_song jsonb; field text; sid uuid; pool uuid; result jsonb; off integer:=coalesce((payload->>'offset')::integer,0); term text:=coalesce(payload->>'search','');
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() OR NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT FOUND OR NOT private.content_allowed(ev.ministry_id,'songs') THEN RAISE EXCEPTION 'Somente a liderança responsável pode acessar a biblioteca.' USING ERRCODE='42501'; END IF;
 SELECT ministry_id INTO STRICT pool FROM private.music_ministries WHERE library_owner;
 PERFORM pg_advisory_xact_lock(hashtextextended(pool::text,715));
 IF op='list' THEN
  IF off<0 OR off>100000 OR length(term)>200 THEN RAISE EXCEPTION 'Consulta inválida.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO result FROM
   (SELECT id,song FROM private.repertoire_library WHERE ministry_id=pool AND NOT archived AND
    (position(lower(term) in lower(song->>'title'))>0 OR position(lower(term) in lower(song->>'version'))>0)
    ORDER BY lower(song->>'title'),id LIMIT 51 OFFSET off) s;
  RETURN result;
 END IF;
 IF ev.cancelled THEN RAISE EXCEPTION 'Evento cancelado: biblioteca somente para consulta.' USING ERRCODE='42501'; END IF;
 IF op='save' THEN
  v_song:=payload->'song';
  IF jsonb_typeof(v_song) IS DISTINCT FROM 'object' OR octet_length(v_song::text)>1200000 THEN RAISE EXCEPTION 'Música inválida.'; END IF;
  FOREACH field IN ARRAY ARRAY['title','key','version','chords','url'] LOOP
   IF jsonb_typeof(v_song->field) IS DISTINCT FROM 'string' OR length(v_song->>field)>(CASE field WHEN 'chords' THEN 10000 WHEN 'url' THEN 2000 ELSE 200 END) THEN RAISE EXCEPTION 'Campo de música inválido.'; END IF;
  END LOOP;
  IF length(trim(v_song->>'title'))=0 OR ((v_song->>'url')<>'' AND (v_song->>'url')!~* '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'Informe título e link HTTP/HTTPS válido.'; END IF;
  v_song:=jsonb_build_object('title',trim(v_song->>'title'),'key',v_song->>'key','version',v_song->>'version','chords',v_song->>'chords','url',v_song->>'url');
  INSERT INTO private.repertoire_library(ministry_id,song) VALUES(pool,v_song)
   ON CONFLICT(ministry_id,(md5(song::text))) DO UPDATE SET archived=false,updated_at=now() RETURNING id INTO sid;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.library.saved',sid,v_song);
  RETURN jsonb_build_object('id',sid,'song',v_song);
 ELSIF op='archive' THEN
  UPDATE private.repertoire_library SET archived=true,updated_at=now() WHERE id=(payload->>'id')::uuid AND ministry_id=pool AND NOT archived RETURNING id INTO sid;
  IF sid IS NULL THEN RAISE EXCEPTION 'Música indisponível.' USING ERRCODE='42501'; END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.library.archived',sid,'{}');
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Operação inválida.';
END $$;

CREATE OR REPLACE FUNCTION private.repertoire_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=(payload->>'eventId')::uuid; ev private.events; r private.event_repertoires; song_access boolean; script_access boolean; song jsonb; field text; songs jsonb; script text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() OR NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ev.ministry_id::text,714));
 song_access:=NOT ev.cancelled AND private.content_allowed(ev.ministry_id,'songs');
 script_access:=NOT ev.cancelled AND private.content_allowed(ev.ministry_id,'script');
 IF op NOT IN ('save','read') THEN RAISE insufficient_privilege; END IF;
 SELECT * INTO r FROM private.event_repertoires WHERE event_id=eid;
 IF op='save' THEN
  IF NOT (song_access OR script_access) THEN RAISE EXCEPTION 'Sem permissão para editar o repertório.' USING ERRCODE='42501'; END IF;
  IF (payload->>'version')::integer IS DISTINCT FROM coalesce(r.version,0) THEN RAISE EXCEPTION 'Repertório alterado por outra pessoa. Cancele a edição e carregue novamente.'; END IF;
  songs:=coalesce(payload->'songs',r.songs,'[]'); script:=coalesce(payload->>'script',r.script,'');
  IF (NOT song_access AND songs IS DISTINCT FROM coalesce(r.songs,'[]')) OR (NOT script_access AND script IS DISTINCT FROM coalesce(r.script,'')) THEN RAISE insufficient_privilege; END IF;
  IF jsonb_typeof(songs) IS DISTINCT FROM 'array' OR script IS NULL OR length(script)>20000 THEN RAISE EXCEPTION 'Conteúdo inválido.'; END IF;
  IF jsonb_array_length(songs)>100 OR octet_length(songs::text)>1200000 THEN RAISE EXCEPTION 'Limite de músicas excedido.'; END IF;
  FOR song IN SELECT value FROM jsonb_array_elements(songs) LOOP
   IF jsonb_typeof(song) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Música inválida.'; END IF;
   FOREACH field IN ARRAY ARRAY['title','key','version','chords','url'] LOOP
    IF jsonb_typeof(song->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Campo de música inválido.'; END IF;
    IF length(song->>field)>(CASE field WHEN 'chords' THEN 10000 WHEN 'url' THEN 2000 ELSE 200 END) THEN RAISE EXCEPTION 'Campo muito longo.'; END IF;
   END LOOP;
   IF length(trim(song->>'title'))=0 OR ((song->>'url')<>'' AND (song->>'url')!~* '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'Informe título e link HTTP/HTTPS válido.'; END IF;
  END LOOP;
  INSERT INTO private.event_repertoires(event_id,version,songs,script) VALUES(eid,coalesce(r.version,0)+1,songs,script)
   ON CONFLICT(event_id) DO UPDATE SET version=excluded.version,songs=excluded.songs,script=excluded.script,updated_at=now() RETURNING * INTO r;
  IF song_access AND payload ? 'songs' THEN
   FOR song IN SELECT DISTINCT value FROM jsonb_array_elements(songs) LOOP
    PERFORM private.repertoire_library_portal('save',jsonb_build_object('eventId',eid,'song',song));
   END LOOP;
  END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.saved',eid,to_jsonb(r));
 END IF;
 RETURN jsonb_build_object('enabled',true,'canConfigure',false,'canEdit',song_access OR script_access,'canEditSongs',song_access,'canEditScript',script_access,'version',coalesce(r.version,0),'songs',coalesce(r.songs,'[]'),'script',coalesce(r.script,''));
END $$;

INSERT INTO private.repertoire_library(ministry_id,song)
SELECT pool.ministry_id,existing.song FROM private.music_ministries pool CROSS JOIN (
 SELECT l.song FROM private.repertoire_library l JOIN private.music_ministries m USING(ministry_id) WHERE NOT l.archived
 UNION SELECT s.value FROM private.event_repertoires r JOIN private.events e ON e.id=r.event_id
 JOIN private.music_ministries m ON m.ministry_id=e.ministry_id CROSS JOIN LATERAL jsonb_array_elements(r.songs) s
) existing WHERE pool.library_owner
ON CONFLICT(ministry_id,(md5(song::text))) DO UPDATE SET archived=false;

CREATE OR REPLACE FUNCTION private.scheduling_portal(op text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE me uuid;eid uuid;pid uuid;sid uuid;ev private.events;a private.event_assignments;s private.scale_swaps;
 st timestamptz;en timestamptz;freq text;tz text;cnt integer;i integer;result jsonb;newid uuid;groupid uuid;copied record; source_repertoire private.event_repertoires;
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

  IF coalesce((payload->>'copyRepertoire')::boolean,false) THEN
   IF NOT private.event_manager(ev.ministry_id) THEN RAISE EXCEPTION 'Somente a liderança responsável pode copiar o repertório.' USING ERRCODE='42501'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(ev.ministry_id::text,714));
   SELECT * INTO source_repertoire FROM private.event_repertoires WHERE event_id=eid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Salve o repertório antes de copiar para a série.'; END IF;
   IF (jsonb_array_length(source_repertoire.songs)>0 AND NOT private.content_allowed(ev.ministry_id,'songs')) OR
      (source_repertoire.script<>'' AND NOT private.content_allowed(ev.ministry_id,'script')) THEN RAISE insufficient_privilege; END IF;
   IF source_repertoire.version IS DISTINCT FROM (payload->>'repertoireVersion')::integer THEN RAISE EXCEPTION 'O repertório mudou. Confira novamente a série.'; END IF;
  END IF;

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
   IF coalesce((payload->>'copyRepertoire')::boolean,false) THEN
    INSERT INTO private.event_repertoires(event_id,songs,script) VALUES(newid,source_repertoire.songs,source_repertoire.script);
    INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.series_copied',newid,jsonb_build_object('sourceEventId',eid,'sourceVersion',source_repertoire.version,'songs',source_repertoire.songs,'script',source_repertoire.script));
   END IF;
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
END $function$
;
