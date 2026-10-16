# Managed analytics project access

The **Lightdash analytics** project has an additional read permission:
**View managed analytics for the entire organization** (`view:SystemAnalytics`).
It is separate from **View usage analytics** (`view:Analytics`), which still
controls the older Project settings usage reports.

## Granting access

Organization admins retain access by default. Other users and service accounts
need an explicit custom-role grant, plus the normal project/content permissions.
The organization's `analytics-project` feature flag must also be enabled.

An organization administrator can:

1. Create a custom role under **Organization settings → Custom roles** with
   `view:SystemAnalytics` and its `view:Project` dependency.
2. Assign it to selected users, a project group, or a service account on the
   **Lightdash analytics** project. Organization-level assignment is also
   supported, but a project assignment makes the intended access explicit.
3. Keep the ordinary permissions needed for the task. A Viewer can read shared
   saved content; Interactive Viewer access (or the corresponding custom
   `manage:Explore` and content scopes) is needed to build Explore queries.
   Custom roles are additive, so the analytics grant can supplement an existing
   project role without replacing it.

**The analytics project contains organization-wide usage data.** A project-level
analytics grant does not filter that data to the other projects the recipient
can access. Only grant it to people or agents trusted to see the organization's
usage data, including user and content names.

Creating, syncing and deleting the managed project through analytics settings
still require organization administration. The new scope does not grant those
operations, project administration, SQL Runner, or extra content permissions.
Built-in Project Admin and other non-admin organization roles are not opted in
automatically. Private spaces retain their normal content-access checks.

## Agents and service accounts

Agents inherit the permissions of the identity they authenticate with. Assign
the dedicated scope to the service account itself, not just its creator.
The same project, Explore, content and MCP capability checks apply. An agent can
query the managed Explores with the required read/query permissions; raw SQL
Runner remains unavailable for managed analytics projects.

## Revocation and boundaries

Removing the final analytics grant denies project discovery and direct reads,
including query history and cached results, once the normal permission/session
refresh has taken effect. Check direct, group and organization-level grants:
removing one does not revoke permission supplied by another role. An organization
admin still has access through their administration role.

The backend verifies organization identity independently of the scope. Queries
remain bound to the persisted project's organization and its server-controlled
storage prefix; granting this scope does not allow choosing another customer's
storage, connector or models. Disabling the analytics feature flag blocks reads
for admins and explicitly authorized readers alike.

## Support verification

1. Confirm the project's `provisioningSource: 'analytics'`, not just its name.
2. Check the organization's feature flag, the identity's effective role set and
   the ordinary project/content/query permissions.
3. Check the project selector, a saved dashboard, and a direct Explore query.
   Without the analytics grant, direct reads report **Managed analytics requires
   the View managed analytics permission**.
4. For an agent, repeat with its actual service-account token or delegated user
   identity. Organization membership alone does not grant analytics access.

Code references: `OrganizationService.getProjects` filters project discovery;
`ProjectService.assertAnalyticsProjectAccess` protects reads;
`AsyncQueryService` also checks history/result paths;
`ProjectService.assertAnalyticsProjectAdministration` protects managed settings.
