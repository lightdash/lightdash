# Adoption by department

Usage analytics shows how an organization uses Lightdash as a whole. Adoption by department shows which parts of the organization are using it, including the parts that have not started, so enablement can be aimed where it is needed. Terms are defined in [CONTEXT.md](./CONTEXT.md).

The feature lives under Settings, Adoption (`/generalSettings/adoption`, and `/generalSettings/adoption/:departmentUuid` for one department). The index opens on a Map view with a List alternative. The choice is kept in the `view` query parameter and, as a fallback, in local storage per user.

## Access

All of the following must hold, otherwise the API answers 404 (no flag, no licence) or 403 (no scope). A malformed `departmentUuid` in the path is rejected earlier, by the route layer, with 422, so it returns 422 even when the feature is off:

- The `organization-adoption` feature flag is on for the user and organization (`FeatureFlags.OrganizationAdoption`).
- The instance has the enterprise licence. Without it the service is not registered and the controller turns the missing provider into a 404.
- The user holds `view:OrganizationAdoption` to read, and `manage:OrganizationAdoption` to change anything. `manage` depends on `view`, and `view` depends on `view:OrganizationMemberProfile`, so the custom role builder cannot make a role that sees members here but not on the members page. Organization admins get both; other roles need a custom role.

`view:OrganizationAdoption` shows every member's email, role and recent activity, and the names of the dashboards, explores, AI agents and groups they use, whatever the holder's own access to that content. Its description in the role builder says so: "View adoption by department, including every member's email, role and recent activity, and the names of the dashboards, explores, agents and groups they use". `manage:OrganizationAdoption` reads "Create and edit departments, their headcounts, targets, owners, linked groups and assigned people".

The routes are hidden from the generated API docs while the feature is under development.

## Data model

One migration (`packages/backend/src/database/migrations/20261008120000_create_organization_departments.ts`) creates four tables:

| Table                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization_departments` | One row per department. `parent_department_uuid` makes the tree. Holds `headcount`, `headcount_note`, `target_active_users`, `target_date`, and `updated_by_user_uuid`. `headcount` and `target_active_users` cannot be negative (check constraints). Name is unique per organization whatever its case, through a unique index on `(organization_uuid, lower(name))`                                                                          |
| `department_links`         | Groups linked to a department (`link_type = 'group'`; `space` and `project` are allowed by the check constraint but reserved). Primary key is `(link_type, link_uuid)`, so a group links to at most one department                                                                                                                                                                                                                             |
| `department_members`       | People assigned to a department by hand. The primary key is `(department_uuid, user_uuid)`. One assignment per person per organization is enforced in application code, not by a constraint: `DepartmentModel.setMembers` removes the person's other assignments in the same transaction. There is deliberately no unique index on `user_uuid`: a user belonging to one organization is product behaviour, not something the schema guarantees |
| `department_owners`        | Owners of a department, each a user or a group, ordered by `position`                                                                                                                                                                                                                                                                                                                                                                          |

Every foreign-key column is covered by an index. `organization_departments.organization_uuid`, `department_members.department_uuid` and `department_owners.department_uuid` are covered as the leading column of a unique index or primary key and have no index of their own; the other referencing columns each have one.

`link_uuid` and `principal_uuid` are polymorphic and have no foreign key. Reads inner-join the target table, so a deleted group or user drops out. Deleting an organization cascades to its departments.

Membership is never stored. It is resolved on every read.

## Rules

### Tree

Departments form a tree. A department with no parent is at the top. A department cannot be its own parent or sit under one of its descendants; `DepartmentModel.update` rejects both with a 400. Deleting a department moves its sub-departments up one level, to the deleted department's parent. The foreign key is `ON DELETE SET NULL` only as a fallback.

Every department write (create, edit, delete, and setting linked groups, assigned people or owners) runs in one transaction that first takes a per-organization advisory lock (`pg_advisory_xact_lock(hashtextextended('organization-departments:<organization uuid>', 0))`). The existence, parent and cycle checks then read the organization's tree inside that transaction, before the write. Writes in one organization therefore run one at a time, so two moves at the same moment cannot store a cycle and two assignments of the same person cannot both stand. The lock is released on commit or rollback, and writes in different organizations do not wait for each other. Before asking for the lock, the transaction sets `SET LOCAL lock_timeout = '5s'`: a write that waits longer than that behind other writes to the same organization is cancelled (Postgres code 55P03) and answers 409 with `ConflictError` ("Another change to departments is being saved. Try again in a moment"), so a burst of writes cannot hold the whole connection pool. The setting is `SET LOCAL`, like the activity reads' statement timeout, so it ends with its transaction and never stays on a pooled connection.

The tree helpers (ancestors, descendants, cycle check, depth, effective headcount, roll-up) are pure functions in `packages/common/src/departments/departmentTree.ts`. They walk the tree with explicit stacks and queues, never recursion, so a deep tree cannot overflow the call stack.

### Limits

`DEPARTMENT_TREE_LIMITS` in `DepartmentService.ts` and the owner check there keep every organization's tree small enough for the walks, the responses and the map to stay fast:

- At most 1,000 departments per organization.
- At most 10 levels deep. A top-level department is at level 1. Moving a department moves its whole branch, so after the move every department in the branch must still be within 10 levels.
- At most 20 owners per department, each counted once.

Creating or moving a department past the first two limits, or setting more owners, answers 400 with a plain message. The department count and depth are checked inside the per-organization lock described above, so departments created at the same moment cannot together pass the limit. The drawer's owner picker stops at 20.

### Membership: most specific wins

`resolveDepartmentMembership` in `packages/common/src/departments/resolveDepartmentMembership.ts` decides where each person counts:

1. A person with an explicit assignment counts in that department. Nothing else is considered. Assigning a person to a department removes any earlier assignment in the organization.
2. Otherwise, take every department reached through the person's groups and drop any that is an ancestor of another candidate. A sub-department beats its parent.
3. One department left: the person counts there. Several left, in different branches: the person is a conflict and counts nowhere until placed. None: the person is unassigned.

Internal users (`users.is_internal`) are excluded from resolution and cannot be members or owners.

A person counts as on Lightdash only when their user is active (`users.is_active`) and they have completed sign-up. There is no column for a pending invite, so sign-up is derived the way the organization members list derives it (`UserModel.findIfUsersHaveAuthentication`): the person has a password, a single sign-on identity, or a verified primary email. People provisioned through SCIM count from the moment they are provisioned, because SCIM verifies their email on create; this is intended, and lets an organization that provisions everyone through SCIM read coverage without maintaining headcounts by hand. Deactivated users and people invited but not yet joined do not count. `DepartmentModel.getResolvedMemberRows` leaves everyone else out, so they are not members, are not conflicts or unassigned, and fall into "no account" through the headcount.

Only people on Lightdash can be newly assigned to a department or made an owner. Assigning, or making an owner of, someone who is deactivated or has not completed sign-up answers 400 saying the person must be an active member; `DepartmentModel` checks it with the same definition as above, inside the write's transaction. People already assigned, or already owners, stay when they are later deactivated, so a department's list can still be saved with them in it; they stop counting until they are active again. The drawer's people pickers offer only people on Lightdash, plus anyone already chosen.

A parent's members are its own plus those of all its descendants. `metrics` on a department is the rolled-up figure; `directMetrics` counts only people who resolved to that department itself.

### Headcount

Effective headcount is the department's own headcount when set, otherwise the sum of its children's effective headcounts, otherwise null (never zero). When the own value is below the children's sum, `headcountBelowChildren` is true; the own value is still used. Each department also carries a free-text `headcountNote` (500 characters at most) for where the number came from.

### Owners

A department has an ordered list of owners, each a user or a group. The first is the display owner. Setting owners replaces the whole list and keeps the order sent.

## Metrics

Computed in `DepartmentService` and `departmentMetrics.ts` from existing tables. There are no events and no scheduled jobs.

The organization snapshot behind the summary and the department page (departments, resolved membership, activity counts and weekly buckets) is cached in memory for 60 seconds per organization, for at most 500 organizations per backend process, dropping the oldest first. Requests that arrive together share one load, and a failed load is not kept. The department page reuses the cached snapshot and reads its own people with the snapshot's time windows, so its count and its member list still agree. Any write through `DepartmentService` drops that organization's snapshot in the process that handled it. Other backend processes keep their copy until it expires, so behind a load balancer the figures can be up to a minute old after a change, and changes made elsewhere (someone joining a linked group, new activity) show within a minute.

| Metric        | Definition                                                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members       | People on Lightdash who resolve to the department or a descendant. Internal users, users without a primary email, deactivated users and people who were invited but have not completed sign-up are excluded                                          |
| Coverage      | Members divided by effective headcount, as a rounded percentage                                                                                                                                                                                      |
| Active        | Members who ran a query themselves or through the AI agent or MCP (`query_history`, counted contexts only) or viewed a chart or dashboard (`analytics_chart_views`, `analytics_dashboard_views`) in the last 30 days, divided by effective headcount |
| Role split    | Members by organization role. Member and viewer count as viewers, developer counts as editor. A role this feature does not know counts as a viewer and is logged once as a warning, so a new role cannot fail the summary                            |
| Weekly active | Distinct members with a chart or dashboard view in each of the last 12 weeks, oldest first. Queries are left out so that every week is counted the same way                                                                                          |

A query counts only when a person asked for it. `DepartmentAnalyticsModel` keeps the `query_history` rows whose `context` the backend's `queryWorkloadOrigin` (`packages/backend/src/services/AsyncQueryService/queryUsage.ts`) classifies as interactive, plus the AI agent and every MCP context, because a person asking the agent or using MCP is adoption. Counted: dashboards, explores, saved charts and their history, SQL charts, the SQL runner, viewing underlying data, the metrics explorer, the AI agent and MCP. Not counted: API and CLI runs, scheduled deliveries and alerts as queries, Google Sheets syncs, auto-refreshed dashboards, embeds, and internal contexts such as filter autocomplete, downloads, totals and pre-aggregation. A unit test lists every query context as counted or not counted, so a new one has to be decided. The same filter applies to the per-person query count and to top explores.

Active has one definition, in SQL. The summary's 30-day count and weekly buckets come from a single query (`DepartmentAnalyticsModel.getActivity`, which scans views for 12 weeks and queries for 30 days), and the member list's `isActive30d` flag (`getMemberActivity`) uses the same sources and the same 30-day bound. `getMemberActivity` reads every source back 90 days only. The browser reads the flag for the member filters, the map's dot colours and the legend; it does not compare `lastActiveAt` to its own clock. The one exception is the map's "Active in 12 weeks" colouring, which still compares `lastActiveAt` to the clock for people who are not active in 30 days.

Every activity read is limited to the organization. `query_history` has an organization column and is filtered on it. `analytics_chart_views` and `analytics_dashboard_views` do not, so they are read by the organization's member set (the user uuids `DepartmentModel.getResolvedMemberRows` returns from `organization_memberships`) on their `(user_uuid, timestamp)` index. The member set is the tenancy boundary: a person belongs to one organization in the product, their activity is theirs whatever content it was on, and nobody outside the organization is ever in the set. The reads used to join each view to the organization through the content (chart to project, dashboard to space to project); on a real organization with 2.5 million chart views in 12 weeks that made Postgres scan once per chart and sort every view to disk, 5 s against 0.8 s for the member-set read. Top content still joins through the content, because it lists the organization's own dashboards, explores and agents by name.

Query history is not kept for long. The instance deletes `query_history` rows older than `QUERY_HISTORY_RETENTION_DAYS` (32 days by default, on unless `QUERY_HISTORY_CLEANUP_ENABLED` is `false`), while the two view tables are kept. Three things follow:

- The weekly trend counts chart and dashboard views only. A week 10 weeks back has no queries left to count, so counting queries in recent weeks would make them look busier than old ones. A person who only runs explores or SQL does not appear in the trend.
- The 30-day active count uses views and the queries a person ran. If the instance keeps queries for fewer than 30 days, the count misses the queries already deleted and reads low.
- `lastActiveAt` is the latest of a person's views and retained queries in the last 90 days. Null means nothing is recorded in those 90 days, not that the person never used the product, so the page says "No recorded activity", which means no recorded activity in the last 90 days.

Percentages are of headcount and are null when there is no headcount or it is 0. They are not capped, so more accounts than headcount reads above 100. The page then shows counts.

Time handling is UTC, but not everything is calendar-aligned:

- Week buckets start on UTC Mondays, on both the SQL side (`date_trunc('week', ...)`) and the TypeScript side (`lastNWeekStarts`). The newest bucket is the current, partial week.
- The 30-day active window, the 12-week trend read and the 90-day last-activity read are rolling windows measured from one instant (`getActivityWindows()` in `DepartmentService.ts`: now minus 30 days, now minus 84 days, and now minus 90 days), not from a UTC midnight. Every read in a request uses the same three bounds.
- `weeksLeft` and the frontend's "N days ago" label count UTC calendar days. The label is for display only and never decides who is active.

The timestamp columns read here are `timestamp without time zone`. They are read as UTC only if the server process and the database session run in UTC; the code does not enforce it.

The department page (`getDetail`) adds:

- Target progress: `targetActiveUsers` against current active members. `remaining` is never negative. `weeksLeft` is null with no target date, 0 on the target day, positive before it (rounded up, so a partial week counts) and negative once overdue.
- The weekly trend against `orgAverage`, the mean across departments at the same depth in the tree.
- Top content for the last 30 days, up to five each of dashboards, explores and AI agents, with use counts and distinct people.
- A member list sorted no recorded activity first, then longest inactive. Each row has the person's last activity in the last 90 days, whether they are active in 30 days (`isActive30d`), queries and dashboard views in 30 days, and where they resolved. `isDirect` says whether they resolved to this department or a descendant.

The AI agent read is guarded by a table check (`hasAiTables`) because `ai_prompt`, `ai_thread` and `ai_agent` come from enterprise migrations and do not exist on every instance. Without them the list is empty.

Every activity read (the summary's activity, the member activity and each top-content list) runs in its own transaction that first sets `SET LOCAL statement_timeout = 15000`, so a runaway read is cancelled after 15 seconds instead of holding a pooled connection. A cancelled read answers with `TimeoutError` ("Adoption figures took too long to load. Try again in a minute"), the closest existing error class: there is no 503 class in `@lightdash/common`, and `TimeoutError` answers 400.

## API

All routes are under `/api/v1/org/departments` in `packages/backend/src/ee/controllers/OrgDepartmentsController.ts`. The organization always comes from the session; no route accepts an organization identifier. A department that belongs to another organization answers 404, the same as one that does not exist.

| Route                           | Purpose                                                                                                                       | Scope  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| `GET /`                         | Every department with rolled-up metrics, organization totals, and the `attention` counts (`conflictCount`, `unassignedCount`) | view   |
| `GET /membership`               | Where each person resolved                                                                                                    | view   |
| `GET /{departmentUuid}`         | Department page data                                                                                                          | view   |
| `POST /`                        | Create                                                                                                                        | manage |
| `PATCH /{departmentUuid}`       | Edit. An omitted field is unchanged, null clears it                                                                           | manage |
| `DELETE /{departmentUuid}`      | Delete                                                                                                                        | manage |
| `PUT /{departmentUuid}/groups`  | Replace linked groups. A group already linked elsewhere moves here                                                            | manage |
| `PUT /{departmentUuid}/members` | Replace explicitly assigned people                                                                                            | manage |
| `PUT /{departmentUuid}/owners`  | Replace owners                                                                                                                | manage |

Validation in `DepartmentService`:

- Names are required and at most 255 characters. Before a name is checked or stored it is normalised: the characters that render as nothing or only reorder text are removed (the zero-width characters U+200B to U+200D, U+2060 and U+FEFF, the bidirectional controls U+200E, U+200F, U+202A to U+202E and U+2066 to U+2069, the soft hyphen U+00AD, the combining grapheme joiner U+034F, the variation selectors U+FE00 to U+FE0F and the tag characters U+E0000 to U+E007F), then NFKC is applied, the name is trimmed, and every run of whitespace inside it is made one space. They are removed before NFKC so that an accent one of them kept apart from its letter still composes. A name of more than 1,020 characters as sent (four times the limit) is refused before any of this, because NFKC can make a name many times longer; the 255 limit applies to the normalised name. Names that only look alike therefore cannot sit side by side, and a name made only of invisible characters is refused as empty. Names are unique per organization regardless of case (409, so "finance" is refused when "Finance" exists).
- A name or headcount note containing a control character (U+0000 to U+001F, or U+007F to U+009F), such as a tab or a line break, answers 400. The drawer turns line breaks typed into the note into spaces before it sends the note, because the note always shows on one line.
- Headcount and target are whole numbers from 0. The target date is a real `YYYY-MM-DD` date in a year from 1900 to 2200; the drawer's date picker offers the same range.
- The path `departmentUuid` must be a UUID (422 from the route layer, before the flag and scope checks). Ids in request bodies (`groupUuids`, `userUuids`, owner `uuid`, `parentDepartmentUuid`) are validated by the service and answer 400, as do unknown groups, users or parents. Every uuid from a path or a body is lower-cased before it is used, so an upper-case uuid behaves exactly like the lower-case one.
- Input repeated back in an error message is cut to 80 characters and an ellipsis.

Response types are in `packages/common/src/types/departments.ts`.

## Frontend

Code is under `packages/frontend/src/ee/`:

- `pages/Adoption.tsx` is the index: the Map and List views, the attention strip, and the department drawer and placement modal for people with `manage`.
- `pages/AdoptionDepartment.tsx` is one department's page. It checks the route's `departmentUuid` is a UUID before anything is fetched; any other value shows "Department not found" and requests nothing.
- `hooks/useOrgDepartments.ts` holds the query and mutation hooks. Mutations invalidate the `org-adoption` query key. Every department path segment is URL-encoded, and the detail query only runs for a UUID, so a crafted value cannot reach another API path.
- `features/adoption/map/` draws the map: departments as nested circles, people as dots coloured by activity, role or last activity. Layout and geometry are pure modules with tests.
- `features/adoption/components/` and `utils/` hold the list, drawer, tiles, charts and helpers.

Two numbers on the index differ on purpose. The page header counts everyone on Lightdash. The map's organization tile counts the people placed in a department, and says so; the difference is the people in the attention strip. The map's "No account" tile and its legend entry are the same sum over the circles in view, so a sub-department with more accounts than headcount does not cancel out another's gap.

The sidebar entry and the routes are added only when the instance has a valid enterprise licence (`health.license.valid`), the flag is on and the user has `view`. One helper, `canAccessOrganizationAdoption` in `packages/frontend/src/hooks/settings/organizationAdoptionAccess.ts`, decides both, so an unlicensed instance with the flag on shows no entry.

## Known limits

- The one-assignment-per-person rule is application code with no constraint behind it. It holds because every write goes through `DepartmentModel` under the per-organization lock; a row written to `department_members` by any other path would not be checked.
- A scheduled chart or dashboard run still writes a chart view (and possibly a dashboard view) under its owner, and those rows carry nothing that tells a scheduled run from a person. The weekly trend is built from views only, so a weekly schedule makes its owner show as active every week, and it can keep them active in the 30-day count too.
- `query_history` does not record whether a query came from a data app or a schedule that reused an interactive context, so such a run still counts as a query.
- When the cached snapshot has expired, the next read, including a single department page, loads the whole organization snapshot and passes every member uuid to SQL.
- The snapshot cache lives in each backend process, so a write handled by one process does not clear another process's copy; figures can stay up to 60 seconds old there.
- Users without a primary email, deactivated users and invited people who have not completed sign-up are left out of the member rows altogether. With no headcount set they are not visible anywhere on the page.
- The newest weekly bucket is the current, partial week, so it usually reads low.
- The weekly trend counts chart and dashboard views, not queries, so people who only query are missing from it.
- Queries are retained for a limited period set by the instance (`QUERY_HISTORY_RETENTION_DAYS`, 32 days by default). A retention below 30 days makes the 30-day active count, the per-person query count and top explores undercount.
- "No recorded activity" means nothing recorded in the last 90 days. It covers people who never used the product, people last active more than 90 days ago, and people whose only activity was a query that has since been deleted.
- Percentages on a department's `directMetrics` use that department's own headcount, not the effective one.
- Dashboards in a trashed space can appear in top content. Only the dashboard's own `deleted_at` is checked.
- Top content names are visible to anyone with the view scope, whatever their access to the space.
- The map hides person dots above 5,000 people in view and drops labels on very crowded maps.
- Person dots are a picture of how a department is doing, not a way to find someone. The map loads a department's people only when 150 or fewer are in view. Above that, dots are drawn from counts and cannot be selected; to find a person, use the department page's people list.
- The placement modal and the drawer's resolved-member list draw 50 people at a time, and the drawer's pickers offer 50 options at a time; search reaches the rest. The department detail response itself still returns every member, and opening the drawer from the index still loads the organization's whole membership list.
- Safari trackpad pinch does not zoom the map.
