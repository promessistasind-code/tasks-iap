-- Store read receipts per reviewer. The notification itself exists only while the request is actionable.
CREATE TABLE private.swap_review_reads (
 swap_id uuid NOT NULL REFERENCES private.scale_swaps(id) ON DELETE CASCADE,
 reviewer_id uuid NOT NULL,
 PRIMARY KEY(swap_id,reviewer_id)
);
ALTER TABLE private.swap_review_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.swap_review_reads FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.pending_swap_reviews() RETURNS TABLE (
 id uuid,event_id uuid,title text,requester text,ministry text,duty text,starts_at timestamptz,created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,e.id,e.title,concat_ws(' ',p.first_name,p.last_name),m.name,f.name,e.starts_at,s.created_at
 FROM private.scale_swaps s JOIN private.event_assignments a ON a.id=s.assignment_id
 JOIN private.events e ON e.id=a.event_id JOIN private.people p ON p.id=a.person_id
 JOIN private.ministries m ON m.id=a.ministry_id JOIN private.ministry_functions f ON f.id=a.function_id
 WHERE private.account_ready() AND s.status='pending' AND a.active AND NOT e.cancelled AND e.ends_at>now()
 AND private.event_visible(e.id)
 AND (a.ministry_id=e.ministry_id OR a.ministry_id=ANY(e.shared_with) OR private.event_messenger_slot(e.id,a.ministry_id,a.function_id))
 AND (private.event_manager(a.ministry_id) OR (private.pastor_event(e.id) AND private.event_messenger_slot(e.id,a.ministry_id,a.function_id)))
$$;
REVOKE ALL ON FUNCTION private.pending_swap_reviews() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.schedule_notifications_v2(read_notice uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing jsonb; result jsonb;
BEGIN
 existing:=private.schedule_notifications(read_notice);
 IF read_notice IS NOT NULL THEN
  INSERT INTO private.swap_review_reads SELECT id,auth.uid() FROM private.pending_swap_reviews() WHERE id=read_notice
  ON CONFLICT DO NOTHING;
 END IF;
 SELECT coalesce(jsonb_agg(entry ORDER BY entry->>'created_at' DESC,entry->>'id'),'[]') INTO result
 FROM (SELECT value AS entry FROM jsonb_array_elements(existing)
 UNION ALL SELECT to_jsonb(s)||'{"kind":"swap_requested"}'::jsonb FROM private.pending_swap_reviews() s
 WHERE NOT EXISTS(SELECT 1 FROM private.swap_review_reads r WHERE r.swap_id=s.id AND r.reviewer_id=auth.uid())) n;
 RETURN result;
END $$;
CREATE FUNCTION public.schedule_notifications_v2(read_notice uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.schedule_notifications_v2(read_notice) $$;
REVOKE ALL ON FUNCTION private.schedule_notifications_v2(uuid),public.schedule_notifications_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.schedule_notifications_v2(uuid),public.schedule_notifications_v2(uuid) TO authenticated;

-- Add only a boolean to each assignment; names of substitutes and decisions stay in the restricted workflow.
DO $migration$
DECLARE definition text:=pg_get_functiondef('private.event_read(text,jsonb)'::regprocedure);
 anchor text:=$a$'functionName',f.name,'response',a.response$a$;
BEGIN
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'Unexpected event detail format'; END IF;
 EXECUTE replace(definition,anchor,anchor||$b$,'swapPending',(
  NOT ev.cancelled AND ev.ends_at>now() AND (private.event_assigned(eid) OR private.event_manager(a.ministry_id)
   OR private.event_manager(ev.ministry_id) OR private.pastor_event(eid))
  AND EXISTS(SELECT 1 FROM private.scale_swaps s WHERE s.assignment_id=a.id AND s.status='pending'))$b$);
END $migration$;
