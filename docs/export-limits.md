# Organization-level Limits

This document describes the per-organization **Limits** settings (PROD-7214): the max rows a query may
return and the max cells a CSV/Excel export may contain, moved from instance-wide env vars to org-level
overrides.

---

## Overview

Instance-wide env vars used to be the only control over query/export size:

| Env var | Config path | Default | What it limits |
|---|---|---|---|
| `LIGHTDASH_QUERY_MAX_LIMIT` | `lightdashConfig.query.maxLimit` | 5000 (Cloud: 100000) | Max **rows** a query may return — and the **ceiling** for the per-org query limit |
| `LIGHTDASH_CSV_CELLS_LIMIT` | `lightdashConfig.query.csvCellsLimit` | 100000 | Default max **cells** (rows × columns) a CSV/Excel export may contain |
| `LIGHTDASH_CSV_MAX_LIMIT` | `lightdashConfig.query.csvMaxLimit` | 5000000 | **Ceiling** an org admin may raise the per-org CSV cells limit to |

On shared multi-tenant Cloud infra each org needs its own policy (a customer with a 100k-row × 86-column query
needs ~8.6M cells, while others should stay capped). The **Limits** panel lets an admin override both
per-org, stored in `organization_settings`. The env vars become the fallback defaults, so nothing changes for
orgs that don't override.

This reuses the same `organization_settings` infrastructure as the scheduled-delivery settings
(see [exporting.md](./exporting.md)): typed columns, a tri-state resolver (`null` = inherit env), and the
`GET`/`PATCH /api/v1/org/settings` API.

The two limits are **independent** — the query-row limit never affects CSV exports and vice versa, exactly as
the two env vars always behaved.

---

## What an admin configures

| Setting | Stored column | API field | Meaning |
|---|---|---|---|
| **Maximum query rows** | `query_limit` | `queryLimit` | Overrides `LIGHTDASH_QUERY_MAX_LIMIT`. `null` ⇒ inherit. Capped at the env value. |
| **Maximum CSV/Excel cells** | `csv_cells_limit` | `csvCellsLimit` | Overrides `LIGHTDASH_CSV_CELLS_LIMIT`. `null` ⇒ inherit. Capped (see below). |

Both are surfaced **resolved** in the API (always an effective number, falling back to the env default) so the
frontend can display them directly. Validation (`OrganizationSettingsService`): each must be a **positive
integer** no larger than the Postgres `integer` column ceiling; `queryLimit` additionally cannot exceed
`LIGHTDASH_QUERY_MAX_LIMIT`, and `csvCellsLimit` cannot exceed the **effective cap =
`max(LIGHTDASH_CSV_MAX_LIMIT, LIGHTDASH_CSV_CELLS_LIMIT)`** (default 5,000,000).

### Why `max(CSV_MAX_LIMIT, CSV_CELLS_LIMIT)` and not just `CSV_MAX_LIMIT`?

Several Cloud customers already set `LIGHTDASH_CSV_CELLS_LIMIT` above the 5M default (up to 50M). If the cap
were a plain 5M, their **panel would reject its own inherited value** (the effective limit shown, e.g. 50M,
exceeds 5M → every Save fails). Taking the max with the instance default guarantees the cap is never below what
the instance already runs, so no existing instance is forced below its own limit, while new instances get a
clean 5M ceiling. The ceiling is exposed to the panel via `/health` (`query.csvMaxLimit`), and the
query-rows ceiling via `query.queryMaxLimit`, so the panel's input bounds and helper text match the backend.

---

## Enforcement

### Org-aware `/health` (the explorer / SQL runner)

`/health` is the source the frontend uses to bound the explorer's row-limit selector and the new-query default.
`HealthService.getHealthState(user)` resolves the **effective** limits for the requesting user's org (override
⇒ else env default) and exposes them so the per-org limit takes effect in the UI — _regardless of the env
value_:

| `health.query` field | Value | Used by |
|---|---|---|
| `maxLimit` | effective query limit (`queryLimit ?? LIGHTDASH_QUERY_MAX_LIMIT`) | explorer / SQL-runner row-limit selector max |
| `defaultLimit` | `min(LIGHTDASH_QUERY_DEFAULT_LIMIT, effective maxLimit)` | new-query default (so it's never above the org limit) |
| `csvCellsLimit` | effective CSV cells (`csvCellsLimit ?? LIGHTDASH_CSV_CELLS_LIMIT`) | export "limited to N cells" messaging |
| `queryMaxLimit` | instance ceiling (`LIGHTDASH_QUERY_MAX_LIMIT`) | admin panel "Up to" hint |
| `csvMaxLimit` | instance ceiling (`max(CSV_CELLS_MAX_LIMIT, CSV_CELLS_LIMIT)`) | admin panel "Up to" hint |

Unauthenticated callers (the login page) have no org, so they see the instance defaults — unchanged behavior.

This is a **UI clamp**, not a query-execution change: the explorer's "Run query" selector can't request more
than the org limit, and CSV exports (which set their own `csvLimit` and bypass the selector) stay independent.

### Backend limit resolution (CSV/Excel exports, SQL runner, field search)

`organization_settings` overrides are read at query/export time via a single helper:

```ts
// services/OrganizationSettingsService/resolveExportLimits.ts
resolveOrganizationExportLimits(organizationSettingsModel, lightdashConfig.query, organizationUuid)
//   → { maxLimit: queryLimit ?? env, csvCellsLimit: csvCellsLimit ?? env }
```

`OrganizationSettingsModel` is injected into the services that enforce limits, and the resolved values replace
the previous `lightdashConfig.query.{maxLimit,csvCellsLimit}` reads at these sites:

| Service | Sites |
|---|---|
| `ProjectService` | `runMetricQuery` (CSV via `applyMetricQueryLimit`), `runSqlQuery` (max rows), field-values metric query |
| `AsyncQueryService` | saved-chart / dashboard-chart / underlying-data CSV exports, field-value search, XLSX pivot |
| `PivotTableService` | `downloadAsyncPivotTableCsv` (cell limit + truncation check) |
| `CsvService` | gsheets-delivery truncation check (limit supplied by `SchedulerTask` from the org) |
| `ExcelService` | static class — receives the resolved `csvCellsLimit` as a parameter from `AsyncQueryService` |
| `HealthService` | effective query / CSV limits exposed to the frontend (see above) |

`organizationUuid` is already available at every enforcement site (from the project/chart/dashboard/account in
scope). Backwards-compatible: with no override (`queryLimit`/`csvCellsLimit` null) the helper returns the env
default, so behavior is identical to before.

---

## Access — the `pro-limits` feature flag

Unlike the scheduled-delivery Exporting panel, the **Limits** panel is gated behind the
`FeatureFlags.ProLimits` (`pro-limits`) feature flag — it's a Pro capability, so only enable the panel for orgs
that should configure it. Enable it via `LIGHTDASH_ENABLE_FEATURE_FLAGS=pro-limits` (self-hosted escape hatch),
a `feature_flags` row, or a per-org `feature_flag_overrides` row.

The flag only gates **panel visibility/configuration**. Resolution of any stored override is always on (it
can't leak to ungated orgs, since an override only exists if it was written through the flag-gated UI/API).

---

## Key code paths

| Concern | Location |
|---|---|
| Setting types + resolver | `packages/common/src/types/organizationSettings.ts` (`queryLimit`, `csvCellsLimit`) |
| CSV cap config | `parseConfig.ts` (`query.csvMaxLimit` from `LIGHTDASH_CSV_MAX_LIMIT`) |
| Org-aware health | `HealthService.ts` (`query.maxLimit` / `defaultLimit` / `csvCellsLimit` effective; `queryMaxLimit` / `csvMaxLimit` ceilings) |
| Feature flag | `packages/common/src/types/featureFlags.ts` (`ProLimits = 'pro-limits'`) |
| DB column + entity | migration `..._add_export_limits_to_organization_settings.ts`, `entities/organizationSettings.ts` |
| Model + service validation | `OrganizationSettingsModel.ts`, `OrganizationSettingsService.ts` |
| Limit resolution helper | `services/OrganizationSettingsService/resolveExportLimits.ts` |
| Frontend panel | `packages/frontend/src/components/UserSettings/LimitsPanel/`, gated route/nav in `pages/Settings.tsx` |
