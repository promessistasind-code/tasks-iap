CREATE OR REPLACE FUNCTION private.my_ministry_scale_counts(period_start timestamptz, period_end timestamptz)
RETURNS TABLE(ministry_id uuid, ministry_name text, events_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.account_ready() THEN RAISE insufficient_privilege; END IF;
 IF period_start IS NULL OR period_end IS NULL OR period_end<=period_start OR period_end-period_start>interval '32 days' THEN RAISE EXCEPTION 'Período inválido'; END IF;
 RETURN QUERY WITH mine AS (
   SELECT mm.ministry_id,p.id AS person_id,m.name
   FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id
   JOIN private.ministries m ON m.id=mm.ministry_id
   WHERE p.user_id=auth.uid() AND mm.active
 )
 SELECT mine.ministry_id,mine.name,count(DISTINCT e.id) FROM mine
 LEFT JOIN private.event_assignments a ON a.person_id=mine.person_id AND a.ministry_id=mine.ministry_id AND a.active
 LEFT JOIN private.events e ON e.id=a.event_id AND NOT e.cancelled AND e.starts_at<period_end AND e.ends_at>period_start
 AND (a.ministry_id=e.ministry_id OR a.ministry_id=ANY(e.shared_with) OR private.event_messenger_slot(e.id,a.ministry_id,a.function_id))
 GROUP BY mine.ministry_id,mine.name ORDER BY mine.name;
END $$;
