# Organization settings

Per-organization settings let an org admin override instance-wide configuration
for **their** org. They're the mechanism for migrating Lightdash Pro config from
instance-wide environment variables to per-org, admin-configurable settings on
shared multi-tenant infrastructure.

First use: the OIDC account-linking toggles (`AUTH_ENABLE_OIDC_LINKING`,
`AUTH_ENABLE_OIDC_TO_EMAIL_LINKING`). More will follow (CSV/export limits,
scheduled-delivery options, etc.).

## Org settings vs. feature flags

They look similar — both are "per-org override of an instance default" — but
they are **deliberately two different tables/systems**. Don't unify them.

| | Feature flags (`feature_flags` / `feature_flag_overrides`) | Organization settings (`organization_settings`) |
|---|---|---|
| **Purpose** | Roll out / kill-switch a feature during development | Customer-configurable, permanent product config |
| **Lifecycle** | **Temporary** — added, then *graduated* and removed once GA | **Permanent** — lives as long as the feature does |
| **Who sets it** | Engineering / ops (DB overrides inserted via SQL; no admin write API) | Org admins, via the admin panel / API |
| **Value type** | Boolean only | Boolean now; structured values (ints, lists) later |
| **Audience** | Internal | Customer-facing |

There's real overlap (both resolve an org override against an instance
default), but conflating them is confusing: a feature flag is something you
expect to *delete*, an org setting is something you expect to *keep*. When in
doubt: "Is this a temporary rollout switch?" → feature flag. "Is this config a
customer will manage long-term?" → org setting.

## How a setting resolves: DB wins, env is the fallback

Each column in `organization_settings` is **nullable**:

- `NULL` (no row, or a NULL column) → **not set; inherit the instance/env default**
- explicit `true`/`false` → **per-org override that wins over the env** (including an explicit `false` that disables something the env turned on)

Rows are **sparse**: only the columns an admin has actually changed are
written; everything else stays `NULL` and keeps inheriting.

Resolution happens in exactly **one** place — `resolveEffectiveOrganizationSettings`
in `packages/common/src/types/organizationSettings.ts`:

```ts
effective = rawOverride ?? instanceDefault   // per field
```

Critically:

- The **model is env-agnostic** — `OrganizationSettingsModel` returns the *raw*
  `boolean | null` and never reads `lightdashConfig`. Don't put the env fallback
  in the model (it's a data layer, and the setting→env-var mapping is config
  knowledge).
- The **backend returns the already-resolved (effective) value** from the API,
  so the **frontend never resolves anything** — it just displays what `GET`
  returns. This is why backend and frontend can't drift.
- The **login flow uses the same resolver**, so the toggle's displayed state and
  the actual runtime behavior are guaranteed identical.

Do **not** expose the instance env defaults to the frontend (e.g. via `/health`)
just so the UI can resolve — that pushes us back toward the env dependency we're
migrating away from.

## Architecture / where things live

| Layer | File | Responsibility |
|---|---|---|
| Table | `migrations/*_create_organization_settings_table.ts` | nullable columns, 1:1 with `organizations` (org_uuid PK) |
| Entity | `database/entities/organizationSettings.ts` | `DbOrganizationSettings` row type |
| Model | `models/OrganizationSettingsModel.ts` | raw get/update via explicit, exhaustive literals; **env-agnostic** |
| Common type + resolver | `common/src/types/organizationSettings.ts` | `OrganizationSettings`, `UpdateOrganizationSettings`, `resolveEffectiveOrganizationSettings` |
| Service | `services/OrganizationSettingsService/OrganizationSettingsService.ts` | `manage Organization` check; returns **effective** values |
| Controller | `controllers/organizationSettingsController.ts` | `GET` / `PATCH /api/v1/org/settings` (non-EE, no uuid in path — org from session) |
| Consumers | e.g. `UserService` (login gates) | read effective via the shared resolver |
| Frontend | `hooks/organization/useOrganizationSettings.ts`, `components/UserSettings/OrganizationSso/AccountLinkingPanel.tsx` | display + toggle |

The model uses plain explicit literals (like the rest of the codebase), but
typed so the compiler enforces completeness:

- `get` returns the full `OrganizationSettings` shape, so adding a field to the
  type makes `get` fail to compile until you read the new column.
- `update` builds a `SettingsColumnPatch` literal — a mapped type over **all**
  settings columns — so it also fails to compile until you map the new column.
  Undefined entries are stripped, so omitted settings keep their stored value.

So you can't silently forget to wire a new setting through the model — TS points
at the exact spot.

## Quick guide — adding a new org setting

Say you're adding `csvCellsLimit` (migrating `RESULTS_S3_BUCKET`-style env config).

1. **Migration** — add a nullable column to `organization_settings`:
   ```ts
   table.integer('csv_cells_limit').nullable();
   ```
2. **Entity** (`organizationSettings.ts`) — add `csv_cells_limit` to
   `DbOrganizationSettings` and the insert/update `Pick` types.
3. **Common type** (`common/src/types/organizationSettings.ts`):
   - add `csvCellsLimit: number | null` to `OrganizationSettings`,
   - resolve it in `resolveEffectiveOrganizationSettings` against its instance
     default: `csvCellsLimit: raw.csvCellsLimit ?? instanceDefaults.csvCellsLimit`
     (pass the relevant `lightdashConfig` slice in from the callers).
4. **Model** (`OrganizationSettingsModel.ts`) — add the field to `get`'s
   returned literal (`csvCellsLimit: row?.csv_cells_limit ?? null`) and to
   `update`'s `columns` literal (`csv_cells_limit: patch.csvCellsLimit`). Both
   won't compile until you do — that's the safety net.
5. **Consume it** where the behavior lives, always via the resolver / the
   service's effective value — never re-implement `?? default`.
6. **Frontend** — add the control to the relevant panel, reading/writing through
   `useOrganizationSettings`. The value is already effective; just display it.
7. `pnpm generate-api`, then typecheck + the model/consumer tests.

### Gotchas

- **Don't add the fallback to the model.** Model returns raw `null`; resolution
  is the resolver's job.
- **One resolver only.** Backend returns effective; frontend displays. Never add
  a second resolution path (frontend, another service, `/health`, …).
- **`null` means inherit, not "off".** Read it as "no override".
- **Stale `common` dist.** After editing `common`, the incremental build can
  leave `dist/cjs` behind, surfacing as `X is not a function` at runtime. Force
  it: `pnpm -F common exec tsc --build ./tsconfig.build.json --force`.
