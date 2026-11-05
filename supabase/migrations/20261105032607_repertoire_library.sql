CREATE TABLE private.repertoire_library (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ministry_id uuid NOT NULL REFERENCES private.ministries(id),
 song jsonb NOT NULL, archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repertoire_library_content ON private.repertoire_library(ministry_id,md5(song::text));
ALTER TABLE private.repertoire_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.repertoire_library FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.repertoire_library_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=(payload->>'eventId')::uuid; ev private.events; v_song jsonb; field text; sid uuid; result jsonb; off integer:=coalesce((payload->>'offset')::integer,0); term text:=coalesce(payload->>'search','');
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() OR NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT FOUND OR NOT private.event_manager(ev.ministry_id) THEN RAISE EXCEPTION 'Somente a liderança responsável pode acessar a biblioteca.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ev.ministry_id::text,714));
 IF NOT EXISTS(SELECT 1 FROM private.repertoire_settings WHERE ministry_id=ev.ministry_id AND enabled) THEN RAISE EXCEPTION 'Repertório desabilitado.' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  IF off<0 OR off>100000 OR length(term)>200 THEN RAISE EXCEPTION 'Consulta inválida.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO result FROM
   (SELECT id,song FROM private.repertoire_library WHERE ministry_id=ev.ministry_id AND NOT archived AND
    (position(lower(term) in lower(song->>'title'))>0 OR position(lower(term) in lower(song->>'version'))>0)
    ORDER BY lower(song->>'title'),id LIMIT 51 OFFSET off) s;
  RETURN result;
 END IF;
 IF ev.cancelled THEN RAISE EXCEPTION 'Evento cancelado: biblioteca somente para consulta.' USING ERRCODE='42501'; END IF;
 IF op='save' THEN
  v_song:=payload->'song';
  IF jsonb_typeof(v_song) IS DISTINCT FROM 'object' OR octet_length(v_song::text)>20000 THEN RAISE EXCEPTION 'Música inválida.'; END IF;
  FOREACH field IN ARRAY ARRAY['title','key','version','chords','url'] LOOP
   IF jsonb_typeof(v_song->field) IS DISTINCT FROM 'string' OR length(v_song->>field)>(CASE field WHEN 'chords' THEN 10000 WHEN 'url' THEN 2000 ELSE 200 END) THEN RAISE EXCEPTION 'Campo de música inválido.'; END IF;
  END LOOP;
  IF length(trim(v_song->>'title'))=0 OR ((v_song->>'url')<>'' AND (v_song->>'url')!~* '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'Informe título e link HTTP/HTTPS válido.'; END IF;
  v_song:=jsonb_build_object('title',trim(v_song->>'title'),'key',v_song->>'key','version',v_song->>'version','chords',v_song->>'chords','url',v_song->>'url');
  INSERT INTO private.repertoire_library(ministry_id,song) VALUES(ev.ministry_id,v_song)
   ON CONFLICT(ministry_id,(md5(song::text))) DO UPDATE SET archived=false,updated_at=now() RETURNING id INTO sid;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.library.saved',sid,v_song);
  RETURN jsonb_build_object('id',sid,'song',v_song);
 ELSIF op='archive' THEN
  UPDATE private.repertoire_library SET archived=true,updated_at=now() WHERE id=(payload->>'id')::uuid AND ministry_id=ev.ministry_id AND NOT archived RETURNING id INTO sid;
  IF sid IS NULL THEN RAISE EXCEPTION 'Música indisponível.' USING ERRCODE='42501'; END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.library.archived',sid,'{}');
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Operação inválida.';
END $$;
REVOKE ALL ON FUNCTION private.repertoire_library_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.repertoire_library_portal(text,jsonb) TO authenticated;
CREATE FUNCTION public.repertoire_library_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.repertoire_library_portal(op,payload) $$;
REVOKE ALL ON FUNCTION public.repertoire_library_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.repertoire_library_portal(text,jsonb) TO authenticated;
