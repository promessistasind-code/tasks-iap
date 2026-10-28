-- Production backup verified by full restore in a disposable schema before apply.
-- Hashes contain no user data. Never use CASCADE: unexpected dependencies abort.
LOCK TABLE public.lt_inbox_items,public.lt_vocal_skills,public.lt_vocal_videos,
  public.lt_vocal_profile,public.lt_vocal_references,public.lt_vocal_class_notes IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE entry record; actual_hash text;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('lt_inbox_items','d751713988987e9331980363e24189ce'),
    ('lt_vocal_skills','eed1a2fa0c8726a911780b97aece3233'),
    ('lt_vocal_videos','0e6d76a9f349bdaa4abcd97252ce5913'),
    ('lt_vocal_profile','e38bcfe91d7be360eefe9c6ebad0673c'),
    ('lt_vocal_references','d751713988987e9331980363e24189ce'),
    ('lt_vocal_class_notes','d751713988987e9331980363e24189ce')
  ) AS expected(table_name,data_hash) LOOP
    EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]'')::text) FROM public.%I t',entry.table_name) INTO actual_hash;
    -- Empty tables also support a fresh installation with no legacy records.
    IF actual_hash<>entry.data_hash AND actual_hash<>'d751713988987e9331980363e24189ce' THEN
      RAISE EXCEPTION 'Backup outdated for %; stop and create a new verified backup',entry.table_name;
    END IF;
  END LOOP;
END $$;
DROP TABLE public.lt_inbox_items;
DROP TABLE public.lt_vocal_skills;
DROP TABLE public.lt_vocal_videos;
DROP TABLE public.lt_vocal_profile;
DROP TABLE public.lt_vocal_references;
DROP TABLE public.lt_vocal_class_notes;
