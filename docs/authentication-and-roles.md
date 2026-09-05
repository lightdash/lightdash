# Authentication and roles

How a request gets authenticated, how the resulting principal's CASL ability is
built, and how system roles and custom roles fit together. Companion to
[`authorization-scopes.md`](./authorization-scopes.md) (which goes deeper on
how to add or split a scope) and [`account-patterns.md`](./account-patterns.md)
(which focuses on `req.account` shapes).

## Authentication shapes

Every request lands on one of these auth paths. Each one resolves a `req.user`
(SessionUser) and `req.account`; CASL is then built from `req.user`'s
membership rows. The differences are who minted the credential and how it's
delivered.

| Shape | Header / cookie | Token prefix | Code path | Notes |
|---|---|---|---|---|
| **Session** (browser) | `Cookie: connect.sid=…` | n/a | `passport` session middleware | Set by `POST /api/v1/login`. The default for the web app. |
| **Personal access token** (PAT) | `Authorization: ApiKey <token>` | `ldpat_` | `allowApiKeyAuthentication` | Mints as the **owning user** — same identity, same role, same project memberships. Used by the CLI, scripts, ad-hoc API calls. |
| **Service account** (SA) | `Authorization: Bearer <token>` | `ldsvc_` | `authenticateServiceAccount` middleware | Authenticates as a **dedicated SA user** (not a human). See [`service-accounts.md`](./service-accounts.md) for the full lifecycle and permission model. |
| **SCIM token** | `Authorization: Bearer <token>` | `ldscim_` | `isScimAuthenticated` middleware | A constrained service account with the legacy `scim:manage` scope. Only the `/api/v1/scim/v2/*` routes accept it. Minted from the dedicated SCIM token UI in org settings. |
| **Embed JWT** | URL-signed JWT | n/a | `embed` auth strategy | A dashboard-scoped principal with no org membership. Different code path; out of scope here. |

The authenticated principal is the same shape downstream: `SessionUser` for
the user record, `Account` for narrowed CASL/identity. See
[`account-patterns.md`](./account-patterns.md) for which to use where.

## Role layers

A user's CASL ability is assembled from **two independent layers** that get
merged with `Ability.update([...orgRules, ...projectRules])`:

```
                ┌──────────────────────┐
   org-level ──▶│ organization_         │── via organizationMemberAbility
                │ memberships row       │   OR buildAbilityFromScopes
                └──────────────────────┘   (if role_uuid set)
                          +
                ┌──────────────────────┐
project-level ─▶│ project_memberships   │── via projectMemberAbility
                │ row(s)                │   OR buildAbilityFromScopes
                └──────────────────────┘   (if role_uuid set)
```

CASL is **additive**: the project layer cannot revoke anything granted at the
org layer. Anything you want to be able to gate via custom roles must live at
the project layer (which is why most fine-grained permissions are checked
against project-scoped subjects).

## System roles

The 6 hard-coded roles. Each one is a TypeScript function that calls `can(...)`
on a CASL `AbilityBuilder`:

| Role | Where defined |
|---|---|
| `member` | `organizationMemberAbility.ts` (only org-level) |
| `viewer` | `organizationMemberAbility.ts` + `projectMemberAbility.ts` |
| `interactive_viewer` | both |
| `editor` | both |
| `developer` | both |
| `admin` | both |

System roles do **not** exist as rows in the `roles` table — they're returned
by `GET /api/v2/orgs/{org}/roles?roleTypeFilter=system` with synthetic
`roleUuid` values like `"admin"`, `"editor"`, etc., and resolved entirely in
code (see `applyOrganizationMemberStaticAbilities` /
`applyProjectMemberStaticAbilities`).

When a membership row has `role_uuid IS NULL`, the layer falls back to the
system role driven by the `role` column.

## Custom roles

Stored in `roles` (one row per role) + `scoped_roles` (many rows per role,
one per scope). Built via `buildAbilityFromScopes(scopes, ...)` which walks
the scope vocabulary in `packages/common/src/authorization/scopes.ts` and
calls `can(...)` once per scope.

Two assignment surfaces:

1. **Project-level custom roles** (the original use case). Set
   `project_memberships.role_uuid` to a custom role uuid. Used today by both
   human users and project-scoped automation.
2. **Organization-level custom roles**. Set
   `organization_memberships.role_uuid`. A role carries a `level`
   (`'project' | 'organization'`) that decides which scopes it may hold and
   where it may be assigned; `RolesService` rejects a mismatch at both
   scope-assignment and role-assignment time.

The custom-roles UI under **Settings → Custom roles** edits both surfaces
through the same controllers (`CustomRolesController`, `OrganizationRolesController`).
The org-level scope vocabulary (`view:Organization`, `manage:OrganizationMemberProfile`,
`manage:InviteLink`, `manage:Group`, …) is grouped under
`ScopeGroup.ORGANIZATION_MANAGEMENT` in `scopes.ts` so admins can build a
custom role that grants exactly the org-level abilities they need (e.g.,
"team-onboarding bot" with only `manage:InviteLink`).

## Where each principal type lands in the layers

| Principal | Org layer | Project layer |
|---|---|---|
| Human user | system role from `om.role`, OR custom role from `om.role_uuid` | per project: same logic via `pm.role` / `pm.role_uuid` |
| PAT | inherits everything from the underlying user (PAT has no own role) | same |
| Service account | system role via `om.role`, custom role via `om.role_uuid`, **OR** legacy scope via `service_accounts.scopes` (back-compat path — see [`service-accounts.md`](./service-accounts.md)) | none — SAs are org-scoped principals |
| SCIM token | hardcoded `scim:manage` legacy scope (manage on `OrganizationMemberProfile` and `Group` only) | none |
| Embed JWT | n/a | dashboard-scoped subject; rules built per-token (see embed code) |

## Adding a new permission

The full checklist for adding a CASL subject + scope is in the root
`CLAUDE.md` under "Authorization & Custom Roles". The short version:

1. Add the subject to `CaslSubjectNames` (`types.ts`).
2. Add the scope to `scopes.ts` (controls custom-role coverage).
3. Add `can(...)` calls to the relevant system role functions
   (`projectMemberAbility.ts`, `organizationMemberAbility.ts`).
4. Update `roleToScopeMapping.ts` so system roles still map to the same scope
   sets (the parity tests enforce this — see below).
5. Decide whether service accounts need it: add to
   `serviceAccountAbility.ts` (legacy scope path) and/or rely on the system-role
   delegation (`SYSTEM_*` SA scopes inherit from `applyOrganizationMemberStaticAbilities`).

### Drift safeguards (`roleToScopeParity.test.ts`)

Three independent tests run on every commit and fire if any of these
sources of truth drift apart:

1. **Project parity (per role)** — every action+subject the project
   ability builder grants must also be reachable through some scope in
   `BASE_ROLE_SCOPES` for that role. Catches "I added a `can(...)` in
   `projectMemberAbility.ts` but forgot to add a matching scope to a
   role tier."
2. **Org parity (per role)** — same check against
   `applyOrganizationMemberStaticAbilities`. This is the test that *was
   missing* before the org-management scopes drifted out of the
   vocabulary; it's the safeguard going forward.
3. **Scope-vocabulary coverage** — every scope in `scopes.ts` must
   appear in some `BASE_ROLE_SCOPES` tier OR be on an explicit
   `INTENTIONALLY_UNWIRED_SCOPES` allowlist (with a justification).
   Catches "I added a scope to the vocabulary but forgot to wire it
   into any tier"

If you add a new ability or scope, the relevant test will fail with a
specific message pointing at what to update. Treat it as a checklist —
fix the wiring, don't add to the ignore list unless there's a real
reason (e.g. dynamic deployment-config-gated abilities like
`manage:PersonalAccessToken`).

### Sources of truth and how `system:*` SA scopes avoid drift

The `system:*` SA scopes (`system:admin`, `system:developer`, …) **delegate**
to `applyOrganizationMemberStaticAbilities[role]` — the same function that
defines abilities for human users with that org role. So a new permission
added to `organizationMemberAbility.ts` flows automatically into:

- Human users with that role
- Service accounts with the matching `system:*` scope
- Custom roles that include the equivalent scope (after the
  `roleToScopeMapping.ts` update)

**No parallel SA-side mapping** is required for the `system:*` path — that's
the deliberate point of the alias.

The legacy `org:admin/edit/read` SA scopes in `serviceAccountAbility.ts` are
the exception: they're hand-coded `can(...)` lists that have always drifted
from the human-role definitions on purpose. There's no parity test today
between `applyServiceAccountAbilities[ORG_*]` and the matching
`applyOrganizationMemberStaticAbilities` blocks; if you care about legacy
tokens picking up a new permission you have to add the `can(...)` line
manually. The Phase-C `manage:ContentAsCode` regression came from exactly
this drift.

## What custom roles can't grant

Anything that's CASL-checked has a corresponding scope in `scopes.ts`, so
`buildAbilityFromScopes` covers it. The gaps are routes that **don't**
go through CASL:

- **SCIM endpoints** (`/api/v1/scim/v2/*`). They use the `isScimAuthenticated`
  middleware which only accepts the legacy SA scope `scim:manage`. There's
  no `manage:Scim` scope in the custom-role vocabulary.
- **Service-account creation/management** (`/api/v1/service-accounts/*`).
  Controllers use `assertRegisteredAccount(req.account)`, which rejects any
  SA-bearer principal. Even an "admin" custom role can't escalate by minting
  more SAs from a SA token — by design.
- **Personal-access-token creation as the SA.** Same `assertRegisteredAccount`
  gate. The `manage:PersonalAccessToken` scope exists in the vocabulary but
  the route blocks SA principals before CASL runs.
- **Session-only routes** (e.g., `PATCH /api/v1/org`). Some org-mutation
  routes don't include `allowApiKeyAuthentication` middleware, so bearer
  auth returns 401 regardless of CASL. `manage:Organization` scope exists
  but doesn't help over a bearer token.
- **`impersonate:User`.** The scope exists in `ORGANIZATION_MANAGEMENT`,
  but the impersonation route is admin-only and gated outside the
  custom-role flow.
- **Instance-level operations** (license, instance config). Not in
  `scopes.ts`; admin-only via session.

## Project vs organization assignment of custom roles

A custom role is a single bundle of scopes. The same role row can be
assigned at **either level** of the membership stack — and the resulting
runtime behavior differs by level. The role-builder UI doesn't
distinguish; it surfaces every scope from `scopes.ts` (gated by your
license tier), and the operator picks which to toggle.

### What "the same role works at both levels" actually means

- **`organization_memberships.role_uuid`** — `buildAbilityFromScopes` is
  called with `{ organizationUuid }` context. Org-management scopes
  (`manage:OrganizationMemberProfile`, `manage:InviteLink`,
  `manage:Group`, …) take effect on the org-keyed subjects they're
  intended for. Project-content scopes (`view:Dashboard`,
  `manage:Space`, …) also fire for *every* project in the org because
  their conditions match subjects via `inheritsFromOrgOrProject` /
  org-uuid keying.
- **`project_memberships.role_uuid`** — context is `{ projectUuid }`.
  Project-content scopes match the project's own subjects. Org-management
  scopes silently no-op: their target subjects (`OrganizationMemberProfile`
  etc.) carry `organizationUuid`, so a `{ projectUuid }`-keyed condition
  can never match. CASL's additivity is an architectural safeguard here
  — a project-level role assignment can never escalate to org-level
  abilities the user doesn't already have at the org layer.

This means the **same custom role** behaves differently:

| Role: "CI deployer" with `manage:DeployProject` + `manage:ContentAsCode` + `manage:OrganizationMemberProfile` |  |
|---|---|
| Bound to `organization_memberships.role_uuid` (e.g. an SA token) | Can deploy any project + manage org members |
| Bound to `project_memberships.role_uuid` for project A | Can deploy project A + content-as-code on project A; **silently cannot** manage org members |

### Personal access tokens are the exception

`manage:PersonalAccessToken` can be the one scope where the organization
primary slot has the final say — for organizations that opt in via the
`pat-scope-authoritative` feature flag on a licensed (enterprise)
deployment. For everyone else, every scope set inherits token access from
the deployment config (`DISABLE_PAT`, `PAT_ALLOWED_ORG_ROLES`) when it
doesn't list the scope, exactly as before.

While the opt-in is active, a custom role in
`organization_memberships.role_uuid` is read literally: omit the scope and
its users cannot create tokens; list it and they can, still capped by the
deployment config, which can deny but never grant. Downstream scope sets
(project roles, extra roles) can neither inherit the scope from config nor
restore it by listing it explicitly — the org primary slot alone decides.

That makes an org-level custom role (plus the flag) the supported way to
deny tokens to a set of users. A project-level role cannot do it, by
design. System organization roles are unaffected either way: their token
access always comes from the deployment config.

### What `BASE_ROLE_SCOPES` returns when you duplicate "Admin"

When an operator clicks **Duplicate role** on a system role, the new
custom role gets the union of project-level *and* org-level abilities
that role grants — i.e. every scope a human admin (or editor / developer
/ etc.) can effectively use across both layers. That's intentional and
mirrors the user's expectation that "the role does what the system role
does." The trade-off is the project-level no-op above: an admin clone
assigned at the project level will still show org-management toggles
ticked, but those toggles are dead at runtime in that context.

### How the role builder avoids the trap

Every scope declares a `level`, and the role builder only offers the
scopes assignable at the role's own level
(`getScopesByGroup` → `isScopeAssignableAtLevel`). On a project-level
role the org-management scopes aren't listed at all, and the selector
says how many are hidden and why. `RolesService.validateScopesLevel`
enforces the same rule server-side, so the API can't create the
silent-no-op combination either.

The residual trap is the one described above: a role that already holds
org scopes (an admin duplicate, or a role built before level filtering)
still shows those toggles ticked while assigned at the project level,
where they're dead.

## Enabling the roadmap for a non-admin

The enterprise roadmap (**Settings → Roadmap**) is gated on the CASL
check `view Roadmap` against the user's own organization, plus the
`OrganizationRoadmap` feature flag. Organization admins get the scope
from their system role; **it is deliberately not granted to any other
system role**, so every other user needs an explicit grant. The recipe:

1. Enterprise license key configured, plus custom roles enabled
   (`CUSTOM_ROLES_ENABLED=true` or the `custom-roles` flag). Without
   both, the role assignment silently falls back to the user's system
   role and the grant does nothing.
2. **Settings → Roles** → duplicate the role the user should keep (e.g.
   Viewer) and pick the **organization** level. An org-level custom role
   *replaces* the user's system-role org abilities rather than adding to
   them, so the duplicate has to carry everything they already had.
3. Toggle **View Roadmap** (Organization Management group) and save.
4. Assign the new role to the user **at the organization level**
   (Settings → Users → change role; `UpsertOrganizationUserRoleAssignment`).
   Assigning it on a project grants nothing — `view:Roadmap` builds a
   `{ projectUuid }` condition that can never match the `{ organizationUuid }`
   -keyed `Roadmap` subject.

The user then sees the Roadmap nav item and
`GET /api/v1/org/roadmap` returns data; anyone without the scope gets no
nav item and a 403. Coverage lives in
`packages/common/src/authorization/roadmapAccess.test.ts`.

## Code references

- `packages/backend/src/models/UserModel.ts::generateUserAbilityBuilder` —
  the merge point. Routes humans / SAs / PATs into the right ability builder.
- `packages/common/src/authorization/scopeAbilityBuilder.ts` —
  `buildAbilityFromScopes` for any custom-role-driven path.
- `packages/common/src/authorization/projectMemberAbility.ts` &
  `organizationMemberAbility.ts` — system role definitions.
- `packages/common/src/authorization/serviceAccountAbility.ts` — legacy SA
  scope handlers + the new `SYSTEM_*` aliases that delegate to the org-member
  builders.
