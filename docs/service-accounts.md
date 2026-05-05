# Service accounts

A service account (SA) is a non-human principal — a long-lived bearer token
that authenticates as its own dedicated user record and acts on the
organization's behalf. Use one for CI deploys, dashboards-as-code uploads,
SCIM provisioning, scheduled scripts, etc.

For the broader authentication picture (sessions, PATs, SCIM, embed) see
[`authentication-and-roles.md`](./authentication-and-roles.md).

## Anatomy

Each SA has three coupled DB rows, all created in a single transaction by
`ServiceAccountModel.save`:

```
service_accounts                       users (is_internal=true)
─────────────────                      ─────────
service_account_uuid                   user_uuid  ◀──────────┐
description                            first_name = description
expires_at                             last_name  = ''                 │
token_hash (sha256, never the token)   is_active  = false             │
scopes (text[])                        is_internal = true             │
service_account_user_uuid ─────────────┘                              │
                                                                       │
                                       organization_memberships         │
                                       ─────────────────────────         │
                                       user_id     ◀─────────────────┘
                                       organization_id
                                       role        (ornamental tier)
                                       role_uuid   (custom role, optional)
```

Why three rows:

- The **`users` row** gives the SA a real `userUuid` so all FK-attributed
  surfaces (`created_by_user_uuid`, audit log, scheduler ownership, ...)
  resolve to the SA itself rather than a fallback admin. `is_internal=true`
  filters it out of human-facing listings (`/org/users`, SCIM `/Users`,
  share/invite pickers, login-by-email).
- The **`organization_memberships` row** is what the auth middleware joins
  through to land the SA in the right org with the right role. The custom-role
  hookup lives here too (`role_uuid`), not on `service_accounts`.
- The **`service_accounts` row** holds the credential metadata (token hash,
  expiry, ornamental scope list) and points back at the user via
  `service_account_user_uuid`.

Token format: `ldsvc_<32 hex>` (32 random bytes, hex-encoded). The cleartext
token is returned **once** by `POST /api/v1/service-accounts` — only the hash
is persisted. Lose it and rotation isn't exposed (see *Rotation* below) so
recovery means delete + recreate.

## Permission shapes

A new SA must specify **exactly one** of `scopes` or `roleUuid`. The model
rejects both-or-neither with a 400 (`ParameterError`).

### 1. Legacy scope (`scopes: [...]`)

Coarse, pre-defined buckets. Each scope name maps to a hardcoded ability set
in `packages/common/src/authorization/serviceAccountAbility.ts`. The current
catalog:

| Scope | Shape | Purpose |
|---|---|---|
| `org:read` | broad org-level read with some baseline `manage:*` (legacy) | read-only style integrations |
| `org:edit` | inherits `org:read` + `manage:Space/ScheduledDeliveries/Tags/MetricsTree/PinnedItems/DashboardComments/SemanticViewer/Job/ContentAsCode` | most CI workflows (dashboards-as-code uploads work here — `manage:ContentAsCode` was restored after Phase C) |
| `org:admin` | inherits `org:edit` + project deploy/update/delete, org admin, group/invite/SCIM admin | full automation principal |
| `scim:manage` | only `manage:OrganizationMemberProfile` + `manage:Group` (no chart/dashboard surfaces at all) | dedicated to SCIM IdP integrations |
| `system:viewer` | delegates to `applyOrganizationMemberStaticAbilities.viewer` — same CASL as a human viewer | preferred for new viewer SAs |
| `system:interactive_viewer` | delegates to `interactive_viewer` | |
| `system:editor` | delegates to `editor` | |
| `system:developer` | delegates to `developer` | preview-project deploys, content-as-code, virtual views, custom SQL/fields, etc. |
| `system:admin` | delegates to `admin` | |

The `system:*` aliases are the path the create UI uses today — they keep the
SA's ability set in lockstep with the corresponding human role with no
parallel mapping to drift. The four legacy `org:*`/`scim:manage` scopes are
preserved on the wire for back-compat with already-minted tokens but not
surfaced in the UI for new SAs.

### 2. Custom role (`roleUuid: "..."`)

For everything more granular. The role is a row in `roles` with an arbitrary
subset of scopes from `scopes.ts` (e.g., `view:Project`, `manage:Dashboard`,
`manage:DeployProject`, `manage:OrganizationMemberProfile`). At create time
the role is validated to belong to the SA's organization (cross-org
assignments are rejected with 400). At runtime, `buildAbilityFromScopes` is
called against the role's scope list — exactly the same path human users go
through when they have a custom role assigned.

Why this exists: the legacy `system:*` aliases are coarse — there are five
buckets total. A custom role lets you build something like "CLI deployer
that can `manage:DeployProject` + `manage:ContentAsCode` and *nothing else*".

## Ability resolution at request time

Auth middleware (`authenticateServiceAccount` in
`packages/backend/src/ee/authentication/`) loads the SA's `users` row,
overrides `is_active=true` on the resulting `SessionUser` (defence against
"account deactivated" rejections downstream), and lets the request proceed.

`UserModel.generateUserAbilityBuilder` then routes any `is_internal` user
through the SA branch:

```
is_internal user:
  ├─ has organization_memberships.role_uuid?
  │   → buildAbilityFromScopes(custom role's scopes)        # custom-role path
  └─ else (legacy scope SA)
      → applyServiceAccountAbilities(service_accounts.scopes)  # legacy path
```

The custom-role path takes precedence whenever `role_uuid` is set. The
`customRoles.enabled` flag (`CUSTOM_ROLES_ENABLED` env var) is **not**
consulted on the SA path — it's a feature/UI gate that controls whether the
role builder shows up in settings, not a runtime ability gate. If a SA's
membership row points at a custom role, that role drives runtime CASL
regardless of how the flag is set; otherwise toggling the flag would
silently break every CI workflow keyed off a role-driven token.

## Lifecycle

### Creation

`POST /api/v1/service-accounts`. Admin-authenticated. Body:

```json
{
  "description": "CI deploy bot",
  "expiresAt": "2026-12-31T00:00:00Z",
  "scopes": ["system:developer"]      // OR "roleUuid": "<uuid>"
}
```

Response includes the cleartext `token` once — copy it before closing the
modal. Subsequent reads of the SA never include the token.

### Authentication

`Authorization: Bearer ldsvc_…`. The middleware:

1. Hashes the token, looks up `service_accounts.token_hash`.
2. Rejects if expired (`expires_at < now()`) or if the row has been deleted.
3. Updates `last_used_at` for telemetry.
4. Loads the linked `users` row → builds `SessionUser` from it.

Rejected tokens always return 401, never leak whether the token existed or
just expired.

### Listing / inspection

`GET /api/v1/service-accounts` returns every SA in the org **except**
SCIM-only ones (filtered by `scopes <@ ['org:read','org:edit','org:admin','system:*']`).
Each row includes the `roleUuid` (when set) so the admin UI can resolve
the role name. Tokens are never returned here.

### Deletion

`DELETE /api/v1/service-accounts/{uuid}` is **tombstone semantics**:

- The `service_accounts` row is removed → the token authenticates as 401.
- The dedicated `users` row is **kept** so historical FKs
  (`created_by_user_uuid` on charts, dashboards, schedulers, audit log) keep
  resolving and the UI continues to render "Created by <description>" on past
  content.
- Cascade in the other direction (deleting the user row → drops the SA) is
  enforced at the FK level so an orphaned SA can never exist.

### Rotation

There is **no** rotate endpoint exposed for the `/api/v1/service-accounts`
route. Only SCIM tokens can rotate (via `PATCH
/api/v1/scim/access-tokens/{uuid}/rotate`). To rotate a regular SA today:
delete it and create a new one with the same description / scope shape, then
update consumers. This is intentional — explicit re-create surfaces the
permission shape to whoever's doing the rotation.

### Expiration

`expiresAt` is opt-in: pass `null` to mint a non-expiring token (allowed but
discouraged), or any future ISO timestamp. Once past, the next auth attempt
returns 401 — there's no "renew" surface; mint a new one.

## Attribution

The SA's `users` row is its own identity for any FK-attributed surface:

- Spaces/dashboards/charts created via SA: `created_by_user_uuid` points at
  the SA's user uuid, not at the admin who minted the token.
- `GET /api/v1/user` with an SA token returns the SA's identity (firstName =
  description, etc.), not a spoofed admin.
- Audit log rows tie the action to the SA's user uuid; companion fields can
  surface the original SA uuid for human-readable attribution in admin UIs.

Pre-Phase-C this was different — the auth middleware spoofed the seeded
admin. The Phase C cutover (already merged on `main`) introduced the
dedicated user record. If you're chasing an attribution discrepancy in older
content, that's likely the seam: the FKs were rewritten when the SA's user
was provisioned by the backfill migration, but content created before the
migration may still point at the original admin.

## Internal-user filtering

The SA's `users` row has `is_internal=true`. Every human-facing listing
must filter it out — there are integration tests pinning these:

- `/api/v1/org/users` (admin org member list, including search)
- `/api/v1/scim/v2/Users` (SCIM IdP feed)
- Share / invite pickers
- Login-by-email lookups

If you add a new query that joins `users` and surfaces results to humans,
add `WHERE users.is_internal = false`. The integration tests in
`packages/api-tests/tests/serviceAccounts.test.ts` will catch leaks at the
known endpoints; new endpoints need their own coverage.

## Common gotchas

- **Don't reuse description as a uniqueness signal.** Two SAs with the same
  description are valid — the SA user records are independent.
- **`scim:manage` SAs are not general-purpose.** Their CASL only covers
  `OrganizationMemberProfile` + `Group`. Hitting any chart/dashboard endpoint
  returns 403 even though the token is otherwise valid (the auth middleware
  still resolves it).
- **Custom role assigned after creation.** There's no API to *change* an
  existing SA's `roleUuid` post-create. To repurpose an SA, delete + recreate.
  Updating the custom *role* itself (adding/removing scopes) does flow into
  every assigned SA's CASL on the next request — there's no caching.
- **Custom role deletion is blocked when assigned.** The
  `organization_memberships.role_uuid` FK has `ON DELETE RESTRICT`. The API
  returns 400 with a clear error rather than orphaning rows.
- **Broad scopes do not respect space membership.** The plain `manage:Space`,
  `manage:Dashboard`, `manage:SavedChart` scopes (no `@public` / `@assigned`
  / `@space` modifier) compile to `{ organizationUuid }` only — no
  `access: { $elemMatch }` filter. An SA with these scopes can edit content
  in **private spaces** even if no human is a member of those spaces. Same
  shape as the legacy `org:edit` / `org:admin` SAs (where the equivalent
  `access` blocks in `applyServiceAccountAbilities` are commented out).
  Use the `@*` modifiers for narrower, membership-aware permissions.

## Maintenance notes

- **`org:*` legacy SA scope drift.** The hand-coded handlers in
  `applyServiceAccountAbilities` for `ORG_READ` / `ORG_EDIT` / `ORG_ADMIN`
  are loose copies of the corresponding `applyOrganizationMemberStaticAbilities`
  builders, with the SA-specific quirks (commented-out `access` blocks,
  etc.). There's **no parity test** today, so adding a permission to a
  human role does not automatically extend it to legacy `org:*` SA tokens.
  The `manage:ContentAsCode` Phase-C regression came from exactly this
  drift; the fix added it back to ORG_EDIT manually. A parity test mirroring
  `roleToScopeParity.test.ts` would catch the next one before it lands.
- **`system:*` SA scopes do not drift.** They delegate to
  `applyOrganizationMemberStaticAbilities[role]` directly, so any change
  to a human role's CASL flows through automatically. New SA tokens should
  prefer `system:*` over the legacy `org:*` scopes for this reason.
- **Long-term direction**: deprecate the legacy `org:*` SA scopes once
  outstanding tokens are migrated to `system:*` equivalents. Then the
  hand-coded `applyServiceAccountAbilities` handlers for `ORG_*` can be
  deleted and `*MemberAbility.ts` becomes the single source of truth for
  every principal.

## Code references

| Area | File |
|---|---|
| Token mint, validation, save transaction | `packages/backend/src/ee/models/ServiceAccountModel.ts` |
| Service / controller | `packages/backend/src/ee/services/ServiceAccountService/`, `packages/backend/src/ee/controllers/serviceAccountsController.ts` |
| Auth middleware | `packages/backend/src/ee/authentication/middlewares.ts` (`authenticateServiceAccount`, `isScimAuthenticated`) |
| CASL — legacy + system aliases | `packages/common/src/authorization/serviceAccountAbility.ts` |
| Scope vocabulary | `packages/common/src/authorization/scopes.ts` |
| Frontend modal | `packages/frontend/src/ee/features/serviceAccounts/ServiceAccountsCreateModal.tsx` |
| API tests | `packages/api-tests/tests/serviceAccounts.test.ts` |
