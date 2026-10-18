# QA: data apps

## Scope

Data apps code (`packages/backend/src/ee/services/AppGenerateService/`,
`packages/frontend/src/features/apps/`) did not change on the branch. Its
inputs did:

- Charts attached to an app prompt or read from a dashboard now include folded
  SQL charts and composer charts as ordinary charts. Before, dashboard SQL tiles
  were excluded from dashboard attach.
- Those charts have no explore: chart references use
  `exploreName: chart.tableName` (`sql`, `aggregated` or a node id), and sample
  data comes from a chart query that looks the explore up.
- Apps that call `@lightdash/query-sdk` `savedChart(uuid)` on a folded chart now
  get rows (they used to get 404), keyed by `<node>_<column>`.

## Setup

EE licence, data apps enabled, the app generation sandbox configured, the
seeded dashboard and charts on an upgraded rig.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-APPS-U01 | Generate a data app from the seeded dashboard (former SQL tiles) | The app includes the former SQL charts; sample data loads for them (see P01) |
| QA-APPS-U02 | Data app built on the old release that reads an explore chart; reopen it after the upgrade | Unchanged |
| QA-APPS-U03 | Data app built on the old release that embeds or links a dashboard with SQL tiles | Tiles draw (shares the embed predictions in [07](07-embed-and-sdks.md)) |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-APPS-N01 | Attach a folded SQL chart as a resource in the app prompt; generate in inline mode | Generated code queries something that exists and runs (see P02) |
| QA-APPS-N02 | Same in linked mode (`savedChart(uuid)`) | Runs; rows keyed by `<node>_<column>` |
| QA-APPS-N03 | Attach a composer chart; generate | Same as N01 and N02 |
| QA-APPS-N04 | Data app visualization (`DATA_APP_VIZ`) on a dashboard holding pipeline tiles | Unaffected; the SQL runner chart picker does not offer `DATA_APP_VIZ` |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-APPS-P01 | Sample data for pipeline charts is "unavailable": it runs the chart's view query, which looks up explore `tableName` | `AppGenerateService.ts` sample data; `ProjectService.runViewChartQuery` |
| QA-APPS-P02 | Inline mode writes semantic queries against explore `sql` or the node id, which does not exist, so the generated app fails at run time; linked mode works | `AppGenerateService.ts` chart references (`exploreName: chart.tableName`) |

## Evidence

Generated app code excerpts for the chart queries, the app's runtime errors,
screenshots.
