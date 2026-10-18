# QA: embedding and SDKs

## Scope

- **Iframe embed** and the **React SDK** (`@lightdash/sdk`,
  `packages/frontend/sdk`) render dashboards and charts with the frontend's own
  components. The SDK bundles them (only React is external), so a customer app
  pinned to an SDK version keeps that version's tile components.
- Phase 3 returns legacy SQL tiles as chart tiles. Pipeline tiles run through
  the embed dashboard tile query and build their fields locally.
- The old embed SQL tile endpoints remain:
  `GET /api/v1/embed/{p}/sql-chart-tile/{tileUuid}`,
  `POST /api/v1/embed/{p}/query/dashboard-sql-chart`.
- **`@lightdash/query-sdk`**: no change on the branch; `savedChart(uuid)` posts
  to v2 `/query/chart`, which now runs pipeline charts.
- **`@lightdash/visualization`**: no change on the branch; the backend now
  depends on it (Slack and MCP images).
- Translations (`contentOverrides`) are keyed by chart slug.

## Setup

- EE licence (embedding), embed secret, `EMBEDDING_ENABLED`, allowed domains
  (`LIGHTDASH_IFRAME_EMBEDDING_DOMAINS` for the iframe app).
- Test apps in the repo:
  - `packages/sdk-test-app`: `pnpm sdk-build`, then
    `pnpm -F @lightdash/sdk-test-app dev` (port 3002). Tokens:
    `pnpm -F @lightdash/sdk-test-app generate-embed-token` with `DASHBOARD_UUID`,
    `CHART_UUID`, `LIGHTDASH_SECRET`, `SITE_URL`; app env `VITE_EMBED_URL`,
    `VITE_CHART_EMBED_URL`.
  - `packages/sdk-next-test-app`: `next dev --port 9898` with
    `NEXT_PUBLIC_LIGHTDASH_EMBED_URL`.
  - `packages/iframe-test-app`: `pnpm dev` (port 5173).
  - Old SDK: in a copy of `sdk-test-app`, replace `workspace:*` with
    `@lightdash/sdk@2.603.0` from npm.
- Embed config on the project: the seeded dashboard, and the seeded charts in
  `chartUuids` (or `allowAllCharts`).
- Do not re-save the seeded dashboard before the upgrade tests: several
  predictions depend on its tiles still being stored as SQL tiles.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-EMBD-U01 | Embed the seeded dashboard (not re-saved since the upgrade) in the iframe test app | Every tile draws with the same numbers as in the app (see P01) |
| QA-EMBD-U02 | Same dashboard through the new SDK `Dashboard` | Same as U01 |
| QA-EMBD-U03 | Re-save the dashboard in the app, repeat U01 and U02 | Draws |
| QA-EMBD-U04 | Embedded dashboard filters: open the filter bar | Lists the explore chart's fields and the pipeline tiles' fields (see P02) |
| QA-EMBD-U05 | SDK `Dashboard` with the `filters` prop and filter value autocomplete | Values load (see P03) |
| QA-EMBD-U06 | `contentOverrides` keyed by the slug of `slug_collision`, both the old and the suffixed slug | Only the suffixed slug matches; record it (it is a key change for customers) |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-EMBD-N01 | SDK `Chart` with `CHART_UUID` = a folded SQL chart (uuid, slug, and the suffixed slug) in the embed config's charts | Renders through the pipeline chart component. Without it in the config: 403 |
| QA-EMBD-N02 | Embedded dashboard with a composer chart tile | Draws |
| QA-EMBD-N03 | Date zoom on an embedded dashboard with a pipeline time series | Pipeline tile unchanged (same as in the app) |
| QA-EMBD-N04 | CSV export of a pipeline tile in an embed; totals and subtotals on a pipeline table tile | CSV works; totals are hidden or fail cleanly |
| QA-EMBD-N05 | `@lightdash/query-sdk` `savedChart(<folded uuid>)` with `.limit()` and `.filters()` | Rows come back keyed `sql_<column>` / `aggregated_<column>`; limit applies; record whether filters apply (see P05) |
| QA-EMBD-N06 | `@lightdash/visualization` consumers (SDK, desktop): `pnpm -F visualization test:regression` | No differences (package unchanged) |
| QA-EMBD-N07 | Embed with `uiOverrides` on a dashboard holding pipeline tiles | Overrides apply to their menus and filter bar |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-EMBD-C01 | `@lightdash/sdk@2.603.0` `Dashboard` on the upgraded instance | Record it. Expected by the code: former SQL tiles come back as chart tiles; the old component requests explore `sql` (`GET /explores/sql`, 404) and the tile shows an explore error. Customers must upgrade the SDK |
| QA-EMBD-C02 | `@lightdash/sdk@2.603.0` `Chart` on a folded chart | Same explore error |
| QA-EMBD-C03 | Direct call `GET /api/v1/embed/{p}/sql-chart-tile/{tileUuid}` for a seeded tile | 400 "not a SQL chart tile": the endpoint is dead because tiles never come back as SQL tiles |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-EMBD-P01 | Embedded tile queries for legacy SQL tiles return 403 "This chart does not belong to dashboard" until the dashboard is re-saved: the embed permission check looks for the chart in `dashboard_tile_charts` only | `DashboardModel.savedChartExistsInDashboard`, used by `EmbedService` and `PermissionsService.checkEmbedPermissions` |
| QA-EMBD-P02 | Embedded available filters resolve explores by `tableName` and give pipeline tiles no filters (the app path is pipeline-aware, the embed path is not) | `EmbedService.getAvailableFiltersForSavedQueries` |
| QA-EMBD-P03 | SDK filter value search throws `Explore "sql" does not exist` on any dashboard holding a pipeline tile | `EmbedService.searchFilterValues` (`getExploreFromCache(tableName)` without a catch) |
| QA-EMBD-P04 | Embed `chart-and-results`, `calculate-total` and `calculate-subtotals` fail for pipeline charts | `EmbedService` (`getExploreFromCache(tableName)`) |
| QA-EMBD-P05 | Filter overrides (`.filters()`, JWT filters) are not passed to pipeline runs | `AsyncQueryService.executeAsyncSavedChartQuery` |
| QA-EMBD-P06 | Old SDK versions cannot draw pipeline charts at all (see C01): a customer-facing break for anyone embedding a dashboard that had SQL tiles | SDK bundles its components |

## Evidence

Screenshots of each test app; the browser network panel for failing tile
requests (URL, status, body).
