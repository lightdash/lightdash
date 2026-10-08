# Adoption by department

Usage analytics shows how an organization uses Lightdash as a whole. Adoption by department shows which parts of the organization are using it, including the parts that have not started, so enablement can be aimed where it is needed. Terms are defined in [CONTEXT.md](./CONTEXT.md).

The feature lives under Settings, Adoption (`/generalSettings/adoption`, and `/generalSettings/adoption/:departmentUuid` for one department). The index opens on a Map view with a List alternative. The choice is kept in the `view` query parameter and, as a fallback, in local storage per user.

## Access

All of the following must hold, otherwise the API answers 404 (no flag, no licence) or 403 (no scope):

- The `organization-adoption` feature flag is on for the user and organization (`FeatureFlags.OrganizationAdoption`).
- The instance has the enterprise licence. Without it the service is not registered and the controller turns the missing provider into a 404.
- The user holds `view:OrganizationAdoption` to read, and `manage:OrganizationAdoption` to change anything. `manage` depends on `view`. Organization admins get both; other roles need a custom role.

The routes are hidden from the generated API docs while the feature is under development.

## Data model

One migration (`packages/backend/src/database/migrations/20261007201524_create_organization_departments.ts`) creates four tables:

| Table                      | Purpose                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organization_departments` | One row per department. `parent_department_uuid` makes the tree. Holds `headcount`, `headcount_note`, `target_active_users`, `target_date`, and `updated_by_user_uuid`. Name is unique per organization            |
| `department_links`         | Groups linked to a department (`link_type = 'group'`; `space` and `project` are allowed by the check constraint but reserved). Primary key is `(link_type, link_uuid)`, so a group links to at most one department |
| `department_members`       | People assigned to a department by hand                                                                                                                                                                            |
| `department_owners`        | Owners of a department, each a user or a group, ordered by `position`                                                                                                                                              |

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

A parent's members are its own plus those of all its descendants. `metrics` on a department is the rolled-up figure; `directMetrics` counts only people who resolved to that department itself.

### Headcount

Effective headcount is the department's own headcount when set, otherwise the sum of its children's effective headcounts, otherwise null (never zero). When the own value is below the children's sum, `headcountBelowChildren` is true; the own value is still used. Each department also carries a free-text `headcountNote` (500 characters at most) for where the number came from.

### Owners

A department has an ordered list of owners, each a user or a group. The first is the display owner. Setting owners replaces the whole list and keeps the order sent.

## Metrics

Computed on each request in `DepartmentService` and `departmentMetrics.ts` from existing tables. There are no events and no scheduled jobs.

| Metric        | Definition                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members       | People on Lightdash who resolve to the department or a descendant. Every non-internal organization member counts, including invited users who have never logged in and deactivated users |
| Coverage      | Members divided by effective headcount, as a rounded percentage                                                                                                                          |
| Active        | Members with a query (`query_history`) or a chart or dashboard view (`analytics_chart_views`, `analytics_dashboard_views`) in the last 30 days, divided by effective headcount           |
| Role split    | Members by organization role. Member and viewer count as viewers, developer counts as editor                                                                                             |
| Weekly active | Distinct active members per week for the last 12 weeks, oldest first                                                                                                                     |

Percentages are of headcount and are null when there is no headcount or it is 0. They are not capped, so more accounts than headcount reads above 100. The page then shows counts.

All time handling is UTC. Weeks start on UTC Mondays, on both the SQL side (`date_trunc('week', ...)`) and the TypeScript side (`lastNWeekStarts`). Days are UTC calendar days.

The department page (`getDetail`) adds:

- Target progress: `targetActiveUsers` against current active members. `remaining` is never negative. `weeksLeft` is null with no target date, 0 on the target day, positive before it (rounded up, so a partial week counts) and negative once overdue.
- The weekly trend against `orgAverage`, the mean across departments at the same depth in the tree.
- Top content for the last 30 days, up to five each of dashboards, explores and AI agents, with use counts and distinct people.
- A member list sorted never active first, then longest inactive. Each row has the person's last activity, queries and dashboard views in 30 days, and where they resolved. `isDirect` says whether they resolved to this department or a descendant.

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

Validation in `DepartmentService`: names are required, unique per organization (409) and at most 255 characters; headcount and target are whole numbers from 0; the target date is a real `YYYY-MM-DD` date; ids must be UUIDs (422 from the route layer, 400 from the service); unknown groups, users or parents answer 400.

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

These were found during review and deliberately deferred.

- Moving departments concurrently can store a cycle. The cycle check runs before the update with no per-organization lock, so two moves in opposite directions at the same moment can both pass.
- Activity from `analytics_chart_views` and `analytics_dashboard_views` has no organization column. On the detail page it is scoped to the organization through content joins; on the summary it is scoped only by the user set. A user who changed organization can therefore carry earlier views into the summary.
- Invited users who have never logged in, and deactivated users, count as "on Lightdash".
- The per-person last-active read scans all history rather than a window.
- Dashboards in a trashed space can appear in "what this department uses". Only the dashboard's own `deleted_at` is checked.
- Top content names are visible to anyone with the view scope, whatever their access to the space.
- The map hides person dots above 5,000 people in view and drops labels on very crowded maps.
- Safari trackpad pinch does not zoom the map.
