# Ministry workspaces — 2026-10-28

Added sidebar ministry navigation and a mobile entry, with a workspace showing functions, ministry projects and tasks. The sidebar shows only active memberships for members and leaders. The overview shows the full catalog, with disabled cards and no project counts for ministries they do not belong to. Administrators retain access to all ministries. Leaders and delegated members retain server-provided creation permissions. Project creation starts with the selected ministry, and task creation is scoped to its project.

Memberships refresh on focus and after user-management changes. Failed access checks clear ministry state and offer retry. Removing a membership makes its open workspace unavailable. Existing database authorization remains authoritative; this stage changes no schema or records and does not assign legacy projects to a ministry automatically.

Validation: TypeScript, production build, 5 unit tests, existing foundation/people/task-permission browser suites, and ministry browser coverage for member visibility, revocation, leader creation, administrator scope, mobile width, and failure recovery. Fixtures intercept Supabase requests; no real accounts are created by these tests. Existing lint findings and large-bundle warning remain; new ministry files have no lint errors.

Remaining scope: ministry catalog editing/resources, homepage banners/images, events/scales, expanded notifications, reports and external integrations remain separate deliveries.
