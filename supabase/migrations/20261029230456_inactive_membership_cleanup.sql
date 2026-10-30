-- Reversible from the verified full-row copy in private.people_audit.
CREATE FUNCTION private.cleanup_inactive_membership(op text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member private.ministry_members; snapshot jsonb; backup_id bigint; verified jsonb;
BEGIN
 IF NOT private.general_admin() THEN RAISE EXCEPTION 'Somente o administrador geral pode excluir vínculos.' USING ERRCODE='42501';END IF;
 SELECT * INTO member FROM private.ministry_members WHERE person_id=(payload->>'personId')::uuid AND ministry_id=(payload->>'ministryId')::uuid FOR UPDATE;
 IF member.person_id IS NULL THEN RAISE EXCEPTION 'Vínculo não encontrado. Atualize a lista.';END IF;
 IF member.active THEN RAISE EXCEPTION 'Desative e salve o vínculo antes de excluí-lo.';END IF;
 snapshot:=to_jsonb(member);
 IF op='preview' THEN RETURN snapshot;END IF;
 IF op<>'remove' OR (payload->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme a exclusão do vínculo inativo.';END IF;
 IF payload->'snapshot' IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'O vínculo mudou. Atualize a lista e tente novamente.';END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,ministry_id,details)
 VALUES(auth.uid(),'membership.removed',member.person_id,member.ministry_id,jsonb_build_object('backup',snapshot,'backupVersion',1)) RETURNING id INTO backup_id;
 SELECT details->'backup' INTO verified FROM private.people_audit WHERE id=backup_id;
 IF verified IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'A cópia de segurança não foi verificada. Nada foi excluído.';END IF;
 DELETE FROM private.ministry_members WHERE person_id=member.person_id AND ministry_id=member.ministry_id AND NOT active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não removido. Operação desfeita.';END IF;
 RETURN jsonb_build_object('ok',true,'backupId',backup_id);
END $$;
CREATE FUNCTION public.cleanup_inactive_membership(op text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.cleanup_inactive_membership(op,payload) $$;
REVOKE ALL ON FUNCTION private.cleanup_inactive_membership(text,jsonb),public.cleanup_inactive_membership(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.cleanup_inactive_membership(text,jsonb),public.cleanup_inactive_membership(text,jsonb) TO authenticated;
