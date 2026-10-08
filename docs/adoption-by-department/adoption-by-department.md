# Adoption by department

Usage analytics shows how an organization uses Lightdash as a whole. Adoption by department shows which parts of the organization are using it, including the parts that have not started, so enablement can be aimed where it is needed. Terms are defined in [CONTEXT.md](./CONTEXT.md).

The feature lives under Settings, Adoption (`/generalSettings/adoption`, and `/generalSettings/adoption/:departmentUuid` for one department). The index opens on a Map view with a List alternative. The choice is kept in the `view` query parameter and, as a fallback, in local storage per user.

## Access

All of the following must hold, otherwise the API answers 404 (no flag, no licence) or 403 (no scope). A malformed `departmentUuid` in the path is rejected earlier, by the route layer, with 422, so it returns 422 even when the feature is off:

- The `organization-adoption` feature flag is on for the user and organization (`FeatureFlags.OrganizationAdoption`).
- The instance has the enterprise licence. Without it the service is not registered and the controller turns the missing provider into a 404.
- The user holds `view:OrganizationAdoption` to read, and `manage:OrganizationAdoption` to change anything. `manage` depends on `view`. Organization admins get both; other roles need a custom role.

The routes are hidden from the generated API docs while the feature is under development.

## Data model

One migration (`packages/backend/src/database/migrations/20261007201524_create_organization_departments.ts`) creates four tables:

| Table                      | Purpose                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization_departments` | One row per department. `parent_department_uuid` makes the tree. Holds `headcount`, `headcount_note`, `target_active_users`, `target_date`, and `updated_by_user_uuid`. Name is unique per organization                                                                                  |
| `department_links`         | Groups linked to a department (`link_type = 'group'`; `space` and `project` are allowed by the check constraint but reserved). Primary key is `(link_type, link_uuid)`, so a group links to at most one department                                                                       |
| `department_members`       | People assigned to a department by hand. The primary key is `(department_uuid, user_uuid)`. One assignment per person per organization is enforced in application code, not by a constraint: `DepartmentModel.setMembers` removes the person's other assignments in the same transaction |
| `department_owners`        | Owners of a department, each a user or a group, ordered by `position`                                                                                                                                                                                                                    |

`link_uuid` and `principal_uuid` are polymorphic and have no foreign key. Reads inner-join the target table, so a deleted group or user drops out. Deleting an organization cascades to its departments.

Membership is never stored. It is resolved on every read.

## Rules

### Tree

Departments form a tree. A department with no parent is at the top. A department cannot be its own parent or sit under one of its descendants; `DepartmentModel.update` rejects both with a 400 using a recursive query. Deleting a department moves its sub-departments up one level, to the deleted department's parent. The foreign key is `ON DELETE SET NULL` only as a fallback.

The tree helpers (ancestors, descendants, cycle check, effective headcount, roll-up) are pure functions in `packages/common/src/departments/departmentTree.ts`.

### Membership: most specific wins

`resolveDepartmentMembership` in `packages/common/src/departments/resolveDepartmentMembership.ts` decides where each person counts:

1. A person with an explicit assignment counts in that department. Nothing else is considered. Assigning a person to a department removes any earlier assignment in the organization.
2. Otherwise, take every department reached through the person's groups and drop any that is an ancestor of another candidate. A sub-department beats its parent.
3. One department left: the person counts there. Several left, in different branches: the person is a conflict and counts nowhere until placed. None: the person is unassigned.

Internal users (`users.is_internal`) are excluded from resolution and cannot be members or owners.

A person counts as on Lightdash only when their user is active (`users.is_active`) and they have completed sign-up. There is no column for a pending invite, so sign-up is derived the way the organization members list derives it (`UserModel.findIfUsersHaveAuthentication`): the person has a password, a single sign-on identity, or a verified primary email. `DepartmentModel.getResolvedMemberRows` leaves everyone else out, so they are not members, are not conflicts or unassigned, and fall into "no account" through the headcount.

A deactivated or pending user can still be assigned to a department, and can be an owner. The assignment is stored and waits: the person starts counting in that department when they become active and complete sign-up.

A parent's members are its own plus those of all its descendants. `metrics` on a department is the rolled-up figure; `directMetrics` counts only people who resolved to that department itself.

### Headcount

Effective headcount is the department's own headcount when set, otherwise the sum of its children's effective headcounts, otherwise null (never zero). When the own value is below the children's sum, `headcountBelowChildren` is true; the own value is still used. Each department also carries a free-text `headcountNote` (500 characters at most) for where the number came from.

### Owners

A department has an ordered list of owners, each a user or a group. The first is the display owner. Setting owners replaces the whole list and keeps the order sent.

## Metrics

Computed on each request in `DepartmentService` and `departmentMetrics.ts` from existing tables. There are no events and no scheduled jobs.

| Metric        | Definition                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members       | People on Lightdash who resolve to the department or a descendant. Internal users, users without a primary email, deactivated users and people who were invited but have not completed sign-up are excluded               |
| Coverage      | Members divided by effective headcount, as a rounded percentage                                                                                                                                                           |
| Active        | Members who ran a query themselves (`query_history`, interactive contexts only) or viewed a chart or dashboard (`analytics_chart_views`, `analytics_dashboard_views`) in the last 30 days, divided by effective headcount |
| Role split    | Members by organization role. Member and viewer count as viewers, developer counts as editor                                                                                                                              |
| Weekly active | Distinct members with a chart or dashboard view in each of the last 12 weeks, oldest first. Queries are left out so that every week is counted the same way                                                               |

A query counts only when a person ran it. `DepartmentAnalyticsModel` keeps the `query_history` rows whose `context` the backend's `queryWorkloadOrigin` (`packages/backend/src/services/AsyncQueryService/queryUsage.ts`) classifies as interactive: explores, dashboards, saved charts, SQL runner and view underlying data. Scheduled deliveries, alerts, Google Sheets syncs, API and CLI runs, AI agent and MCP runs, and auto-refreshed dashboards do not make their owner active. The same filter applies to the per-person query count and to top explores.

Active has one definition, in SQL. The summary's 30-day count and weekly buckets come from a single query (`DepartmentAnalyticsModel.getActivity`, which scans views for 12 weeks and queries for 30 days), and the member list's `isActive30d` flag (`getMemberActivity`) uses the same sources and the same 30-day bound. The browser reads the flag for the member filters, the map's dot colours and the legend; it does not compare `lastActiveAt` to its own clock. The one exception is the map's "Active in 12 weeks" colouring, which still compares `lastActiveAt` to the clock for people who are not active in 30 days.

Every activity read is limited to the organization. `query_history` has an organization column. `analytics_chart_views` and `analytics_dashboard_views` do not, so they are joined to the organization through the content viewed: chart to project, and dashboard to space to project. A view of content in another organization never counts.

Query history is not kept for long. The instance deletes `query_history` rows older than `QUERY_HISTORY_RETENTION_DAYS` (32 days by default, on unless `QUERY_HISTORY_CLEANUP_ENABLED` is `false`), while the two view tables are kept. Three things follow:

- The weekly trend counts chart and dashboard views only. A week 10 weeks back has no queries left to count, so counting queries in recent weeks would make them look busier than old ones. A person who only runs explores or SQL does not appear in the trend.
- The 30-day active count uses views and the queries a person ran. If the instance keeps queries for fewer than 30 days, the count misses the queries already deleted and reads low.
- `lastActiveAt` is the latest of a person's views and the queries still retained. Null means nothing is recorded, not that the person never used the product, so the page says "No recorded activity".

Percentages are of headcount and are null when there is no headcount or it is 0. They are not capped, so more accounts than headcount reads above 100. The page then shows counts.

Time handling is UTC, but not everything is calendar-aligned:

- Week buckets start on UTC Mondays, on both the SQL side (`date_trunc('week', ...)`) and the TypeScript side (`lastNWeekStarts`). The newest bucket is the current, partial week.
- The 30-day active window and the 12-week trend read are rolling windows measured from one instant per request (`getActivityWindows()` in `DepartmentService.ts`: now minus 30 days, and now minus 84 days), not from a UTC midnight. Every read in the request uses the same two bounds.
- `weeksLeft` and the frontend's "N days ago" label count UTC calendar days. The label is for display only and never decides who is active.

The timestamp columns read here are `timestamp without time zone`. They are read as UTC only if the server process and the database session run in UTC; the code does not enforce it.

The department page (`getDetail`) adds:

- Target progress: `targetActiveUsers` against current active members. `remaining` is never negative. `weeksLeft` is null with no target date, 0 on the target day, positive before it (rounded up, so a partial week counts) and negative once overdue.
- The weekly trend against `orgAverage`, the mean across departments at the same depth in the tree.
- Top content for the last 30 days, up to five each of dashboards, explores and AI agents, with use counts and distinct people.
- A member list sorted no recorded activity first, then longest inactive. Each row has the person's last activity, whether they are active in 30 days (`isActive30d`), queries and dashboard views in 30 days, and where they resolved. `isDirect` says whether they resolved to this department or a descendant.

The AI agent read is guarded by a table check (`hasAiTables`) because `ai_prompt`, `ai_thread` and `ai_agent` come from enterprise migrations and do not exist on every instance. Without them the list is empty.

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

Validation in `DepartmentService`: names are required, unique per organization (409) and at most 255 characters; headcount and target are whole numbers from 0; the target date is a real `YYYY-MM-DD` date; the path `departmentUuid` must be a UUID (422 from the route layer, before the flag and scope checks); ids in request bodies (`groupUuids`, `userUuids`, owner `uuid`, `parentDepartmentUuid`) are validated by the service and answer 400, as do unknown groups, users or parents.

Response types are in `packages/common/src/types/departments.ts`.

## Frontend

Code is under `packages/frontend/src/ee/`:

- `pages/Adoption.tsx` is the index: the Map and List views, the attention strip, and the department drawer and placement modal for people with `manage`.
- `pages/AdoptionDepartment.tsx` is one department's page.
- `hooks/useOrgDepartments.ts` holds the query and mutation hooks. Mutations invalidate the `org-adoption` query key.
- `features/adoption/map/` draws the map: departments as nested circles, people as dots coloured by activity, role or last activity. Layout and geometry are pure modules with tests.
- `features/adoption/components/` and `utils/` hold the list, drawer, tiles, charts and helpers.

Routes are added in `packages/frontend/src/pages/Settings.tsx` only when the flag is on and the user has `view`.

## Known limits

- Moving departments concurrently can store a cycle. The cycle check runs before the update with no per-organization lock, so two moves in opposite directions at the same moment can both pass.
- Assigning people concurrently can leave a person with two explicit assignments, because the one-assignment rule is application code with no constraint behind it.
- A scheduled delivery of a saved chart writes an `analytics_chart_views` row for the schedule's owner, and the row carries nothing that tells it apart from a person opening the chart. Those views still count as activity.
- `query_history` does not record whether a query came from a data app or a schedule that reused an interactive context, so such a run still counts as a query.
- Every read, including a single department page, loads the whole organization snapshot and passes every member uuid to SQL.
- The per-person last-active read scans all history rather than a window.
- Users without a primary email, deactivated users and invited people who have not completed sign-up are left out of the member rows altogether. With no headcount set they are not visible anywhere on the page.
- A person provisioned without a password or single sign-on identity counts once their primary email is verified, even if they have not logged in.
- The newest weekly bucket is the current, partial week, so it usually reads low.
- The weekly trend counts chart and dashboard views, not queries, so people who only query are missing from it.
- Queries are retained for a limited period set by the instance (`QUERY_HISTORY_RETENTION_DAYS`, 32 days by default). A retention below 30 days makes the 30-day active count, the per-person query count and top explores undercount.
- "No recorded activity" covers both people who never used the product and people whose only activity was a query that has since been deleted.
- Percentages on a department's `directMetrics` use that department's own headcount, not the effective one.
- Dashboards in a trashed space can appear in top content. Only the dashboard's own `deleted_at` is checked.
- Top content names are visible to anyone with the view scope, whatever their access to the space.
- The map hides person dots above 5,000 people in view and drops labels on very crowded maps.
- The map loads a department's people only when 150 or fewer are in view. Above that, dots are coloured from the department counts, carry no names and cannot be selected.
- The placement modal and the drawer's resolved-member list draw 50 people at a time, and the drawer's pickers offer 50 options at a time; search reaches the rest. The department detail response itself still returns every member, and opening the drawer from the index still loads the organization's whole membership list.
- Safari trackpad pinch does not zoom the map.
