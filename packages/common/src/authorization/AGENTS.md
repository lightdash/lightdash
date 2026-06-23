# Authorization Roles And Permissions

This folder is the main authorization surface for Lightdash. TypeScript files are the source of truth; this note is a map for agents.

## Core Files

| File                                    | Purpose                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `index.ts`                              | Builds user abilities by combining org + project membership layers. Chooses system-role path or custom-role path. |
| `organizationMemberAbility.ts`          | Built-in organization-role CASL rules.                                                                            |
| `projectMemberAbility.ts`               | Built-in project-role CASL rules.                                                                                 |
| `scopes.ts`                             | Scope vocabulary and conditions for custom roles. Exhaustive permission list lives here, not in this doc.         |
| `scopeAbilityBuilder.ts`                | Converts custom-role scopes into CASL rules.                                                                      |
| `roleToScopeMapping.ts`                 | Maps built-in project roles to equivalent scopes; parity tests catch drift.                                       |
| `serviceAccountAbility.ts`              | Legacy service-account scopes plus `system:*` delegation.                                                         |
| `types.ts`                              | CASL subject/action type definitions.                                                                             |
| `../types/organizationMemberProfile.ts` | Organization system role enum and labels.                                                                         |
| `../types/projectMemberRole.ts`         | Project system role enum, labels, and system-role order.                                                          |
| `../types/space.ts`                     | Space role enum and space access types.                                                                           |

## Ability Model

A user's ability is the union of two independent layers:

| Layer        | Source                     | Builder                                                                                                                                                                                      |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization | `organization_memberships` | `organizationMemberAbility.ts` when `role_uuid` is null (system role); `buildAbilityFromScopes` when `role_uuid` is set — org-level custom roles, for both human users and service accounts. |
| Project      | `project_memberships`      | `projectMemberAbility.ts` when `role_uuid` is null; `buildAbilityFromScopes` when `role_uuid` is set.                                                                                        |

CASL rules are additive. Project permissions cannot revoke organization permissions. If the org layer grants a permission, a narrower project custom role cannot remove it.

Org-level custom roles are a supported human-user surface. Assigning one (`upsertOrganizationUserRoleAssignment` with a custom `roleId`) sets `organization_memberships.role_uuid` and stores `role = 'member'`; the role's `level` must be `'organization'` (validated at assign time, alongside an org-ownership check). At runtime, when `role_uuid` is set and custom roles are enabled, the org layer is built from that role's scopes and **replaces** the system-role org abilities — it does not add on top of `member`. So an org-level custom role must be self-contained: it has to list every org scope its users need (including basic `view:*`), because the system-role defaults do not apply underneath it. This mirrors project custom roles, which replace the project system role rather than extending it. SCIM still assigns system org roles only (`setUserOrgAndProjectRoles`).

## Custom Roles Are Part Of The Contract

Do not reason about authorization only from built-in role hierarchy files. `ProjectRoleOrder`, `OrganizationMemberRole`, `projectMemberAbility.ts`, and `organizationMemberAbility.ts` describe stock roles only. Custom roles grant arbitrary individual scopes, so they do not fit a linear viewer → admin hierarchy.

Treat each scope in `scopes.ts` as a user-facing permission contract:

- Adding a new permission means adding/updating the scope vocabulary, not only adding a `can(...)` call to a system role.
- Renaming, splitting, merging, or removing a scope needs a `scoped_roles` migration so existing custom roles keep their intended access.
- `roleToScopeMapping.ts` must stay aligned with system-role abilities so duplicated system roles and parity tests keep working.
- A role's `level` (`'project' | 'organization'`) gates which scopes it may hold and where it can be assigned: org-level roles may only contain org-assignable scopes (`getOrgAssignableScopes` / `isScopeAssignableAtLevel`) and build org-level conditions with `{ organizationUuid }`; project-level roles build project-level conditions with `{ projectUuid }`. This applies to both human-user and service-account custom roles.
- Org-level grants are deliberately hard to restrict with project-level custom roles because layers are additive.

## Role Types

| Type                       | Meaning                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built-in organization role | `member`, `viewer`, `interactive_viewer`, `editor`, `developer`, `admin`; implemented in `organizationMemberAbility.ts`.                                                            |
| Built-in project role      | `viewer`, `interactive_viewer`, `editor`, `developer`, `admin`; implemented in `projectMemberAbility.ts`.                                                                           |
| Custom role                | Row in `roles` plus rows in `scoped_roles`; assigned to project users/groups, or to service accounts through their internal org membership. Built through `scopeAbilityBuilder.ts`. |
| Space role                 | Direct user/group access on a space; affects content rules that check `access` and `SpaceMemberRole`.                                                                               |

Built-in roles inherit by function calls (`admin` calls `developer`, etc.). Custom roles do not inherit; they are exactly the selected scopes plus conditions.

## Scope Conditions

Scope suffixes are condition hints, not hierarchy levels:

| Suffix      | Usual meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| `@self`     | Current user only, usually `userUuid` or `createdByUserUuid`.                      |
| `@space`    | Requires matching space access, usually editor/admin depending on scope.           |
| `@assigned` | Requires assigned space access, currently space admin for `manage:Space@assigned`. |
| `@public`   | Public/inherited content or space condition.                                       |
| `@preview`  | Preview project condition.                                                         |

Always verify exact conditions in `scopes.ts`; suffix names are shorthand only.

## Principal Types

| Principal             | Permission behavior                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser session user  | Uses the authenticated user's org/project membership rows.                                                                                                                                                      |
| Personal access token | Inherits the owning user's membership rows.                                                                                                                                                                     |
| Service account       | Uses its linked internal user/org membership: custom role when `organization_memberships.role_uuid` is set, otherwise legacy service-account scopes; `system:*` delegates to organization system-role builders. |
| SCIM token            | Uses constrained legacy `scim:manage`, not the normal role stack.                                                                                                                                               |
| Embed JWT             | Uses separate embedded-dashboard authorization, not normal memberships.                                                                                                                                         |

## Practical Rules For Changes

| Rule                                                                    | Why it matters                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Add new CASL subjects to `types.ts`.                                    | Keeps action/subject checks typed.                                   |
| Add custom-role coverage to `scopes.ts`.                                | Custom roles cannot grant permissions without a scope.               |
| Update `organizationMemberAbility.ts` and/or `projectMemberAbility.ts`. | Built-in roles are hard-coded there.                                 |
| Update `roleToScopeMapping.ts`.                                         | Keeps built-in roles and custom-role scope equivalents aligned.      |
| Add `scoped_roles` migrations for scope vocabulary changes.             | Existing custom roles persist scope names as strings.                |
| Run parity tests when touching roles/scopes.                            | They catch missing scope mappings and ability drift.                 |
| Check both org and project layers when debugging.                       | Either additive layer can grant access.                              |
| Check space access for private/assigned content.                        | Many content rules depend on `access` entries and `SpaceMemberRole`. |

See also:

- `docs/authentication-and-roles.md`
- `docs/authorization-scopes.md`
- `docs/service-accounts.md`
