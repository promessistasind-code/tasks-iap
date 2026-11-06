CREATE TABLE private.schedule_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES private.events(id) ON DELETE CASCADE,
 source_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('time','cancelled','reopened','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(recipient,source_id)
);
ALTER TABLE private.schedule_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.schedule_updates FROM PUBLIC,anon,authenticated;
CREATE INDEX schedule_updates_unread ON private.schedule_updates(recipient) WHERE read_at IS NULL;
CREATE INDEX schedule_updates_event ON private.schedule_updates(event_id);

CREATE FUNCTION private.notify_event_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reason text;
BEGIN
 IF OLD.cancelled IS DISTINCT FROM NEW.cancelled THEN
  reason:=CASE WHEN NEW.cancelled THEN 'cancelled' ELSE 'reopened' END;
 ELSIF NOT NEW.cancelled AND (OLD.starts_at,OLD.ends_at) IS DISTINCT FROM (NEW.starts_at,NEW.ends_at) THEN
  reason:='time';
 ELSE RETURN NEW;
 END IF;
 -- One current update per person and event, even if the person has several duties.
 INSERT INTO private.schedule_updates(recipient,event_id,source_id,kind)
 SELECT DISTINCT p.user_id,NEW.id,NEW.id,reason FROM private.event_assignments a
 JOIN private.people p ON p.id=a.person_id
 JOIN private.ministry_members mm ON mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active
 WHERE a.event_id=NEW.id AND a.active AND p.user_id IS NOT NULL AND
 (a.ministry_id=NEW.ministry_id OR a.ministry_id=ANY(NEW.shared_with) OR private.event_messenger_slot(NEW.id,a.ministry_id,a.function_id))
 ON CONFLICT(recipient,source_id) DO UPDATE SET id=gen_random_uuid(),kind=excluded.kind,created_at=now(),read_at=NULL;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_event_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER event_update_notice AFTER UPDATE OF starts_at,ends_at,cancelled ON private.events
 FOR EACH ROW EXECUTE FUNCTION private.notify_event_update();

CREATE FUNCTION private.notify_swap_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO private.schedule_updates(recipient,event_id,source_id,kind)
 SELECT NEW.requested_by,a.event_id,NEW.id,NEW.status FROM private.event_assignments a WHERE a.id=NEW.assignment_id
 ON CONFLICT(recipient,source_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_swap_decision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER swap_decision_notice AFTER UPDATE OF status ON private.scale_swaps
 FOR EACH ROW WHEN (OLD.status='pending' AND NEW.status IN ('approved','rejected')) EXECUTE FUNCTION private.notify_swap_decision();

CREATE FUNCTION private.schedule_notifications(read_notice uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() THEN RAISE insufficient_privilege; END IF;
 UPDATE private.schedule_updates SET read_at=now() WHERE id=read_notice AND recipient=auth.uid() AND read_at IS NULL;
 SELECT coalesce(jsonb_agg(entry ORDER BY entry->>'created_at' DESC,entry->>'id'),'[]') INTO result FROM (
  SELECT value||'{"kind":"assigned"}'::jsonb AS entry FROM jsonb_array_elements(private.assignment_notifications(read_notice))
  UNION ALL
  SELECT jsonb_build_object('id',u.id,'kind',u.kind,'created_at',u.created_at,
   'event_id',CASE WHEN v.visible THEN e.id END,'title',CASE WHEN v.visible THEN e.title END,
   'starts_at',CASE WHEN v.visible THEN e.starts_at END,'ends_at',CASE WHEN v.visible THEN e.ends_at END)
  FROM private.schedule_updates u JOIN private.events e ON e.id=u.event_id
  CROSS JOIN LATERAL (SELECT private.event_visible(e.id) AS visible) v
  WHERE u.recipient=auth.uid() AND u.read_at IS NULL AND
   (u.kind IN ('approved','rejected') OR (v.visible AND EXISTS(
    SELECT 1 FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id
    JOIN private.ministry_members mm ON mm.ministry_id=a.ministry_id AND mm.person_id=p.id AND mm.active
    WHERE a.event_id=e.id AND a.active AND p.user_id=auth.uid()
    AND (a.ministry_id=e.ministry_id OR a.ministry_id=ANY(e.shared_with) OR private.event_messenger_slot(e.id,a.ministry_id,a.function_id)))))
 ) notices;
 RETURN result;
END $$;
CREATE FUNCTION public.schedule_notifications(read_notice uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.schedule_notifications(read_notice) $$;
REVOKE ALL ON FUNCTION private.schedule_notifications(uuid),public.schedule_notifications(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.schedule_notifications(uuid),public.schedule_notifications(uuid) TO authenticated;

CREATE FUNCTION private.request_center(scope text, page_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() THEN RAISE insufficient_privilege; END IF;
 IF scope IS NULL OR scope NOT IN ('mine','review') OR page_offset IS NULL OR page_offset<0 THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY created_at DESC,id),'[]') INTO result FROM (
  SELECT s.id,'swap' AS kind,s.status,s.created_at,
   CASE WHEN rights.visible THEN e.title ELSE 'Troca de escala' END AS title,
   CASE WHEN rights.visible THEN concat_ws(' ',p.first_name,p.last_name)||' → '||concat_ws(' ',r.first_name,r.last_name) ELSE '' END AS description,
   CASE WHEN rights.visible THEN e.id END AS event_id,
   s.requested_by=auth.uid() AND available AND s.status='pending' AS can_cancel,
   rights.manager AND available AND a.active AND s.status='pending' AS can_decide,
   rights.manager AND available AND a.active AND s.status='pending' AND e.version=s.event_version AS can_approve
  FROM private.scale_swaps s JOIN private.event_assignments a ON a.id=s.assignment_id JOIN private.events e ON e.id=a.event_id
  JOIN private.people p ON p.id=a.person_id JOIN private.people r ON r.id=s.replacement_id
  CROSS JOIN LATERAL (SELECT private.event_visible(e.id) AS visible,
   (private.event_manager(a.ministry_id) OR (private.pastor_event(e.id) AND private.event_messenger_slot(e.id,a.ministry_id,a.function_id))) AND
   (a.ministry_id=e.ministry_id OR a.ministry_id=ANY(e.shared_with) OR private.event_messenger_slot(e.id,a.ministry_id,a.function_id)) AS manager,
   private.event_visible(e.id) AND NOT e.cancelled AND e.ends_at>now() AS available) rights
  WHERE (scope='mine' AND s.requested_by=auth.uid()) OR (scope='review' AND manager AND available AND a.active AND s.status='pending')
  UNION ALL
  SELECT q.id,'profile',CASE WHEN q.resolved THEN 'resolved' ELSE 'pending' END,q.created_at,
   'Correção de cadastro · '||concat_ws(' ',p.first_name,p.last_name),q.message,NULL::uuid,false,private.is_admin() AND NOT q.resolved,false
  FROM private.people_change_requests q JOIN private.people p ON p.id=q.person_id
  WHERE (scope='mine' AND q.requested_by=auth.uid()) OR (scope='review' AND private.is_admin() AND NOT q.resolved)
  ORDER BY created_at DESC,id LIMIT 26 OFFSET page_offset
 ) item;
 RETURN result;
END $$;
CREATE FUNCTION public.request_center(scope text,page_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_center(scope,page_offset) $$;
REVOKE ALL ON FUNCTION private.request_center(text,integer),public.request_center(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.request_center(text,integer),public.request_center(text,integer) TO authenticated;
