CREATE FUNCTION private.event_read(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; eid uuid;mid uuid;start_time timestamptz;end_time timestamptz;ev private.events;
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
  start_time:=(payload->>'start')::timestamptz;end_time:=(payload->>'end')::timestamptz;
  IF start_time IS NULL OR end_time IS NULL OR end_time<=start_time OR end_time-start_time>interval '94 days' THEN RAISE EXCEPTION 'Choose a period up to 94 days';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('canManage',private.event_manager(e.ministry_id)) ORDER BY e.starts_at),'[]') INTO result FROM private.events e WHERE e.starts_at<end_time AND e.ends_at>start_time AND private.event_visible(e.id);
  RETURN jsonb_build_object('items',result,'creatableMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE private.event_manager(id)));
 END IF;
 eid:=(payload->>'eventId')::uuid;
 IF NOT private.event_visible(eid) THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO ev FROM private.events WHERE id=eid;
 IF op='detail' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ministryId',a.ministry_id,'personId',a.person_id,'name',p.first_name||' '||p.last_name,'functionId',a.function_id,'functionName',f.name,'response',a.response,'canManage',private.event_manager(a.ministry_id) AND (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)),'canRespond',p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM private.ministry_members mm WHERE mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active)) ORDER BY a.created_at),'[]') INTO result
  FROM private.event_assignments a JOIN private.people p ON p.id=a.person_id JOIN private.ministry_functions f ON f.id=a.function_id WHERE a.event_id=eid AND a.active AND p.consent_at IS NOT NULL;
  RETURN jsonb_build_object('event',to_jsonb(ev)||jsonb_build_object('canManage',private.event_manager(ev.ministry_id)),'assignments',result,'scheduleMinistries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') FROM private.ministries WHERE (id=ev.ministry_id OR id=ANY(ev.shared_with)) AND private.event_manager(id)));
 ELSIF op='candidates' THEN
  mid:=(payload->>'ministryId')::uuid;
  IF ev.cancelled OR NOT private.event_manager(mid) OR NOT (mid=ev.ministry_id OR mid=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Own shared ministry required' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,'functionIds',mm.function_ids) ORDER BY p.first_name),'[]') INTO result FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id WHERE mm.ministry_id=mid AND mm.active AND p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access a WHERE a.user_id=p.user_id AND a.active));
  RETURN result;
 END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;
REVOKE ALL ON FUNCTION private.event_read(text,jsonb) FROM PUBLIC,anon,authenticated;
