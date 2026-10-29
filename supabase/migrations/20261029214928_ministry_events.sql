CREATE TABLE private.events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ministry_id uuid NOT NULL REFERENCES private.ministries(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),description text NOT NULL DEFAULT '' CHECK(length(description)<=5000),
 location text NOT NULL DEFAULT '' CHECK(length(location)<=300), starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 shared_with uuid[] NOT NULL DEFAULT '{}',cancelled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_period ON private.events(starts_at,ends_at);
CREATE TABLE private.event_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES private.events(id),ministry_id uuid NOT NULL REFERENCES private.ministries(id),
 person_id uuid NOT NULL REFERENCES private.people(id),function_id uuid NOT NULL REFERENCES private.ministry_functions(id),
 response text NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','confirmed','declined')),active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),responded_at timestamptz
);
CREATE UNIQUE INDEX event_assignment_unique ON private.event_assignments(event_id,ministry_id,person_id,function_id) WHERE active;
ALTER TABLE private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.event_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.events,private.event_assignments FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.event_member(mid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.ministry_members mm JOIN private.people p ON p.id=mm.person_id WHERE p.user_id=auth.uid() AND mm.active AND mm.ministry_id=mid)
$$;
CREATE FUNCTION private.event_manager(mid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.general_admin() OR private.ministry_leader(mid) $$;
CREATE FUNCTION private.event_visible(eid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.account_ready() AND EXISTS(SELECT 1 FROM private.events e WHERE e.id=eid AND (private.general_admin() OR private.event_member(e.ministry_id) OR EXISTS(SELECT 1 FROM unnest(e.shared_with) mid WHERE private.event_member(mid))))
$$;
REVOKE ALL ON FUNCTION private.event_member(uuid),private.event_manager(uuid),private.event_visible(uuid) FROM PUBLIC,anon,authenticated;
