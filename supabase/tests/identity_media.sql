BEGIN;
INSERT INTO auth.users(id,email) SELECT ('b1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'media-'||i||'@example.invalid' FROM generate_series(1,2)i;
INSERT INTO public.profiles(id,email,name,initials,is_admin) SELECT id,email,'Media test','MT',true FROM auth.users WHERE email LIKE 'media-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'media-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at) SELECT id,id,'Media','Test',email,'11999999999','1990-01-01',now() FROM public.profiles WHERE email LIKE 'media-%@example.invalid';
INSERT INTO private.general_admins VALUES('b1000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES('b2000000-0000-0000-0000-000000000002','identity-images','b1000000-0000-0000-0000-000000000002/b3000000-0000-0000-0000-000000000002.webp','{"size":100}');
SELECT public.media_portal('avatar','{"path":"b1000000-0000-0000-0000-000000000002/b3000000-0000-0000-0000-000000000002.webp"}');
DO $$ BEGIN
 IF public.media_portal('read')->'avatars'->>auth.uid()::text IS NULL THEN RAISE EXCEPTION 'Own avatar missing'; END IF;
 BEGIN PERFORM public.media_portal('brand','{"name":"Forbidden"}');RAISE EXCEPTION 'Member changed branding';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.media_portal('inventory');RAISE EXCEPTION 'Member read inventory';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.media_portal('reserveDeletion','{"confirmed":true,"items":[]}');RAISE EXCEPTION 'Member reserved deletion';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.media_portal('avatar','{"path":"b1000000-0000-0000-0000-000000000001/nonexistent.webp"}');RAISE EXCEPTION 'Missing image accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Missing image accepted' THEN RAISE;END IF;END;
END $$;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES('b2000000-0000-0000-0000-000000000001','identity-images','b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001.webp','{"size":100}'),('b2000000-0000-0000-0000-000000000003','identity-images','b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000003.webp','{"size":100}');
SELECT public.media_portal('brand','{"name":"Test Church","logo_path":"b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001.webp","favicon_path":null}');
DO $$ DECLARE item jsonb; BEGIN
 IF public.media_portal('read')->'brand'->>'name'<>'Test Church' THEN RAISE EXCEPTION 'Brand not saved';END IF;
 PERFORM public.media_portal('inventory');
 item:=jsonb_build_object('id','b2000000-0000-0000-0000-000000000001','bucket','identity-images','path','b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001.webp','sha256',repeat('a',64));
 BEGIN PERFORM public.media_portal('reserveDeletion',jsonb_build_object('confirmed',true,'items',jsonb_build_array(item)));RAISE EXCEPTION 'Current logo deletion allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Current logo deletion allowed' THEN RAISE;END IF;END;
 item:=item||jsonb_build_object('id','b2000000-0000-0000-0000-000000000003','path','b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000003.webp');
 IF private.media_delete_allowed('identity-images',item->>'path','b2000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Deletion allowed before confirmation';END IF;
 PERFORM public.media_portal('reserveDeletion',jsonb_build_object('confirmed',true,'items',jsonb_build_array(item)));
 IF NOT private.media_delete_allowed('identity-images',item->>'path','b2000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Confirmed unused file blocked';END IF;
 BEGIN PERFORM public.media_portal('avatar',jsonb_build_object('path',item->>'path'));RAISE EXCEPTION 'Reserved image reused';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Reserved image reused' THEN RAISE;END IF;END;
 BEGIN PERFORM public.media_portal('finishDeletion',jsonb_build_object('items',jsonb_build_array(item)));RAISE EXCEPTION 'Reported deletion while object remains';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Reported deletion while object remains' THEN RAISE;END IF;END;
END $$;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 BEGIN PERFORM public.media_portal('avatar','{"path":"b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001.webp"}');RAISE EXCEPTION 'Another account image accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.media_portal('read');RAISE EXCEPTION 'Anonymous read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'media security passed; no files deleted; fixtures rolled back' AS result;
