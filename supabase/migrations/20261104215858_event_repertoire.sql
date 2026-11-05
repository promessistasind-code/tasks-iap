CREATE TABLE private.repertoire_settings(ministry_id uuid PRIMARY KEY REFERENCES private.ministries(id), enabled boolean NOT NULL DEFAULT false);
-- Retained independently after event removal; access always requires a visible live event.
CREATE TABLE private.event_repertoires(event_id uuid PRIMARY KEY, version integer NOT NULL DEFAULT 1, songs jsonb NOT NULL DEFAULT '[]', script text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.repertoire_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.event_repertoires ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.repertoire_settings,private.event_repertoires FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.repertoire_portal(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=(payload->>'eventId')::uuid; ev private.events; r private.event_repertoires; enabled boolean; editable boolean; song jsonb; field text; songs jsonb; script text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() OR NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento indisponível.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ev.ministry_id::text,714));
 SELECT coalesce(s.enabled,false) INTO enabled FROM private.repertoire_settings s WHERE ministry_id=ev.ministry_id;
 enabled:=coalesce(enabled,false);
 editable:=private.event_manager(ev.ministry_id) AND NOT ev.cancelled;
 IF op='configure' THEN
  IF NOT private.general_admin() THEN RAISE EXCEPTION 'Somente administrador geral pode habilitar o recurso.' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(payload->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
  enabled:=(payload->>'enabled')::boolean;
  INSERT INTO private.repertoire_settings VALUES(ev.ministry_id,enabled) ON CONFLICT(ministry_id) DO UPDATE SET enabled=excluded.enabled;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.configure',ev.ministry_id,jsonb_build_object('enabled',enabled));
 ELSIF op NOT IN ('read','save') THEN RAISE EXCEPTION 'Operação inválida.';
 END IF;
 SELECT * INTO r FROM private.event_repertoires WHERE event_id=eid;
 IF op='save' THEN
  IF NOT enabled OR NOT editable THEN RAISE EXCEPTION 'Sem permissão para editar o repertório.' USING ERRCODE='42501'; END IF;
  IF (payload->>'version')::integer IS DISTINCT FROM coalesce(r.version,0) THEN RAISE EXCEPTION 'Repertório alterado por outra pessoa. Cancele a edição e carregue novamente.'; END IF;
  songs:=payload->'songs'; script:=payload->>'script';
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
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'repertoire.saved',eid,to_jsonb(r));
 END IF;
 RETURN jsonb_build_object('enabled',enabled,'canConfigure',private.general_admin(),'canEdit',editable AND enabled,'version',coalesce(r.version,0),'songs',CASE WHEN enabled THEN coalesce(r.songs,'[]') ELSE '[]'::jsonb END,'script',CASE WHEN enabled THEN coalesce(r.script,'') ELSE '' END);
END $$;
REVOKE ALL ON FUNCTION private.repertoire_portal(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.repertoire_portal(text,jsonb) TO authenticated;
CREATE FUNCTION public.repertoire_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.repertoire_portal(op,payload) $$;
REVOKE ALL ON FUNCTION public.repertoire_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.repertoire_portal(text,jsonb) TO authenticated;
