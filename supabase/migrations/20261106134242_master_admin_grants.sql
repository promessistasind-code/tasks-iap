-- For a new installation, set app.bootstrap_master_email in the migration
-- session to the designated owner's verified address before running this file.
-- The existing installation was initialized with its owner during rollout.
CREATE TABLE private.master_account (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id)
);
ALTER TABLE private.master_account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.master_account FROM PUBLIC, anon, authenticated;
DO $$
DECLARE owner_id uuid;
BEGIN
 SELECT u.id INTO STRICT owner_id FROM auth.users u
 JOIN public.profiles p ON p.id=u.id AND p.is_admin
 JOIN private.general_admins g ON g.user_id=u.id
 WHERE lower(u.email)=lower(current_setting('app.bootstrap_master_email'));
 INSERT INTO private.master_account(user_id) VALUES(owner_id);
END $$;

-- Preserve the installed portal and its existing authorization and audit checks.
DO $migration$
DECLARE definition text; old_text text; new_text text;
BEGIN
 definition:=pg_get_functiondef('private.people_portal(text,jsonb)'::regprocedure);
 FOR old_text,new_text IN SELECT * FROM (VALUES
  ($a$'isGeneralAdmin',private.general_admin(),$a$,
   $b$'isGeneralAdmin',private.general_admin(),'isMaster',EXISTS(SELECT 1 FROM private.master_account WHERE user_id=auth.uid()),$b$),
  ($a$'isAdmin',coalesce(pr.is_admin,false),$a$,
   $b$'isAdmin',coalesce(pr.is_admin,false),'isMaster',EXISTS(SELECT 1 FROM private.master_account WHERE user_id=pr.id),$b$),
  ($a$IF EXISTS(SELECT 1 FROM private.general_admins WHERE user_id=target) THEN RAISE EXCEPTION 'General administrator account is protected';$a$,
   $b$IF EXISTS(SELECT 1 FROM private.master_account WHERE user_id=target)
       OR (payload ? 'active' AND EXISTS(SELECT 1 FROM private.general_admins WHERE user_id=target))
     THEN RAISE EXCEPTION 'Conta protegida.' USING ERRCODE='42501';$b$),
  ($a$IF payload ? 'isAdmin' AND NOT private.general_admin() THEN RAISE EXCEPTION 'General administrator required'$a$,
   $b$IF payload ? 'isAdmin' AND NOT EXISTS(SELECT 1 FROM private.master_account WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Somente a conta master pode alterar administradores.'$b$)
 ) AS replacements(before_text,after_text) LOOP
  IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'Versão inesperada de people_portal'; END IF;
  definition:=replace(definition,old_text,new_text);
 END LOOP;
 EXECUTE definition;
 definition:=pg_get_functiondef('private.people_account_service(uuid,text,jsonb)'::regprocedure);
 old_text:=$a$ELSIF op='resetStart' THEN$a$;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'Versão inesperada de people_account_service'; END IF;
 EXECUTE replace(definition,old_text,old_text || $b$
  IF EXISTS(SELECT 1 FROM private.master_account WHERE user_id=target) THEN
   RAISE EXCEPTION 'A senha da conta master não pode ser redefinida por outro administrador.' USING ERRCODE='42501';
  END IF;$b$);
END $migration$;
