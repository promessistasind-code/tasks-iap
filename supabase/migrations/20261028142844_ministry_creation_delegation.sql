-- Extend the existing validated membership command; leaders may delegate only creation.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('private.people_portal(text,jsonb)'::regprocedure);
 definition:=replace(definition,'can_remove,active,added_by)','can_remove,can_create_projects,can_create_tasks,active,added_by)');
 definition:=replace(definition,'coalesce((payload->>''canRemove'')::boolean,false),coalesce((payload->>''active'')::boolean,true),me)', 'coalesce((payload->>''canRemove'')::boolean,false),coalesce((payload->>''canCreateProjects'')::boolean,false),coalesce((payload->>''canCreateTasks'')::boolean,false),coalesce((payload->>''active'')::boolean,true),me)');
 definition:=replace(definition,'can_remove=excluded.can_remove,active=excluded.active','can_remove=excluded.can_remove,can_create_projects=excluded.can_create_projects,can_create_tasks=excluded.can_create_tasks,active=excluded.active');
 EXECUTE definition;
END $$;
-- Only project managers may extend project access through invitations.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('private.send_project_invite(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'NOT public.has_project_access(p_project_id)','NOT private.manage_project(p_project_id)');
 EXECUTE definition;
END $$;
