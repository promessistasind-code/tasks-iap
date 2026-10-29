CREATE FUNCTION private.media_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p text; b text; result jsonb; item jsonb; obj storage.objects; previous private.branding; off integer;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF op='read' THEN
  RETURN jsonb_build_object('brand',(SELECT to_jsonb(v)-'singleton' FROM private.branding v),'avatars',(SELECT coalesce(jsonb_object_agg(user_id,path),'{}') FROM private.profile_images WHERE private.visible_profile(user_id)));
 ELSIF op='avatar' THEN
  p:=nullif(payload->>'path','');
  PERFORM private.assert_media_reference('identity-images',p);
  IF p IS NOT NULL AND split_part(p,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Own image required' USING ERRCODE='42501'; END IF;
  IF p IS NULL THEN DELETE FROM private.profile_images WHERE user_id=auth.uid();
  ELSE INSERT INTO private.profile_images(user_id,path) VALUES(auth.uid(),p) ON CONFLICT(user_id) DO UPDATE SET path=excluded.path; END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'media.avatar',auth.uid(),jsonb_build_object('path',p));
  RETURN '{"ok":true}';
 END IF;
 IF NOT private.general_admin() THEN RAISE EXCEPTION 'General administrator required' USING ERRCODE='42501'; END IF;
 IF op='brand' THEN
  PERFORM pg_advisory_xact_lock(71250340);
  SELECT * INTO previous FROM private.branding FOR UPDATE;
  FOREACH b IN ARRAY ARRAY['logo_path','favicon_path'] LOOP
   p:=nullif(payload->>b,'');
   PERFORM private.assert_media_reference('identity-images',p);
   IF p IS NOT NULL AND p IS DISTINCT FROM (to_jsonb(previous)->>b) AND split_part(p,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Own upload required'; END IF;
  END LOOP;
  UPDATE private.branding SET name=trim(payload->>'name'),logo_path=nullif(payload->>'logo_path',''),favicon_path=nullif(payload->>'favicon_path','');
  INSERT INTO private.people_audit(actor_id,action,details) VALUES(auth.uid(),'media.brand',payload);
  RETURN '{"ok":true}';

 ELSE RETURN private.media_cleanup(op,payload); END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;
CREATE FUNCTION public.media_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.media_portal(op,payload) $$;
REVOKE ALL ON FUNCTION private.media_portal(text,jsonb),public.media_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.media_portal(text,jsonb),public.media_portal(text,jsonb) TO authenticated;
