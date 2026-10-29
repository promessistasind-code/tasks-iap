-- Ask again after a schedule change or reopening a cancelled event.
CREATE OR REPLACE FUNCTION private.event_write(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid;mid uuid;pid uuid;fid uuid;aid uuid;ev private.events;assignment private.event_assignments;shares uuid[];
BEGIN
 IF NOT private.account_ready() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';END IF;
 IF op='save' THEN
  eid:=nullif(payload->>'id','')::uuid;
  IF eid IS NULL THEN mid:=(payload->>'ministryId')::uuid;
  ELSE SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;mid:=ev.ministry_id;
   IF ev.id IS NULL OR ev.version IS DISTINCT FROM (payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed; reload before saving';END IF;
  END IF;
  IF NOT private.event_manager(mid) THEN RAISE EXCEPTION 'Owner ministry leader required' USING ERRCODE='42501';END IF;
  SELECT coalesce(array_agg(DISTINCT value::uuid),'{}') INTO shares FROM jsonb_array_elements_text(coalesce(payload->'sharedWith','[]'));
  IF cardinality(shares)>50 OR EXISTS(SELECT 1 FROM unnest(shares) s WHERE NOT EXISTS(SELECT 1 FROM private.ministries WHERE id=s)) THEN RAISE EXCEPTION 'Invalid sharing';END IF;
  IF eid IS NULL THEN
   INSERT INTO private.events(ministry_id,title,description,location,starts_at,ends_at,shared_with,created_by) VALUES(mid,trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->>'location',''),(payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,shares,auth.uid()) RETURNING id INTO eid;
  ELSE
   IF ev.starts_at IS DISTINCT FROM (payload->>'startsAt')::timestamptz OR ev.ends_at IS DISTINCT FROM (payload->>'endsAt')::timestamptz OR (ev.cancelled AND NOT coalesce((payload->>'cancelled')::boolean,false)) THEN
    UPDATE private.event_assignments SET response='pending',responded_at=NULL WHERE event_id=eid AND active;
   END IF;
   UPDATE private.events SET title=trim(payload->>'title'),description=coalesce(payload->>'description',''),location=coalesce(payload->>'location',''),starts_at=(payload->>'startsAt')::timestamptz,ends_at=(payload->>'endsAt')::timestamptz,shared_with=shares,cancelled=coalesce((payload->>'cancelled')::boolean,false),version=version+1,updated_at=now() WHERE id=eid;END IF;
 ELSE
  eid:=(payload->>'eventId')::uuid;SELECT * INTO ev FROM private.events WHERE id=eid FOR UPDATE;
  IF NOT private.event_visible(eid) OR ev.cancelled THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501';END IF;
  IF op='assign' THEN
   mid:=(payload->>'ministryId')::uuid;pid:=(payload->>'personId')::uuid;fid:=(payload->>'functionId')::uuid;
   IF NOT private.event_manager(mid) OR NOT (mid=ev.ministry_id OR mid=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Own shared ministry required' USING ERRCODE='42501';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.ministry_members mm JOIN private.people p ON p.id=mm.person_id JOIN private.ministry_functions f ON f.id=fid AND f.ministry_id=mid WHERE mm.ministry_id=mid AND mm.person_id=pid AND mm.active AND fid=ANY(mm.function_ids) AND p.consent_at IS NOT NULL AND (p.user_id IS NULL OR EXISTS(SELECT 1 FROM private.account_access a WHERE a.user_id=p.user_id AND a.active))) THEN RAISE EXCEPTION 'Active member with this function required';END IF;
   INSERT INTO private.event_assignments(event_id,ministry_id,person_id,function_id,created_by) VALUES(eid,mid,pid,fid,auth.uid()) ON CONFLICT(event_id,ministry_id,person_id,function_id) WHERE active DO NOTHING;
  ELSIF op IN ('unassign','respond') THEN
   aid:=(payload->>'assignmentId')::uuid;SELECT * INTO assignment FROM private.event_assignments WHERE id=aid AND event_id=eid AND active FOR UPDATE;
   IF assignment.id IS NULL THEN RAISE EXCEPTION 'Assignment unavailable';END IF;
   IF NOT (assignment.ministry_id=ev.ministry_id OR assignment.ministry_id=ANY(ev.shared_with)) THEN RAISE EXCEPTION 'Sharing was revoked' USING ERRCODE='42501';END IF;
   IF op='unassign' THEN
    IF NOT private.event_manager(assignment.ministry_id) THEN RAISE EXCEPTION 'Own ministry required' USING ERRCODE='42501';END IF;
    UPDATE private.event_assignments SET active=false WHERE id=aid;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM private.people p JOIN private.ministry_members mm ON mm.person_id=p.id WHERE p.id=assignment.person_id AND p.user_id=auth.uid() AND mm.active AND mm.ministry_id=assignment.ministry_id) THEN RAISE EXCEPTION 'Only the assigned person can respond' USING ERRCODE='42501';END IF;
    UPDATE private.event_assignments SET response=payload->>'response',responded_at=now() WHERE id=aid;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown operation';END IF;
 END IF;
 INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'event.'||op,eid,payload);
 RETURN jsonb_build_object('id',eid);
END $$;
REVOKE ALL ON FUNCTION private.event_write(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.event_read(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ministryId',a.ministry_id,'personId',a.person_id,'name',p.first_name||' '||p.last_name,'functionId',a.function_id,'functionName',f.name,'response',a.response,'canManage',private.event_manager(a.ministry_id) AND (a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)),'canRespond',(a.ministry_id=ev.ministry_id OR a.ministry_id=ANY(ev.shared_with)) AND p.user_id=auth.uid() AND EXISTS(SELECT 1 FROM private.ministry_members mm WHERE mm.person_id=p.id AND mm.ministry_id=a.ministry_id AND mm.active)) ORDER BY a.created_at),'[]') INTO result
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
