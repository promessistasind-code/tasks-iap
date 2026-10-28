-- Private personal data. Only validated RPC projections expose it to clients.
CREATE TABLE private.people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES public.profiles(id),
 first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', birth_date date,
 consent_at timestamptz, consent_by uuid, consent_version text,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(birth_date IS NULL OR birth_date >= DATE '1900-01-01')
);
CREATE TABLE private.account_access (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true, password_required boolean NOT NULL DEFAULT false,
 reset_in_progress boolean NOT NULL DEFAULT false, reset_after timestamptz, reset_token uuid
);
CREATE TABLE private.general_admins (user_id uuid PRIMARY KEY REFERENCES public.profiles(id));
INSERT INTO private.general_admins SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.is_admin AND lower(u.email) IN ('denisson2010@hotmail.com','promessistasind@gmail.com');
DO $$ BEGIN IF (SELECT count(*) FROM private.general_admins) <> 2 THEN RAISE EXCEPTION 'Verify general administrator accounts'; END IF; END $$;
CREATE TABLE private.ministries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE private.ministry_functions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ministry_id uuid NOT NULL REFERENCES private.ministries(id), name text NOT NULL, UNIQUE(ministry_id,name));
CREATE TABLE private.ministry_members (
 person_id uuid NOT NULL REFERENCES private.people(id), ministry_id uuid NOT NULL REFERENCES private.ministries(id),
 function_ids uuid[] NOT NULL DEFAULT '{}', leader boolean NOT NULL DEFAULT false,
 can_add boolean NOT NULL DEFAULT false, can_edit_roles boolean NOT NULL DEFAULT false, can_remove boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, added_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(person_id,ministry_id)
);
CREATE INDEX ministry_members_ministry ON private.ministry_members(ministry_id,person_id) WHERE active;
INSERT INTO private.ministries(name) VALUES ('Ministério de Celebração');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['baterista','baixista','vocalista','ministrante','guitarrista','violonista','tecladista','operador de som']) r WHERE m.name='Ministério de Celebração';
INSERT INTO private.ministries(name) VALUES ('Ministério de Comunicação');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['operador de projeção','fotografia','filmagem','operador de iluminação','operador de live','media social','operador de som']) r WHERE m.name='Ministério de Comunicação';
INSERT INTO private.ministries(name) VALUES ('Ministério de Ensino');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Mensageiro','Professor']) r WHERE m.name='Ministério de Ensino';
INSERT INTO private.ministries(name) VALUES ('Ministério de mulheres');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Colaboradora']) r WHERE m.name='Ministério de mulheres';
INSERT INTO private.ministries(name) VALUES ('Ministério de Homens');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Colaborador']) r WHERE m.name='Ministério de Homens';
INSERT INTO private.ministries(name) VALUES ('Junta Diaconal');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Recepção','Limpeza','Auxiliar de ceia']) r WHERE m.name='Junta Diaconal';
INSERT INTO private.ministries(name) VALUES ('Ministério de Crianças e adolescentes');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Professor','Professora','Auxiliar de sala']) r WHERE m.name='Ministério de Crianças e adolescentes';
INSERT INTO private.ministries(name) VALUES ('Ministério de Proclamação');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Colaborador']) r WHERE m.name='Ministério de Proclamação';
INSERT INTO private.ministries(name) VALUES ('Ministério de Jovens');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Professor','Professora','Auxiliar de sala','Colaborador']) r WHERE m.name='Ministério de Jovens';
INSERT INTO private.ministries(name) VALUES ('Ministério de Recepção');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Recepção']) r WHERE m.name='Ministério de Recepção';
INSERT INTO private.ministries(name) VALUES ('Ministério de Intercessão');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Intercessor','Colaborador']) r WHERE m.name='Ministério de Intercessão';
INSERT INTO private.ministries(name) VALUES ('Pastor');
INSERT INTO private.ministry_functions(ministry_id,name) SELECT m.id,r FROM private.ministries m CROSS JOIN unnest(ARRAY['Titular','Auxiliar']) r WHERE m.name='Pastor';
CREATE TABLE private.people_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, action text NOT NULL,
 entity_id uuid, ministry_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.people_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES private.people(id),
 requested_by uuid NOT NULL, message text NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
 resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.account_access(user_id) SELECT id FROM public.profiles;
INSERT INTO private.people(user_id,first_name,email,created_by)
 SELECT id,name,email,id FROM public.profiles;
-- Existing personal information is not considered consented automatically.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT table_name FROM information_schema.tables WHERE table_schema='private' LOOP
   EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',r.table_name);
   EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC, anon, authenticated',r.table_name);
 END LOOP;
END $$;

CREATE FUNCTION private.account_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM private.account_access a JOIN private.people p ON p.user_id=a.user_id
  WHERE a.user_id=auth.uid() AND a.active AND NOT a.password_required AND NOT a.reset_in_progress
    AND p.consent_at IS NOT NULL AND p.first_name<>'' AND p.last_name<>'' AND p.phone<>'' AND p.email<>'' AND p.birth_date IS NOT NULL
    AND (a.reset_after IS NULL OR EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=(auth.jwt()->>'session_id')::uuid AND s.user_id=a.user_id AND s.created_at>a.reset_after))
 )
$$;
CREATE FUNCTION private.general_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.general_admins g JOIN public.profiles p ON p.id=g.user_id WHERE g.user_id=auth.uid() AND p.is_admin)
$$;
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_admin)
$$;
CREATE FUNCTION private.ministry_leader(mid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id WHERE p.user_id=auth.uid() AND m.ministry_id=mid AND m.active AND m.leader)
$$;
CREATE FUNCTION private.can_contact(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.is_admin() OR EXISTS(SELECT 1 FROM private.people p WHERE p.id=pid AND p.user_id=auth.uid()) OR EXISTS(
 SELECT 1 FROM private.ministry_members m WHERE m.person_id=pid AND m.active AND private.ministry_leader(m.ministry_id))
$$;

-- Password changes are observed in Auth, not acknowledged by an untrusted client.
CREATE FUNCTION private.observe_password_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
  UPDATE private.account_access SET password_required=false WHERE user_id=NEW.id AND NOT reset_in_progress;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER people_password_change AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION private.observe_password_change();

-- Legacy tasks identify their assignee by display name; preserve assignments.
-- Refuse an ambiguous rename rather than silently reassign another person's tasks.
CREATE FUNCTION private.preserve_assignee_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.name IS DISTINCT FROM OLD.name AND EXISTS(SELECT 1 FROM public.lt_tasks WHERE assignee=OLD.name) THEN
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id<>OLD.id AND name IN (OLD.name,NEW.name)) THEN
   RAISE EXCEPTION 'Ambiguous task assignee; administrator must resolve duplicate display names first';
  END IF;
  UPDATE public.lt_tasks SET assignee=NEW.name WHERE assignee=OLD.name;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.preserve_assignee_name() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_assignee_name BEFORE UPDATE OF name ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.preserve_assignee_name();

-- Restrictive policies preserve the existing project/note ownership rules.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'lt\_%' ESCAPE '\' LOOP
  EXECUTE format('CREATE POLICY account_ready_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.account_ready())) WITH CHECK ((SELECT private.account_ready()))',r.tablename);
 END LOOP;
END $$;
CREATE POLICY account_ready_storage_gate ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT private.account_ready())) WITH CHECK ((SELECT private.account_ready()));

-- Contact information must not leak through profiles, including select=*.
REVOKE SELECT,UPDATE ON public.profiles FROM authenticated,anon;
GRANT SELECT(id,name,color,initials,is_admin,created_at) ON public.profiles TO authenticated;
CREATE POLICY account_profile_gate ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING (id=(SELECT auth.uid()) OR ((SELECT private.account_ready()) AND EXISTS(SELECT 1 FROM private.people p WHERE p.user_id=id AND p.consent_at IS NOT NULL)));
-- The policy lookup uses a helper because clients cannot read private tables.
CREATE FUNCTION private.visible_profile(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT uid=auth.uid() OR (private.account_ready() AND EXISTS(SELECT 1 FROM private.people WHERE user_id=uid AND consent_at IS NOT NULL))
$$;
ALTER POLICY account_profile_gate ON public.profiles USING (private.visible_profile(id));

-- Guard existing SECURITY DEFINER invite helpers before their first statement.
DO $$ DECLARE r record; definition text; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('send_project_invite','respond_project_invite','cancel_project_invite') LOOP
  definition := pg_get_functiondef(r.oid);
  definition := regexp_replace(definition, '\mBEGIN\M', E'BEGIN\n IF NOT private.account_ready() THEN RAISE EXCEPTION ''Complete account registration'' USING ERRCODE=''42501''; END IF;', 'i');
  EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION private.people_portal(op text, payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); pid uuid; mid uuid; target uuid; person private.people; access private.account_access;
 membership private.ministry_members; mine private.ministry_members; result jsonb; functions uuid[]; approved boolean;
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO access FROM private.account_access WHERE user_id=me;
 IF NOT FOUND OR NOT access.active THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 IF op='status' THEN
  SELECT * INTO person FROM private.people WHERE user_id=me;
  RETURN jsonb_build_object('ready',private.account_ready(),'passwordRequired',access.password_required,'resetInProgress',access.reset_in_progress,
   'consented',person.consent_at IS NOT NULL,'firstName',person.first_name,'lastName',person.last_name,'phone',person.phone,'birthDate',person.birth_date,'email',person.email,
   'isAdmin',private.is_admin(),'isGeneralAdmin',private.general_admin(),
   'isLeader',EXISTS(SELECT 1 FROM private.ministry_members WHERE person_id=person.id AND active AND leader));
 END IF;
 IF op='complete' THEN
  IF payload->>'consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Consent required'; END IF;
  IF access.password_required OR access.reset_in_progress THEN RAISE EXCEPTION 'Change temporary password first'; END IF;
  IF (SELECT consent_at FROM private.people WHERE user_id=me) IS NOT NULL THEN RAISE EXCEPTION 'Request central registration changes from administrator'; END IF;
  IF coalesce(trim(payload->>'firstName'),'')='' OR coalesce(trim(payload->>'lastName'),'')='' OR coalesce(trim(payload->>'phone'),'')='' THEN RAISE EXCEPTION 'Name, surname and phone required'; END IF;
  IF (payload->>'birthDate')::date IS NULL OR (payload->>'birthDate')::date > current_date OR (payload->>'birthDate')::date < DATE '1900-01-01' THEN RAISE EXCEPTION 'Invalid birth date'; END IF;
  UPDATE private.people SET first_name=trim(payload->>'firstName'),last_name=trim(payload->>'lastName'),phone=trim(payload->>'phone'),birth_date=(payload->>'birthDate')::date,
   consent_at=now(),consent_by=me,consent_version='2026-10-28-v1' WHERE user_id=me RETURNING id INTO pid;
  UPDATE public.profiles SET name=trim(payload->>'firstName')||' '||split_part(trim(payload->>'lastName'),' ',1),initials=upper(left(trim(payload->>'firstName'),1)||left(trim(payload->>'lastName'),1)) WHERE id=me;
  INSERT INTO private.people_audit(actor_id,action,entity_id) VALUES(me,'consent.accepted',pid);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Complete account registration' USING ERRCODE='42501'; END IF;
 IF op='directory' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'firstName',p.first_name,'lastName',p.last_name,
   'email',CASE WHEN private.can_contact(p.id) THEN p.email END,'phone',CASE WHEN private.can_contact(p.id) THEN p.phone END,
   'birthdayMonth',extract(month from p.birth_date),'birthdayDay',extract(day from p.birth_date)) ORDER BY p.first_name,p.last_name),'[]') INTO result
  FROM private.people p WHERE p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access WHERE user_id=p.user_id AND active));
  RETURN result;
 END IF;
 IF op='catalog' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) ORDER BY f.name),'[]') FROM private.ministry_functions f WHERE f.ministry_id=m.id)) ORDER BY m.name),'[]') INTO result FROM private.ministries m;
  RETURN result;
 END IF;
 IF op='management' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'firstName',p.first_name,'lastName',p.last_name,
    'email',CASE WHEN private.can_contact(p.id) THEN p.email END,'phone',CASE WHEN private.can_contact(p.id) THEN p.phone END,
    'birthDate',CASE WHEN private.is_admin() OR p.user_id=me THEN p.birth_date END,
    'consented',p.consent_at IS NOT NULL,'isAdmin',coalesce(pr.is_admin,false),'active',coalesce(a.active,true),
    'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') FROM private.ministry_members m WHERE m.person_id=p.id AND (private.is_admin() OR (m.added_by=me AND private.ministry_leader(m.ministry_id))))) ORDER BY p.first_name),'[]') INTO result
  FROM private.people p LEFT JOIN public.profiles pr ON pr.id=p.user_id LEFT JOIN private.account_access a ON a.user_id=p.user_id
  WHERE private.is_admin() OR (p.consent_at IS NOT NULL AND EXISTS(SELECT 1 FROM private.ministry_members m WHERE m.person_id=p.id AND m.added_by=me AND private.ministry_leader(m.ministry_id)));
  RETURN result;
 END IF;
 IF op='myMemberships' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') INTO result FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id WHERE p.user_id=me AND m.active;
  RETURN result;
 END IF;
 IF op='membership' THEN
  pid:=(payload->>'personId')::uuid; mid:=(payload->>'ministryId')::uuid;
  -- Serialize all changes in a ministry; recheck privileges after locking.
  PERFORM 1 FROM private.ministries WHERE id=mid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid ministry'; END IF;
  SELECT * INTO membership FROM private.ministry_members WHERE person_id=pid AND ministry_id=mid;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO functions FROM jsonb_array_elements_text(coalesce(payload->'functionIds','[]'));
  SELECT m.* INTO mine FROM private.ministry_members m JOIN private.people p ON p.id=m.person_id WHERE m.ministry_id=mid AND p.user_id=me AND m.active;
  IF NOT private.is_admin() THEN
   IF NOT coalesce(mine.leader,false) THEN RAISE EXCEPTION 'Leader required' USING ERRCODE='42501'; END IF;
   IF membership.person_id IS NULL AND NOT mine.can_add THEN RAISE EXCEPTION 'Adding members denied' USING ERRCODE='42501'; END IF;
   IF membership.person_id IS NOT NULL AND membership.added_by<>me THEN RAISE EXCEPTION 'Member outside delegated scope' USING ERRCODE='42501'; END IF;
   IF membership.person_id IS NOT NULL AND functions IS DISTINCT FROM membership.function_ids AND NOT mine.can_edit_roles THEN RAISE EXCEPTION 'Changing functions denied' USING ERRCODE='42501'; END IF;
   IF membership.person_id IS NOT NULL AND NOT membership.active AND coalesce((payload->>'active')::boolean,true) AND NOT mine.can_add THEN RAISE EXCEPTION 'Reactivating members denied' USING ERRCODE='42501'; END IF;
   IF payload->>'active'='false' AND NOT mine.can_remove THEN RAISE EXCEPTION 'Removing members denied' USING ERRCODE='42501'; END IF;
   IF coalesce((payload->>'leader')::boolean,false) IS DISTINCT FROM coalesce(membership.leader,false)
    OR coalesce((payload->>'canAdd')::boolean,false) IS DISTINCT FROM coalesce(membership.can_add,false)
    OR coalesce((payload->>'canEditRoles')::boolean,false) IS DISTINCT FROM coalesce(membership.can_edit_roles,false)
    OR coalesce((payload->>'canRemove')::boolean,false) IS DISTINCT FROM coalesce(membership.can_remove,false)
    THEN RAISE EXCEPTION 'Only administrators grant permissions' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM private.people WHERE id=pid AND consent_at IS NOT NULL) THEN RAISE EXCEPTION 'Person unavailable'; END IF;
  END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO functions FROM jsonb_array_elements_text(coalesce(payload->'functionIds','[]'));
  IF EXISTS(SELECT 1 FROM unnest(functions) f WHERE NOT EXISTS(SELECT 1 FROM private.ministry_functions WHERE id=f AND ministry_id=mid)) THEN RAISE EXCEPTION 'Function outside ministry'; END IF;
  INSERT INTO private.ministry_members(person_id,ministry_id,function_ids,leader,can_add,can_edit_roles,can_remove,active,added_by)
  VALUES(pid,mid,functions,coalesce((payload->>'leader')::boolean,false),coalesce((payload->>'canAdd')::boolean,false),coalesce((payload->>'canEditRoles')::boolean,false),coalesce((payload->>'canRemove')::boolean,false),coalesce((payload->>'active')::boolean,true),me)
  ON CONFLICT(person_id,ministry_id) DO UPDATE SET function_ids=excluded.function_ids,leader=excluded.leader,can_add=excluded.can_add,can_edit_roles=excluded.can_edit_roles,can_remove=excluded.can_remove,active=excluded.active;
  INSERT INTO private.people_audit(actor_id,action,entity_id,ministry_id,details) VALUES(me,'membership.changed',pid,mid,payload-'personId'-'ministryId');
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF op='requestChange' THEN
  pid:=(payload->>'personId')::uuid;
  IF NOT private.can_contact(pid) THEN RAISE EXCEPTION 'Person outside scope' USING ERRCODE='42501'; END IF;
  INSERT INTO private.people_change_requests(person_id,requested_by,message) VALUES(pid,me,trim(payload->>'message'));
  INSERT INTO private.people_audit(actor_id,action,entity_id) VALUES(me,'person.change_requested',pid);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF op='audit' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT * FROM private.people_audit WHERE id<coalesce((payload->>'before')::bigint,9223372036854775807) ORDER BY id DESC LIMIT 100) q; RETURN result;
 END IF;
 IF op='requests' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT * FROM private.people_change_requests WHERE NOT resolved ORDER BY created_at LIMIT 100) q; RETURN result;
 END IF;
 IF op='resolveRequest' THEN
  UPDATE private.people_change_requests SET resolved=true WHERE id=(payload->>'id')::uuid;
  INSERT INTO private.people_audit(actor_id,action,entity_id) VALUES(me,'person.request_resolved',(payload->>'id')::uuid); RETURN jsonb_build_object('ok',true);
 END IF;
 IF op='account' THEN
  target:=(payload->>'userId')::uuid;
  IF EXISTS(SELECT 1 FROM private.general_admins WHERE user_id=target) THEN RAISE EXCEPTION 'General administrator account is protected'; END IF;
  IF payload ? 'isAdmin' AND NOT private.general_admin() THEN RAISE EXCEPTION 'General administrator required' USING ERRCODE='42501'; END IF;
  IF payload ? 'isAdmin' THEN UPDATE public.profiles SET is_admin=(payload->>'isAdmin')::boolean WHERE id=target; END IF;
  IF payload ? 'active' THEN UPDATE private.account_access SET active=(payload->>'active')::boolean WHERE user_id=target; END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(me,'account.permissions_changed',target,payload-'userId'); RETURN jsonb_build_object('ok',true);
 END IF;
 IF op='savePerson' THEN
  pid:=nullif(payload->>'id','')::uuid;
  IF coalesce(trim(payload->>'firstName'),'')='' OR coalesce(trim(payload->>'lastName'),'')='' OR coalesce(trim(payload->>'phone'),'')='' OR coalesce(trim(payload->>'email'),'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'All registration fields are required'; END IF;
  IF (payload->>'birthDate')::date IS NULL OR (payload->>'birthDate')::date>current_date THEN RAISE EXCEPTION 'Invalid birth date'; END IF;
  approved:=coalesce((payload->>'consent')::boolean,false);
  IF pid IS NULL THEN
   IF NOT approved THEN RAISE EXCEPTION 'Consent required for person without login'; END IF;
   INSERT INTO private.people(first_name,last_name,email,phone,birth_date,consent_at,consent_by,consent_version,created_by)
   VALUES(trim(payload->>'firstName'),trim(payload->>'lastName'),lower(trim(payload->>'email')),trim(payload->>'phone'),(payload->>'birthDate')::date,now(),me,'2026-10-28-v1',me) RETURNING id INTO pid;
  ELSE
   SELECT * INTO person FROM private.people WHERE id=pid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;
   IF person.user_id IS NOT NULL AND lower(trim(payload->>'email'))<>person.email THEN RAISE EXCEPTION 'Login email changes require a separate verified workflow'; END IF;
   UPDATE private.people SET first_name=trim(payload->>'firstName'),last_name=trim(payload->>'lastName'),email=lower(trim(payload->>'email')),phone=trim(payload->>'phone'),birth_date=(payload->>'birthDate')::date,
    consent_at=CASE WHEN approved THEN coalesce(consent_at,now()) ELSE consent_at END,consent_by=CASE WHEN approved THEN coalesce(consent_by,me) ELSE consent_by END,consent_version=CASE WHEN approved THEN '2026-10-28-v1' ELSE consent_version END WHERE id=pid;
   UPDATE public.profiles SET name=trim(payload->>'firstName')||' '||split_part(trim(payload->>'lastName'),' ',1),initials=upper(left(trim(payload->>'firstName'),1)||left(trim(payload->>'lastName'),1)) WHERE id=person.user_id;
  END IF;
  INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(me,'person.saved',pid,jsonb_build_object('consentRecorded',approved)); RETURN jsonb_build_object('id',pid);
 END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;

CREATE FUNCTION public.people_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.people_portal(op,payload) $$;

-- Provisioning/reset endpoints are service-only and still recheck the real caller.
CREATE FUNCTION private.people_account_service(actor uuid,op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid:=(payload->>'userId')::uuid; pid uuid; reset_id uuid; account private.account_access;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Set the caller explicitly; service JWT claims otherwise take precedence.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',payload->>'actorSessionId')::text,true);
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF op='provision' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) THEN RAISE EXCEPTION 'Auth account missing'; END IF;
  INSERT INTO public.profiles(id,email,name,initials,is_admin) VALUES(target,lower(trim(payload->>'email')),trim(payload->>'firstName')||' '||split_part(trim(payload->>'lastName'),' ',1),upper(left(trim(payload->>'firstName'),1)||left(trim(payload->>'lastName'),1)),false);
  INSERT INTO private.account_access(user_id,password_required) VALUES(target,true);
  INSERT INTO private.people(user_id,first_name,last_name,email,phone,birth_date,consent_at,consent_by,consent_version,created_by)
  VALUES(target,trim(payload->>'firstName'),trim(payload->>'lastName'),lower(trim(payload->>'email')),trim(payload->>'phone'),(payload->>'birthDate')::date,
   CASE WHEN payload->>'consent'='true' THEN now() END,CASE WHEN payload->>'consent'='true' THEN actor END,CASE WHEN payload->>'consent'='true' THEN '2026-10-28-v1' END,actor) RETURNING id INTO pid;
 ELSIF op='resetStart' THEN
  IF target=actor THEN RAISE EXCEPTION 'Ask another administrator to reset your account'; END IF;
  IF EXISTS(SELECT 1 FROM private.general_admins WHERE user_id=target) AND NOT private.general_admin() THEN RAISE EXCEPTION 'General administrator required'; END IF;
  SELECT * INTO account FROM private.account_access WHERE user_id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF account.reset_in_progress AND account.reset_after>now()-interval '5 minutes' THEN RAISE EXCEPTION 'Reset already in progress; retry after five minutes'; END IF;
  reset_id:=gen_random_uuid();
  UPDATE private.account_access SET password_required=true,reset_in_progress=true,reset_after=clock_timestamp(),reset_token=reset_id WHERE user_id=target;
  DELETE FROM auth.sessions WHERE user_id=target;
 ELSIF op='resetFinish' THEN
  UPDATE private.account_access SET password_required=true,reset_in_progress=false,reset_token=NULL WHERE user_id=target AND reset_token=(payload->>'resetToken')::uuid AND reset_in_progress;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reset token expired or invalid'; END IF;
 ELSE RAISE EXCEPTION 'Invalid service operation'; END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id) VALUES(actor,'account.'||op,target);
 RETURN jsonb_build_object('ok',true,'personId',pid,'resetToken',reset_id);
END $$;
CREATE FUNCTION public.people_account_service(actor uuid,op text,payload jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.people_account_service(actor,op,payload) $$;
REVOKE ALL ON FUNCTION public.people_account_service(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.people_account_service(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION public.people_account_service(uuid,text,jsonb),private.people_account_service(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.people_portal(text,jsonb),private.people_portal(text,jsonb),private.account_ready(),private.general_admin(),private.ministry_leader(uuid),private.can_contact(uuid),private.visible_profile(uuid),private.observe_password_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.people_portal(text,jsonb),private.people_portal(text,jsonb),private.account_ready(),private.general_admin(),private.ministry_leader(uuid),private.can_contact(uuid),private.visible_profile(uuid) TO authenticated;
