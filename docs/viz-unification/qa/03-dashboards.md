# QA: dashboards

## Scope

- **Legacy SQL tiles.** Tiles stored in `dashboard_tile_sql_charts` are returned
  as chart tiles (`saved_chart`, chart uuid = the old SQL chart uuid) by
  `DashboardModel`. The rows are not migrated: a tile is rewritten as a chart
  tile the next time the dashboard is saved. Until then its name and slug are
  read from the `saved_sql` row.
- **Pipeline chart tiles** load through the ordinary chart tile, run through
  `submitSavedPipelineRun` (`AsyncQueryService.ts`), build their fields locally
  (no explore request) and hide explore-only actions (drill, underlying data,
  explore from here, in-dashboard chart editor).
- **Filters.** A dashboard filter applies to a pipeline tile only when its target
  field id is one of the tile's fields (`<terminal node>_<column>`). Date zoom is
  never applied to pipeline tiles. Available filters for pipeline tiles come
  from the pipeline's columns (phase 4 fix in `ProjectService` and
  `SavedChartModel.getInfoForAvailableFilters`).
- Dashboard load of classic charts is unchanged; numbers in
  [`../migration.md`](../migration.md) Performance.

## Setup

Seeded manifest on an upgraded rig (`manifest.dashboards[0]` has every SQL
chart as a `sql_chart` tile, an explore chart tile, a markdown tile and a filter
on `orders_status`). Before the upgrade, screenshot the dashboard.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-DASH-U01 | `verify-upgrade.mjs`, "dashboard" checks | Former SQL tiles read as chart tiles with the same tile uuid; every tile runs; numbers match the old release's dashboard SQL chart query |
| QA-DASH-U02 | Open the seeded dashboard; compare with the pre-upgrade screenshot | Same tiles, titles (including the custom title on the first tile), layout and numbers. No "Explore does not exist" toast, no tile error |
| QA-DASH-U03 | Tile menus on former SQL tiles: view chart, export CSV and image, duplicate, move to space | Work; explore-only items are hidden |
| QA-DASH-U04 | Edit the dashboard (move a tile), save, reload | Saves; former SQL tiles are now stored as chart tiles (check `dashboard_tile_charts` or a second save); nothing else changes |
| QA-DASH-U05 | Filters: the seeded `orders_status = completed` filter | Applies to the explore chart tile. Record whether it applies to any former SQL tile (on the old release it applied to none: the seed's baseline shows no applied filters) |
| QA-DASH-U06 | Rename `bar_sum` after the upgrade, reopen the dashboard without saving it | Tile shows the new name (see P01) |
| QA-DASH-U07 | Dashboard duplicate, copy to another space, and dashboard as code download of the seeded dashboard | Tiles reference the same charts by the current slug |
| QA-DASH-U08 | Scheduled image delivery of the seeded dashboard, "send now" | Image shows every tile drawn (see [04](04-deliveries-alerts-syncs.md)) |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-DASH-N01 | Add a new SQL runner chart and a composer chart to a new dashboard | Both draw; tile load time about 1 s versus about 0.3 s for an explore chart (expected, see Performance) |
| QA-DASH-N02 | Add a dashboard filter from a pipeline tile's field (the filter picker lists `sql_<column>` fields) | Filter applies to that tile; the tile's filter badge shows it |
| QA-DASH-N03 | Add a semantic (explore) filter to a dashboard with a composer tile | The composer tile shows no applied filters and is not filtered |
| QA-DASH-N04 | Date zoom on a dashboard with a pipeline time-series tile | The pipeline tile does not change; explore tiles do |
| QA-DASH-N05 | Dashboard with 20 tiles, 5 of them pipeline tiles | Loads without errors; classic tiles are not slower than on the previous release |
| QA-DASH-N06 | AI dashboard editing (EE): ask the agent to add a folded SQL chart to a dashboard | Adds it as a chart tile |
| QA-DASH-N07 | Validation page after adding a dashboard filter that targets a pipeline tile | No false "table no longer exists" error |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-DASH-C01 | Previous release browser tab open on the seeded dashboard during the upgrade; refresh tiles without reloading the page | The old tab gets SQL tiles back as chart tiles of an unknown explore and may show an error until reloaded; a reload fixes it. Record what it shows |
| QA-DASH-C02 | Previous release tab saves the dashboard with a `sql_chart` tile in the payload | Stored as a chart tile (`DashboardModel` converts it) |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-DASH-P01 | Legacy tiles take the chart name and slug from `saved_sql`, so after a rename the tile shows the old name until the dashboard is saved; `lastVersionChartKind` is null (tile icon) **Confirmed on the rig (2026-10-18):** the API tile `chartName` keeps the old name after a rename; the dashboard page and the delivered image show the current name. | `DashboardModel.ts` legacy tile read (`COALESCE(saved_queries…, saved_sql…)` joined only through `dashboard_tile_charts`) |
| QA-DASH-P02 | When the chart behind a legacy tile is deleted (or was in the trash before the upgrade), the tile still points at it, and any dashboard save (edit, duplicate, AI edit) fails with "Saved chart not found" **Confirmed on the rig (2026-10-18):** after deleting a tile's chart, saving the dashboard returns 404 "Saved chart not found". | `DashboardModel.ts` `getChartId` on save |
| QA-DASH-P03 | Dashboard filters that targeted SQL tile columns by bare column name on the old release no longer match the tile's field ids and are dropped silently | `AsyncQueryService.ts` pipeline filter mapping vs old `SqlQueryComposer` |
| QA-DASH-P04 | Folded table charts expose every column as a string field in the filter picker (no number or date operators) | `sqlChartPipeline.ts` column typing for charts saved without types |
| QA-DASH-P05 | The dashboard AI context bridge and change planner still look for `savedSqlUuid` tiles, which no longer exist, so agent edits that target SQL tiles see none | `providers/Dashboard/DashboardAiAgentContextBridge.tsx`, `dashboardAiAgentChangePlanner.ts` |

## Evidence

Before and after screenshots of the seeded dashboard; the verifier output; for
P02 the failing save request and response.
