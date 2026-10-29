CREATE FUNCTION private.event_write(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  ELSE UPDATE private.events SET title=trim(payload->>'title'),description=coalesce(payload->>'description',''),location=coalesce(payload->>'location',''),starts_at=(payload->>'startsAt')::timestamptz,ends_at=(payload->>'endsAt')::timestamptz,shared_with=shares,cancelled=coalesce((payload->>'cancelled')::boolean,false),version=version+1,updated_at=now() WHERE id=eid;END IF;
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
CREATE FUNCTION private.event_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF op IN ('list','detail','candidates') THEN RETURN private.event_read(op,payload);ELSE RETURN private.event_write(op,payload);END IF;
END $$;
CREATE FUNCTION public.event_portal(op text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.event_portal(op,payload) $$;
REVOKE ALL ON FUNCTION private.event_portal(text,jsonb),public.event_portal(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.event_portal(text,jsonb),public.event_portal(text,jsonb) TO authenticated;
