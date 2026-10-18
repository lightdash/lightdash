# QA: chart pages, folded SQL charts and composer charts

## Scope

A **pipeline chart** is a saved chart (`saved_queries`) whose version has a row
in `saved_queries_version_pipelines`: the nodes that build its result, the
terminal node and the terminal columns. Two kinds exist:

- **Folded SQL charts**: every saved SQL chart was copied into
  `saved_queries` under the same uuid by migration
  `20261018150000_fold_saved_sql_into_saved_queries.ts`. A chart that
  aggregated in the chart got a second, aggregating node (`aggregated`). The
  copy holds the latest version only, as pipeline schema version 0, converted
  when read.
- **Composer charts**: saved from an AI agent's composer result (phase 2).

A pipeline chart has no explore behind it: its `tableName` is the terminal node
id (`sql`, `aggregated` or a composer node id) and its fields are
`<node>_<column>`. It renders on its own page
(`packages/frontend/src/features/savedPipeline/`), inside the explorer store,
with the actions menu in `SavedPipelineChartActions.tsx`.

The `saved_sql*` tables are still there and are still read by several paths
(listed under predicted defects).

## Setup

- Seeded manifest on an upgraded rig.
- For composer charts: EE licence, AI key, `multi-source-query` flag; save one
  composer result as a chart from an agent thread (see
  [08](08-ai-agents-mcp-slack.md)).
- Soft delete on (`SOFT_DELETE_ENABLED=true`) for trash tests.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-CHRT-U01 | `verify-upgrade.mjs` (read-only) | Every "sql chart …" check passes: reads as a saved chart with a pipeline, same name, space and slug, same numbers as the old release |
| QA-CHRT-U02 | Open every seeded chart's page in the UI | Draws as on the old release (see QA-SQLR-U05 for known losses); the Queries strip under the chart shows 1 step (SQL) or 2 steps (SQL, aggregate) |
| QA-CHRT-U03 | Chart page actions menu on a folded chart: add to dashboard, duplicate, pin, scheduled deliveries, Google Sheets sync, request review, promote, share, delete | Every action opens and completes; duplicate creates a pipeline chart that runs |
| QA-CHRT-U04 | History of `bar_sum` (it had 2 versions on the old release) | Shows one version: the migration copies only the latest. Record it; decide whether pre-upgrade history matters |
| QA-CHRT-U05 | `slug_collision`: open `/saved/<old slug>` and `/saved/<old slug>-sql-<uuid8>` | The old slug opens the explore chart; the suffixed slug opens the SQL chart |
| QA-CHRT-U06 | Trash: find `trashed`, restore it | Listed once in the trash; restore brings it back as a pipeline chart that runs |
| QA-CHRT-U07 | Spaces page, homepage (most popular, recently updated, verified), search for the seed run id | Each seeded chart appears exactly once, with its current name |
| QA-CHRT-U08 | Views: note the view count before the upgrade, open the chart, check again | Count continues from the pre-upgrade value |
| QA-CHRT-U09 | Favourite and verify a folded chart; pin it to the homepage | All work as for an explore chart |
| QA-CHRT-U10 | Share (direct access) a folded chart that had direct grants on the old release | The grants are still there (copied by the migration) and the grantee can open it |
| QA-CHRT-U11 | Content review request opened on a SQL chart before the upgrade | Still visible and actionable after the upgrade |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-CHRT-N01 | Composer chart page | Chart plus the pipeline panel with each node's SQL or code; Edit chart opens edit mode (config panel under the chart); Save changes writes a version |
| QA-CHRT-N02 | Edit mode on a folded aggregated chart: change chart type, colours, pivot | Saves a version; dashboards update; no "Explore does not exist" toast |
| QA-CHRT-N03 | Edit mode: change to a type the legacy SQL API cannot express (funnel, treemap) and save | Chart page and dashboards draw it. Then call the deprecated `GET sqlRunner/saved/{uuid}`: record the response (see P07) |
| QA-CHRT-N04 | Download from the chart page (CSV, Excel, image) | Downloads exist and match the chart (see P03) |
| QA-CHRT-N05 | Duplicate, move to another space, delete, restore, permanently delete a pipeline chart | Each works and the chart disappears or reappears everywhere it is listed |
| QA-CHRT-N06 | A viewer without explore access opens a folded SQL chart | Opens: SQL nodes run under the chart's view permission, like saved SQL charts did |
| QA-CHRT-N07 | A viewer opens a composer chart with a semantic node over an explore they cannot access | Refused for that node, with a clear error |
| QA-CHRT-N08 | Rollback a pipeline chart to an earlier version | Pipeline and config of that version come back |
| QA-CHRT-N09 | Chart page with a broken statement (edit the SQL to reference a missing column) | Clear error state on the page and on dashboard tiles |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-CHRT-C01 | Previous release tab on a space page lists SQL charts and opens one | Opens through the old SQL chart route, which redirects to the chart page after refresh; no crash |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-CHRT-P01 | Homepage most popular and recently updated, the verified homepage, the project chart list and the space delete impact still union SQL charts read from `saved_sql`, so every folded chart shows twice, with its pre-upgrade name, including charts deleted after the upgrade **Confirmed on the rig (2026-10-18):** the homepage most popular and recently updated list held 9 duplicates of 19 seeded entries. | `models/SpaceModel.ts` `getSpaceSqlCharts`, used at `ProjectService.ts` (`getCharts`, most popular, verified homepage) and `SpaceService.ts` |
| QA-CHRT-P02 | Recursive space chart counts double-count folded charts | `SpaceContentConfiguration.ts`, `DashboardContentConfiguration.ts` |
| QA-CHRT-P03 | The pipeline chart page has no download menu (CSV, Excel, image). The old SQL chart page had one | `features/savedPipeline/SavedPipelineChartPage.tsx`, `SavedPipelineChartActions.tsx` |
| QA-CHRT-P04 | Column totals, drill into underlying data, "Explore from here" and view SQL are not offered or are refused for pipeline charts | `AsyncQueryService.ts` totals guard; `DashboardChartTile.tsx` |
| QA-CHRT-P05 | Content reviews of type `SQL_CHART` read the stale `saved_sql` row, and deleting the chart does not cancel them | `ContentReviewRequestModel.ts`; `SavedChartModel.ts` (cancels `CHART` reviews only) |
| QA-CHRT-P06 | Restoring a chart that was deleted before the upgrade leaves its `saved_sql` row deleted, so dashboards that still hold a legacy SQL tile for it lose the tile's name and slug | `SavedSqlModel.restore` touches `saved_queries` only; `DashboardModel` legacy tile join |
| QA-CHRT-P07 | Any chart the legacy converter cannot express (composer pipelines, funnel, treemap, gauge, sankey, map) returns "Saved sql not found" from every path that still reads it as a SQL chart: the deprecated endpoints, Google Sheets syncs of SQL charts, Slack unfurl of `/sql-runner/` links, agent `read_content` with type `sql_chart` | `SavedSqlModel.toSqlChart`, `convertPipelineChartToSqlChart` |
| QA-CHRT-P08 | The deprecated SQL chart API reports `views: 0` for folded charts | `SavedSqlModel.ts` |

## Evidence

For U02 and N01 to N04: screenshots. For P01 and P02: the API response of
`GET /api/v1/projects/:p/most-popular-and-recently-updated` and the space page
counts. For each confirmed defect: the request and response.
