-- Test identities and objects are rolled back; never upload fixture media to production.
BEGIN;
INSERT INTO auth.users(id,email) SELECT ('a1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'banner-'||i||'@example.invalid' FROM generate_series(1,3) i;
INSERT INTO public.profiles(id,email,name,initials,is_admin) SELECT id,email,'Banner test','BT',right(id::text,1)='1' FROM auth.users WHERE email LIKE 'banner-%@example.invalid';
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles WHERE email LIKE 'banner-%@example.invalid';
INSERT INTO private.people(id,user_id,first_name,last_name,email,phone,birth_date,consent_at)
 SELECT id,id,'Banner','Test',email,'11999999999','1990-01-01',now() FROM public.profiles WHERE email LIKE 'banner-%@example.invalid';
INSERT INTO private.general_admins VALUES('a1000000-0000-0000-0000-000000000001');
INSERT INTO private.ministry_members(person_id,ministry_id,added_by) SELECT 'a1000000-0000-0000-0000-000000000002',id,'a1000000-0000-0000-0000-000000000001' FROM private.ministries WHERE name='Ministério de Comunicação';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 IF (public.announcement_portal('list')->>'canManage')::boolean THEN RAISE EXCEPTION 'Member can manage'; END IF;
 BEGIN PERFORM public.announcement_portal('manage'); RAISE EXCEPTION 'Member read drafts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.announcement_portal('save','{}'); RAISE EXCEPTION 'Member saved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('announcement-images','a1000000-0000-0000-0000-000000000003/a3000000-0000-0000-0000-000000000001.webp'); RAISE EXCEPTION 'Member uploaded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
SELECT public.announcement_portal('grant','{"userId":"a1000000-0000-0000-0000-000000000002","enabled":true}');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
INSERT INTO storage.objects(bucket_id,name) VALUES('announcement-images','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp');
SELECT public.announcement_portal('save',jsonb_build_object('title','Active fixture','image_path','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp','image_alt','Test image','starts_at',now()-interval '1 hour','ends_at',now()+interval '1 hour'));
SELECT public.announcement_portal('save',jsonb_build_object('title','Future fixture','image_path','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp','image_alt','Test image','starts_at',now()+interval '1 day','ends_at',now()+interval '2 days'));
DO $$ BEGIN
 BEGIN PERFORM public.announcement_portal('grant','{"userId":"a1000000-0000-0000-0000-000000000003","enabled":true}'); RAISE EXCEPTION 'Delegate granted access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.announcement_portal('save',jsonb_build_object('title','Unsafe','image_path','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp','image_alt','Test','button_text','Click','button_url','javascript:alert(1)','starts_at',now(),'ends_at',now()+interval '1 day')); RAISE EXCEPTION 'Unsafe URL accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT public.announcement_portal('save',jsonb_build_object('title','Expired fixture','image_path','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp','image_alt','Test image','starts_at',now()-interval '2 days','ends_at',now()-interval '1 day'));
SELECT public.announcement_portal('save',jsonb_build_object('title','Disabled fixture','image_path','a1000000-0000-0000-0000-000000000002/a3000000-0000-0000-0000-000000000001.webp','image_alt','Test image','starts_at',now()-interval '1 hour','ends_at',now()+interval '1 hour','enabled',false));
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 IF jsonb_array_length(public.announcement_portal('list')->'items')<>1 THEN RAISE EXCEPTION 'Draft/expired visibility incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='announcement-images') THEN RAISE EXCEPTION 'Cannot read active image'; END IF;
END $$;
RESET ROLE;
UPDATE private.ministry_members SET active=false WHERE person_id='a1000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF private.can_manage_announcements() THEN RAISE EXCEPTION 'Revoked member still manages'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
INSERT INTO public.lt_projects(id,name,color,emoji,created_by,ministry_id) VALUES('a4000000-0000-0000-0000-000000000001','Completion fixture','#fff','folder',auth.uid(),(public.people_portal('catalog')->0->>'id')::uuid);
INSERT INTO public.lt_tasks(id,title,project_id,status,completed_at) VALUES('a5000000-0000-0000-0000-000000000001','Completion fixture','a4000000-0000-0000-0000-000000000001','todo',now());
DO $$ BEGIN
 IF (SELECT completed_at IS NOT NULL FROM public.lt_tasks WHERE id='a5000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Completion forged on insert'; END IF;
 UPDATE public.lt_tasks SET status='done' WHERE id='a5000000-0000-0000-0000-000000000001';
 UPDATE public.lt_tasks SET completed_at='2000-01-01' WHERE id='a5000000-0000-0000-0000-000000000001';
 IF NOT (SELECT completed_at=now() FROM public.lt_tasks WHERE id='a5000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Completion not preserved'; END IF;
 UPDATE public.lt_tasks SET status='todo' WHERE id='a5000000-0000-0000-0000-000000000001';
 IF (SELECT completed_at IS NOT NULL FROM public.lt_tasks WHERE id='a5000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Reopen retains completion'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.announcement_portal('list'); RAISE EXCEPTION 'Anonymous could read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'banner authorization tests passed; fixtures rolled back' AS result;
