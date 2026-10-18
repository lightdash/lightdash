# QA: SQL runner

## Scope

The SQL runner page (`/projects/:p/sql-runner`, `/sql-runner/:slug/edit`).
Phase 4 replaced its chart stack: the Chart tab is the explorer's chart and
config panel over the statement's columns (`sql_<column>` field ids), the
per-series aggregation is gone, and saving creates a saved chart whose
pipeline is the statement as one SQL node. Code:
`packages/frontend/src/features/sqlRunner/` (see its `CLAUDE.md`), saving in
`viz/sqlRunnerSavedChart.ts`, the common converter in
`packages/common/src/types/sqlChartPipeline.ts`.

What did not change: running a statement, the results table, tables sidebar,
virtual views, write back to dbt, multi-connection routing.

## Setup

- Base instance, the seeded manifest (see [README](README.md)).
- A user with `manage:SqlRunner` and a user without it (viewer, interactive
  viewer).
- For multi-connection cases, a project with two warehouse connections.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-SQLR-U01 | Open each seeded SQL chart's old address `/projects/:p/sql-runner/:slug` | Redirects to the chart page `/saved/:uuid/view` and keeps any query string |
| QA-SQLR-U02 | On the chart page of `table_styled`, `table_no_columns` (one SQL node), press Edit chart | Opens `/sql-runner/:slug/edit` with the statement, limit and connection; Chart tab shows the same table |
| QA-SQLR-U03 | Same on `bar_sum`, `pie_sum`, `line_count`, `big_number` (folded with an aggregating node) | The SQL runner refuses with "This chart is not a SQL runner chart" and offers Open chart. The statement cannot be edited any more. Record this: every SQL chart that aggregated in the chart (most bar, line, pie and big number charts) loses SQL editing after the upgrade |
| QA-SQLR-U04 | Open the seeded old share link (`manifest.shares[0].url`) | The SQL runner opens with the statement, runs it, and the Chart tab draws a bar chart converted from the old config. No error toast |
| QA-SQLR-U05 | For each seeded chart, compare the chart page with the screenshot taken on the old release **Confirmed on the rig (2026-10-18):** the folded configs on the rig carry none of the listed settings (`bar_sum` lost `format: usd`, `bar_grouped_stacked` lost `dateFormat`, `table_styled` lost `barConfig` and column order). Same numbers. | Same numbers. Known losses to record, not fail: y-axis number format (`usd`), x-axis date format, 100% stacking becomes normal stacking, big number conditional formatting, table bar colour and range. Anything else that differs is a defect |
| QA-SQLR-U06 | `bar_sort_by_y` (fails on the old release with "column amount does not exist") | Record what the new release does: it should run, sorted by the summed amount |
| QA-SQLR-U07 | An old browser tab opened on the SQL runner before the upgrade: save a new chart from it after the upgrade | Saves through the deprecated `POST sqlRunner/saved` adapter and appears as a saved chart. Response has `Deprecation` and `Sunset` headers |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-SQLR-N01 | Run `SELECT status, COUNT(*) AS orders, SUM(amount) AS amount FROM jaffle.orders GROUP BY 1` | Results pane shows 5 rows with column types. Ctrl+Enter runs (close the editor's suggestion box first; with it open Ctrl+Enter accepts the suggestion) |
| QA-SQLR-N02 | Chart tab: switch bar, line, area, scatter, pie, funnel, table, big number, treemap, gauge, sankey | Each draws or shows the type's own empty state. Custom, data app and mixed types are not offered |
| QA-SQLR-N03 | Bar chart, group by `status` over a monthly statement | Re-runs the statement pivoted on the warehouse; one series per status |
| QA-SQLR-N04 | Config panel: axes, series colours, labels, legend, reference lines, conditional formatting on a table, number formats | All apply and persist through save |
| QA-SQLR-N05 | Save chart (from Chart tab), choose a space | Lands on the chart page with the same drawing; chart appears in the space, search and the homepage once |
| QA-SQLR-N06 | Save from the SQL tab | Saves a table chart |
| QA-SQLR-N07 | Edit chart, change the statement and config, Save | New chart version; history shows two versions; dashboards using it update |
| QA-SQLR-N08 | Rename, change description and move space from the SQL runner header | Applied to the saved chart |
| QA-SQLR-N09 | Delete from the SQL runner header | Chart goes to trash (soft delete on) and disappears from spaces |
| QA-SQLR-N10 | Share link from the new release, open in another browser | Same statement and chart |
| QA-SQLR-N11 | Chart tab download menu: image, CSV, pivoted CSV when grouped; SQL tab results download | Files match what is on screen |
| QA-SQLR-N12 | User without `manage:SqlRunner` | Cannot open the SQL runner; can view saved SQL charts on the chart page and dashboards |
| QA-SQLR-N13 | Multi-connection project: run on the second connection, save, reopen | Saved chart runs on the second connection; Edit chart reopens bound to it |
| QA-SQLR-N14 | Virtual view: create, edit, write back to dbt | Unchanged from the previous release |
| QA-SQLR-N15 | Parameters in SQL (`${lightdash.parameters.x}`) | Run, save and the saved chart honour parameter values |
| QA-SQLR-N16 | Statement returning 0 rows; statement returning 10,000 rows | Chart shows the empty state; limit is applied; no page freeze |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-SQLR-C01 | Previous release UI tab (not refreshed) opens a saved SQL chart | Reads through the deprecated `GET sqlRunner/saved/{uuid}` adapter; config rebuilt from the explorer config (lossy, see U05) |
| QA-SQLR-C02 | Previous release UI tab edits and saves an existing SQL chart | Adapter `PATCH` writes a new saved chart version. Reopen in the new UI: the change is there |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-SQLR-P01 | Aggregated charts saved before the upgrade can never have their SQL edited again in the SQL runner, only recreated (by design in phase 4, but customer-visible for most legacy SQL charts) | `pages/SqlRunner.tsx` (non-SQL-runner pipeline branch), `getPipelineSqlChartSource` |
| QA-SQLR-P02 | The legacy config loses y-axis formats, x-axis date formats, percent stacking, big number conditional formatting and table bar settings on conversion **Confirmed on the rig (2026-10-18):** every folded chart with display settings round-trips lossy through the deprecated API. | `packages/common/src/types/sqlChartPipeline.ts` `convertSqlChartToPipelineChart` |
| QA-SQLR-P03 | A colliding slug was suffixed `-sql-<8 chars>` by the migration, so the old `/sql-runner/<slug>` address now opens the other chart that holds the slug **Confirmed on the rig (2026-10-18):** the old slug of the colliding chart resolves to the explore chart. | migration `20261018150000_fold_saved_sql_into_saved_queries.ts`, `pages/ViewSqlChart.tsx` |

## Evidence

Screenshots of the Chart tab and the saved chart page for N02 to N05, and
before and after screenshots for every upgrade test. For U05 list each setting
that changed per chart.
