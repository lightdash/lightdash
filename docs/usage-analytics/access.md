# Managed analytics project access

This is an internal support reference for access to the **Lightdash analytics**
project, including its project-selector entry, dashboards and Explores. It is
different from the older **Project settings → Usage analytics** dashboards.

## Default behavior

Creating the project does not make it available to every organization viewer.
New analytics projects have `ProjectType.DEFAULT`, but retain
`provisioningSource: 'analytics'`. That marker applies an additional access check
independently of the project type.

| Effective access                                                                                           | Managed analytics project                                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Organization Admin, with the analytics feature enabled                                                     | Can access their organization's project                              |
| Organization Viewer, with no additional grants                                                             | Hidden from the project list; direct access denied                   |
| Project Viewer, Editor, Developer or Admin alone                                                           | Does not satisfy the organization-level analytics check              |
| Custom organization role granting `manage:Organization`, plus the normal project/content/query permissions | Can satisfy the check, but also gains organization-management access |
| Custom role granting only `view:Analytics` and ordinary project permissions                                | Does not satisfy the managed-project check                           |

The backend checks the project organization and the `analytics-project` feature
flag, then requires `manage` on that organization. Normal permissions for the
requested project, content or query still apply. The project-list endpoint also
filters out managed analytics unless the caller has organization-management
permission; hiding the administration page is not the only protection.

## How an admin can give access today

For someone who should administer the organization, open **Organization settings
→ Users & groups**, find the user and assign the **Admin** organization role.
With the feature enabled and project created, the user can select **Lightdash
analytics**. This is a broad administrative grant, not an analytics-only viewer
role. Do not recommend promotion solely to work around the analytics restriction.

Where custom roles are available, an administrator can create an
**Organization** role under **Organization settings → Custom roles**, select
**Manage organization settings** (`manage:Organization`), and assign it to the
user at organization level. Retain the user's normal project/content permissions
(for example, through their existing organization Viewer role); query-building
permissions must also be granted if needed. A project-level role cannot grant
this organization-only scope.

That custom-role route passes the same organization-management check; it does
**not** provide analytics-only access. Review the broader grant with the
organization administrator before assigning it. Custom roles are additive, so
removing this grant from one role does not remove access supplied by another.

There is currently no separate read-only managed-analytics scope. If a customer
wants access without organization-management permission, record that requirement
as a product follow-up rather than promising that adding a project Viewer will
work. [PROD-11367](https://linear.app/lightdash/issue/PROD-11367) explicitly left
non-admin project-level access outside the standard-project change.

## Avoid confusing the two analytics permissions

**View usage analytics** (`view:Analytics`) authorizes the older project usage
reports served by `AnalyticsService`. It does not authorize the managed analytics
project. A custom role's display name, such as "Analytics viewer", does not change
this distinction: inspect its scopes and assignment level.

## Support verification

1. Confirm the target project's provisioning marker, not just its name or type.
2. Check the user's effective organization role set and project permissions.
3. With authorized impersonation, check the project selector and the direct
   `/projects/<project UUID>/tables` URL. A viewer without the organization grant
   should receive **Internal analytics requires organization administration access**.
4. Stop impersonation after testing. Do not change roles merely to diagnose access.

Code references:

- [`OrganizationService.getProjects`](../../packages/backend/src/services/OrganizationService/OrganizationService.ts): project-list filtering.
- [`ProjectService.assertAnalyticsProjectAccess`](../../packages/backend/src/services/ProjectService/ProjectService.ts): managed-project authorization.
- [`AsyncQueryService`](../../packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts): analytics checks on query/result paths.
- [`AnalyticsService`](../../packages/backend/src/services/AnalyticsService/AnalyticsService.ts): older `view:Analytics` reports.
- [`scopes.ts`](../../packages/common/src/authorization/scopes.ts): scope labels and organization-only scope level.

## Suggested customer reply

> At the moment, the new Lightdash analytics project requires organization-admin
> access. Adding someone as a project Viewer won't grant access to it. The
> existing "View usage analytics" custom permission applies to the older project
> usage dashboards. We don't yet have a separate read-only role for this project.
