CREATE FUNCTION private.media_cleanup(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p text;b text;result jsonb;item jsonb;obj storage.objects;off integer;
BEGIN
 IF NOT private.general_admin() THEN RAISE EXCEPTION 'General administrator required' USING ERRCODE='42501'; END IF;
 IF op='inventory' THEN
  off:=greatest(0,coalesce((payload->>'offset')::integer,0));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',name,'createdAt',created_at,'size',coalesce((metadata->>'size')::bigint,0),'used',private.media_used(bucket_id,name)) ORDER BY created_at DESC,id),'[]') INTO result FROM (SELECT * FROM storage.objects WHERE bucket_id IN ('identity-images','announcement-images') ORDER BY created_at DESC,id LIMIT 50 OFFSET off) o;
  RETURN jsonb_build_object('items',result,'count',(SELECT count(*) FROM storage.objects WHERE bucket_id IN ('identity-images','announcement-images')),'bytes',(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects WHERE bucket_id IN ('identity-images','announcement-images')));
 ELSIF op='reserveDeletion' THEN
  IF (payload->>'confirmed')::boolean IS DISTINCT FROM true OR jsonb_array_length(payload->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Confirm 1 to 20 backed-up images'; END IF;
  PERFORM pg_advisory_xact_lock(71250340);
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
   b:=item->>'bucket';p:=item->>'path';
   SELECT * INTO obj FROM storage.objects WHERE bucket_id=b AND name=p FOR UPDATE;
   IF obj.id IS NULL OR obj.id::text IS DISTINCT FROM item->>'id' OR b NOT IN ('identity-images','announcement-images') OR private.media_used(b,p) THEN RAISE EXCEPTION 'Image changed, missing or still in use'; END IF;
   INSERT INTO private.media_deletions(bucket,path,object_id,sha256,actor) VALUES(b,p,obj.id,item->>'sha256',auth.uid()) ON CONFLICT(bucket,path) DO UPDATE SET actor=excluded.actor,sha256=excluded.sha256;
   INSERT INTO private.people_audit(actor_id,action,entity_id,details) VALUES(auth.uid(),'media.deletion.confirmed',obj.id,item);
  END LOOP;
  RETURN '{"ok":true}';
 ELSIF op='finishDeletion' THEN
  IF jsonb_array_length(payload->'items') IS NULL THEN RAISE EXCEPTION 'Selected images required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'items') item JOIN storage.objects o ON o.bucket_id=item->>'bucket' AND o.name=item->>'path') THEN RAISE EXCEPTION 'Some selected images remain; refresh and retry'; END IF;
  UPDATE private.media_deletions d SET completed_at=now() WHERE actor=auth.uid() AND completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=d.bucket AND o.name=d.path);
  RETURN '{"ok":true}';

 END IF;
 RAISE EXCEPTION 'Unknown operation';
END $$;
REVOKE ALL ON FUNCTION private.media_cleanup(text,jsonb) FROM PUBLIC,anon,authenticated;
