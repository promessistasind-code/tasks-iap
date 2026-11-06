-- One notice per new assignment. Existing assignments are not backfilled.
CREATE TABLE private.assignment_notices (
 assignment_id uuid PRIMARY KEY REFERENCES private.event_assignments(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL,
 read_at timestamptz
);
CREATE INDEX assignment_notices_pending ON private.assignment_notices(recipient_id) WHERE read_at IS NULL;
ALTER TABLE private.assignment_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.assignment_notices FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.notify_new_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO private.assignment_notices(assignment_id,recipient_id)
 SELECT NEW.id,p.user_id FROM private.people p WHERE p.id=NEW.person_id AND p.user_id IS NOT NULL
 ON CONFLICT(assignment_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.notify_new_assignment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_new_assignment AFTER INSERT ON private.event_assignments
 FOR EACH ROW WHEN (NEW.active AND NEW.response='pending') EXECUTE FUNCTION private.notify_new_assignment();

CREATE FUNCTION private.assignment_notifications(read_assignment uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() THEN RAISE insufficient_privilege; END IF;
 IF read_assignment IS NOT NULL THEN
  UPDATE private.assignment_notices SET read_at=now() WHERE assignment_id=read_assignment AND recipient_id=auth.uid() AND read_at IS NULL;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id),'[]') INTO result FROM (
  SELECT a.id,a.event_id,e.title,e.starts_at,a.created_at,m.name AS ministry,f.name AS duty
  FROM private.assignment_notices n JOIN private.event_assignments a ON a.id=n.assignment_id
  JOIN private.events e ON e.id=a.event_id JOIN private.people p ON p.id=a.person_id
  JOIN private.ministry_members mm ON mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active
  JOIN private.ministries m ON m.id=a.ministry_id JOIN private.ministry_functions f ON f.id=a.function_id
  WHERE n.recipient_id=auth.uid() AND p.user_id=auth.uid() AND n.read_at IS NULL AND a.active
   AND a.response='pending' AND NOT e.cancelled AND e.ends_at>now()
   AND (a.ministry_id=e.ministry_id OR a.ministry_id=ANY(e.shared_with) OR private.event_messenger_slot(e.id,a.ministry_id,a.function_id))
   AND private.event_visible(e.id)
 ) item;
 RETURN result;
END $$;
CREATE FUNCTION public.assignment_notifications(read_assignment uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.assignment_notifications(read_assignment) $$;
REVOKE ALL ON FUNCTION private.assignment_notifications(uuid),public.assignment_notifications(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assignment_notifications(uuid),public.assignment_notifications(uuid) TO authenticated;
