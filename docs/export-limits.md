# Organization-level Limits

This document describes the per-organization **Limits** settings (PROD-7214): the max rows a query/export
may return and the max cells a CSV/Excel export may contain, moved from instance-wide env vars to org-level
overrides.

---

## Overview

Two instance-wide env vars used to be the only control over export size:

| Env var | Config path | Default | What it limits |
|---|---|---|---|
| `LIGHTDASH_QUERY_MAX_LIMIT` | `lightdashConfig.query.maxLimit` | 5000 (Cloud: 100000) | Max **rows** a query/export can return |
| `LIGHTDASH_CSV_CELLS_LIMIT` | `lightdashConfig.query.csvCellsLimit` | 100000 | Max **cells** (rows × columns) a CSV/Excel export can contain |

On shared multi-tenant Cloud infra each org needs its own policy (a customer with a 100k-row × 86-column query
needs ~8.6M cells, while others should stay capped). The **Limits** panel lets an admin override both
per-org, stored in `organization_settings`. The env vars become the fallback defaults, so nothing changes for
orgs that don't override.

This reuses the same `organization_settings` infrastructure as the scheduled-delivery settings
(see [exporting.md](./exporting.md)): typed columns, a tri-state resolver (`null` = inherit env), and the
`GET`/`PATCH /api/v1/org/settings` API.

---

## What an admin configures

| Setting | Stored column | API field | Meaning |
|---|---|---|---|
| **Maximum query rows** | `query_max_limit` | `queryMaxLimit` | Overrides `LIGHTDASH_QUERY_MAX_LIMIT`. `null` ⇒ inherit. |
| **Maximum CSV/Excel cells** | `csv_cells_limit` | `csvCellsLimit` | Overrides `LIGHTDASH_CSV_CELLS_LIMIT`. `null` ⇒ inherit. Capped at {@link MAX_CSV_CELLS_LIMIT} = 50,000,000. |

Both are surfaced **resolved** in the API (always an effective number, falling back to the env default) so the
frontend can display them directly. Validation (`OrganizationSettingsService`): each must be a **positive
integer**; `csvCellsLimit` additionally cannot exceed **50,000,000** (the highest value any Cloud customer sets
today — a sane ceiling that still allows wide exports without inviting OOM-scale requests). There is no max on
`queryMaxLimit`.

---

## Enforcement

`organization_settings` overrides are read at query/export time via a single helper:

```ts
// services/OrganizationSettingsService/resolveExportLimits.ts
resolveOrganizationExportLimits(organizationSettingsModel, lightdashConfig.query, organizationUuid)
//   → { maxLimit: queryMaxLimit ?? env, csvCellsLimit: csvCellsLimit ?? env }
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

`organizationUuid` is already available at every enforcement site (from the project/chart/dashboard/account in
scope). Backwards-compatible: with no override (`queryMaxLimit`/`csvCellsLimit` null) the helper returns the env
default, so behavior is identical to before.

> **Not made org-aware:** `HealthService` (instance status) and `EmailClient` (decorative "max cells" messaging)
> still read the instance config. The in-app explorer's row-limit input max also still comes from `/health`
> (instance default) — the server enforces the org limit regardless; surfacing the org max in that UI hint is a
> possible follow-up.

---

## Access — the `pro-limits` feature flag

Unlike the scheduled-delivery Exporting panel, the **Limits** panel is gated behind the
`FeatureFlags.ProLimits` (`pro-limits`) feature flag — it's a Pro capability, so only enable the panel for orgs
that should configure it. Enable it via `LIGHTDASH_ENABLE_FEATURE_FLAGS=pro-limits` (self-hosted escape hatch),
a `feature_flags` row, or a per-org `feature_flag_overrides` row.

The flag only gates **panel visibility/configuration**. Backend enforcement of any stored override is always on
(it can't leak to ungated orgs, since an override only exists if it was written through the flag-gated UI/API).

---

## Key code paths

| Concern | Location |
|---|---|
| Setting types + resolver | `packages/common/src/types/organizationSettings.ts` (`queryMaxLimit`, `csvCellsLimit`, `MAX_CSV_CELLS_LIMIT`) |
| Feature flag | `packages/common/src/types/featureFlags.ts` (`ProLimits = 'pro-limits'`) |
| DB column + entity | migration `..._add_export_limits_to_organization_settings.ts`, `entities/organizationSettings.ts` |
| Model + service validation | `OrganizationSettingsModel.ts`, `OrganizationSettingsService.ts` |
| Limit resolution helper | `services/OrganizationSettingsService/resolveExportLimits.ts` |
| Frontend panel | `packages/frontend/src/components/UserSettings/LimitsPanel/`, gated route/nav in `pages/Settings.tsx` |
