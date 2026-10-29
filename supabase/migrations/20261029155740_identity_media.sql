CREATE TABLE private.branding(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),name text NOT NULL DEFAULT 'Promessa Industrial' CHECK(length(trim(name)) BETWEEN 1 AND 80),logo_path text,favicon_path text);
INSERT INTO private.branding(singleton) VALUES(true);
CREATE TABLE private.profile_images(user_id uuid PRIMARY KEY REFERENCES public.profiles(id),path text NOT NULL);
CREATE TABLE private.media_deletions(bucket text NOT NULL,path text NOT NULL,object_id uuid NOT NULL,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,PRIMARY KEY(bucket,path));
ALTER TABLE private.branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.media_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.branding,private.profile_images,private.media_deletions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.media_used(b text,p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN b='identity-images' THEN EXISTS(SELECT 1 FROM private.branding WHERE logo_path=p OR favicon_path=p) OR EXISTS(SELECT 1 FROM private.profile_images WHERE path=p)
 WHEN b='announcement-images' THEN EXISTS(SELECT 1 FROM private.announcements WHERE image_path=p) ELSE true END
$$;
CREATE FUNCTION private.media_available(b text,p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM private.media_deletions WHERE bucket=b AND path=p)
$$;
CREATE FUNCTION private.assert_media_reference(b text,p text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(71250340);
 IF p IS NOT NULL AND (NOT private.media_available(b,p) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=b AND name=p)) THEN RAISE EXCEPTION 'Image missing or reserved for deletion'; END IF;
END $$;
CREATE FUNCTION private.guard_banner_media() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM private.assert_media_reference('announcement-images',NEW.image_path); RETURN NEW;
END $$;
CREATE TRIGGER guard_banner_media BEFORE INSERT OR UPDATE OF image_path ON private.announcements FOR EACH ROW EXECUTE FUNCTION private.guard_banner_media();
CREATE FUNCTION private.media_delete_allowed(b text,p text,oid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.general_admin() AND NOT private.media_used(b,p) AND EXISTS(SELECT 1 FROM private.media_deletions WHERE bucket=b AND path=p AND object_id=oid AND actor=auth.uid())
$$;
REVOKE ALL ON FUNCTION private.media_used(text,text),private.media_available(text,text),private.assert_media_reference(text,text),private.guard_banner_media(),private.media_delete_allowed(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.media_available(text,text),private.media_delete_allowed(text,text,uuid) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('identity-images','identity-images',false,2097152,ARRAY['image/webp','image/jpeg','image/png']);
CREATE POLICY identity_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='identity-images' AND private.account_ready() AND (storage.foldername(name))[1]=auth.uid()::text AND name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|jpg|png)$');
CREATE POLICY media_upload_not_deleted ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id NOT IN ('identity-images','announcement-images') OR private.media_available(bucket_id,name));
CREATE FUNCTION private.identity_read(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND (private.general_admin() OR EXISTS(SELECT 1 FROM private.branding WHERE logo_path=p OR favicon_path=p) OR EXISTS(SELECT 1 FROM private.profile_images i WHERE i.path=p AND private.visible_profile(i.user_id)) OR split_part(p,'/',1)=auth.uid()::text)
$$;
REVOKE ALL ON FUNCTION private.identity_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.identity_read(text) TO authenticated;
CREATE POLICY identity_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='identity-images' AND private.identity_read(name));
CREATE POLICY media_admin_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id IN ('identity-images','announcement-images') AND private.general_admin());
CREATE POLICY media_confirmed_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id IN ('identity-images','announcement-images') AND private.media_delete_allowed(bucket_id,name,id));
