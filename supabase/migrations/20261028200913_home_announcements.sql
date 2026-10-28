-- Additive migration. Existing completed tasks retain an unknown completion time.
ALTER TABLE public.lt_tasks ADD COLUMN completed_at timestamptz;
CREATE FUNCTION private.stamp_task_completion() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.completed_at:=CASE WHEN NEW.status='done' THEN now() ELSE NULL END;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN NEW.completed_at:=CASE WHEN NEW.status='done' THEN now() ELSE NULL END;
 ELSE NEW.completed_at:=OLD.completed_at; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stamp_task_completion BEFORE INSERT OR UPDATE ON public.lt_tasks FOR EACH ROW EXECUTE FUNCTION private.stamp_task_completion();
REVOKE ALL ON FUNCTION private.stamp_task_completion() FROM PUBLIC,anon,authenticated;

CREATE TABLE private.announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL DEFAULT '' CHECK(length(title)<=140),
 image_path text NOT NULL, image_alt text NOT NULL CHECK(length(image_alt) BETWEEN 1 AND 300),
 button_text text NOT NULL DEFAULT '' CHECK(length(button_text)<=60), button_url text NOT NULL DEFAULT '' CHECK(length(button_url)<=2000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at), CHECK((button_text='' AND button_url='') OR (button_text<>'' AND button_url ~ '^https://[^[:space:]]+$'))
);
CREATE TABLE private.announcement_editors (user_id uuid PRIMARY KEY REFERENCES public.profiles(id), granted_by uuid NOT NULL, granted_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.announcement_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.announcements,private.announcement_editors FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.can_manage_announcements() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.general_admin() OR (private.account_ready() AND EXISTS(
 SELECT 1 FROM private.announcement_editors e JOIN private.people p ON p.user_id=e.user_id
 JOIN private.ministry_members mm ON mm.person_id=p.id JOIN private.ministries m ON m.id=mm.ministry_id
 WHERE e.user_id=auth.uid() AND mm.active AND m.name='Ministério de Comunicação'))
$$;
CREATE FUNCTION private.can_read_banner(path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND (private.can_manage_announcements() OR EXISTS(SELECT 1 FROM private.announcements a WHERE a.image_path=path AND a.enabled AND a.starts_at<=now() AND a.ends_at>now()))
$$;
REVOKE ALL ON FUNCTION private.can_manage_announcements(),private.can_read_banner(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_announcements(),private.can_read_banner(text) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('announcement-images','announcement-images',false,2097152,ARRAY['image/webp','image/jpeg','image/png']);
CREATE POLICY banner_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='announcement-images' AND private.can_manage_announcements() AND (storage.foldername(name))[1]=auth.uid()::text AND name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|jpg|png)$');
CREATE POLICY banner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='announcement-images' AND private.can_read_banner(name));
-- No update/delete grants: immutable object paths. Cleanup will have its own reviewed flow.
CREATE FUNCTION private.announcement_portal(op text, payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE aid uuid; target uuid; img text; previous private.announcements; result jsonb;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active completed account required' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.starts_at DESC),'[]') INTO result FROM private.announcements a WHERE a.enabled AND a.starts_at<=now() AND a.ends_at>now();
  RETURN jsonb_build_object('canManage',private.can_manage_announcements(),'items',result,'nextChangeAt',(SELECT min(t) FROM (SELECT starts_at t FROM private.announcements WHERE enabled AND starts_at>now() UNION ALL SELECT ends_at FROM private.announcements WHERE enabled AND ends_at>now()) boundaries));
 ELSIF op='manage' AND private.can_manage_announcements() THEN
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),'[]') INTO result FROM (SELECT * FROM private.announcements ORDER BY created_at DESC LIMIT 200) a;
  RETURN result;
 ELSIF op='editors' AND private.general_admin() THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.first_name||' '||p.last_name,'enabled',EXISTS(SELECT 1 FROM private.announcement_editors e WHERE e.user_id=p.user_id)) ORDER BY p.first_name),'[]') INTO result
  FROM private.people p WHERE p.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM private.ministry_members mm JOIN private.ministries m ON m.id=mm.ministry_id WHERE mm.person_id=p.id AND mm.active AND m.name='Ministério de Comunicação');
  RETURN result;
 ELSIF op='grant' AND private.general_admin() THEN
  target:=(payload->>'userId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id JOIN private.ministries m ON m.id=mm.ministry_id WHERE p.user_id=target AND mm.active AND m.name='Ministério de Comunicação') THEN RAISE EXCEPTION 'Active Communication membership required'; END IF;
  IF (payload->>'enabled')::boolean THEN INSERT INTO private.announcement_editors(user_id,granted_by) VALUES(target,auth.uid()) ON CONFLICT(user_id) DO NOTHING;
  ELSE DELETE FROM private.announcement_editors WHERE user_id=target; END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'announcement.permission',target,jsonb_build_object('enabled',(payload->>'enabled')::boolean));
  RETURN '{"ok":true}';
 ELSIF op='save' AND private.can_manage_announcements() THEN
  aid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  SELECT * INTO previous FROM private.announcements WHERE id=aid FOR UPDATE;
  IF payload->>'id' IS NOT NULL AND previous.id IS NULL THEN RAISE EXCEPTION 'Banner not found'; END IF;
  img:=payload->>'image_path';
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='announcement-images' AND name=img) THEN RAISE EXCEPTION 'Upload image first'; END IF;
  IF previous.image_path IS DISTINCT FROM img AND split_part(img,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Use an image uploaded by your account' USING ERRCODE='42501'; END IF;
  INSERT INTO private.announcements(id,title,image_path,image_alt,button_text,button_url,starts_at,ends_at,enabled,created_by)
   VALUES(aid,trim(coalesce(payload->>'title','')),img,trim(payload->>'image_alt'),trim(coalesce(payload->>'button_text','')),trim(coalesce(payload->>'button_url','')),(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,coalesce((payload->>'enabled')::boolean,true),auth.uid())
   ON CONFLICT(id) DO UPDATE SET title=excluded.title,image_path=excluded.image_path,image_alt=excluded.image_alt,button_text=excluded.button_text,button_url=excluded.button_url,starts_at=excluded.starts_at,ends_at=excluded.ends_at,enabled=excluded.enabled,updated_at=now();
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'announcement.save',aid,payload-'image_path');
  RETURN jsonb_build_object('id',aid);
 END IF;
 RAISE EXCEPTION 'Operation not permitted' USING ERRCODE='42501';
END $$;
CREATE FUNCTION public.announcement_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.announcement_portal(op,payload) $$;
REVOKE ALL ON FUNCTION private.announcement_portal(text,jsonb),public.announcement_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.announcement_portal(text,jsonb),public.announcement_portal(text,jsonb) TO authenticated;
