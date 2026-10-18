# QA: API compatibility, rolling update and old clients

## Scope

Every endpoint whose behaviour or shape changed, from the point of view of a
script or integration written against 2.603.0. The release-safety declarations
are `viz-unification-p1-composer-artifact-viz-contract` and
`viz-unification-p3-sql-charts-fold-into-saved-charts` in
`release-safety.declarations.json`.

## Changed endpoints

| Endpoint | Before | After | Kind |
|---|---|---|---|
| `POST /api/v2/projects/{p}/query/sql-chart` | SQL chart result, aggregated and pivoted by the SQL runner config, keyed by column names (`status`, `amount_sum`, `amount_sum_completed`) | Runs the saved chart pipeline; result keyed by field ids (`aggregated_status`, `aggregated_amount_sum`, `sql_amount`); pivoted results in the saved chart pivot shape | Shape change, declared first-party-only |
| `POST /api/v2/projects/{p}/query/dashboard-sql-chart` | Same as above for a dashboard tile | Same as above | Shape change |
| `GET /api/v1/projects/{p}/sqlRunner/saved/{uuid}`, `…/slug/{slug}` | Stored SQL chart | Rebuilt from the saved chart; config is lossy (formats, date formats, percent stacking, big number conditional formatting, table bar settings); `views` 0; agent identity null; "not found" for charts the converter cannot express. `Deprecation` and `Sunset` headers | Adapter, deprecated (sunset 2027-01-18) |
| `POST`, `PATCH`, `DELETE …/sqlRunner/saved…` | Write `saved_sql` | Write saved charts | Adapter, deprecated |
| `POST …/sqlRunner/saved/{uuid}/promote`, `GET …/promoteDiff` | Promote a SQL chart | Promote the saved chart through the adapter | Adapter, deprecated |
| `GET`, `POST …/sqlRunner/saved/{uuid}/schedulers` | SQL chart syncs | Same rows; create fails for charts created after the upgrade (predicted) | Adapter, deprecated |
| `GET /api/v1/saved/{uuid}`, `GET /api/v2/projects/{p}/saved/{uuidOrSlug}` | Explore charts only | Also returns folded SQL charts and composer charts, with `pipeline` | Additive field; new items |
| `POST /api/v1/projects/{p}/saved`, `POST /api/v1/saved/{uuid}/version` | | Accept `pipeline` | Additive |
| `GET /api/v1/dashboards/{uuid}` | Tiles of type `sql_chart` with `savedSqlUuid` | No `sql_chart` tiles: they come back as `saved_chart` with `savedChartUuid` = the old SQL chart uuid | Shape change |
| `PATCH /api/v1/dashboards/{uuid}`, `POST …/dashboards` | `sql_chart` tiles stored as such | Accepted and stored as `saved_chart` tiles | Behaviour change |
| `GET /api/v1/projects/{p}/spaces/{uuid}` | `sqlCharts` lists the space's SQL charts | `sqlCharts` is empty; the charts are in `queries` | Shape change |
| `GET /api/v2/content`, search | SQL charts as their own content type / source | Listed as charts | Shape change |
| `GET /api/v1/projects/{p}/code/sqlCharts` | Every SQL chart | Empty without `ids`; with `ids`, the folded charts the converter can express | Behaviour change |
| `POST /api/v1/projects/{p}/code/sqlCharts/{slug}` | Upserts `saved_sql` | Creates or updates a pipeline chart | Adapter |
| `GET`, `POST /api/v1/projects/{p}/code/charts…` | | `pipeline` block; folded charts appear here | Additive field; new items |
| `GET /api/v1/embed/{p}/sql-chart-tile/{tile}`, `POST /api/v1/embed/{p}/query/dashboard-sql-chart` | Embedded SQL tiles | Always 400 "not a SQL chart tile" (tiles are never SQL tiles now) | Dead |
| `PATCH …/aiAgents/…/versions/{v}/viz-config` | Composer viz update | Removed; replaced by `PATCH …/versions/{v}/viz` (different body) | Breaking, flag-gated, declared |
| `POST …/aiAgents/…/versions/{v}/pivot-query` | | New | Additive |
| Every query results page | | `ResultColumn.provenance.fieldType` | Additive |
| MCP `render_chart` | ECharts option from the Slack builders | Option from `@lightdash/visualization` (dataset based) in `_meta.result.echartsOption`; tool schema unchanged | Output change |

## Tests

| ID | Steps | Expected |
|---|---|---|
| QA-API-U01 | `verify-upgrade.mjs` | Passes; WARN rows are the known lossy points |
| QA-API-U02 | Call `POST /api/v2/projects/{p}/query/sql-chart` with `{ savedSqlUuid }` for each seeded chart and compare the keys with the old release's response (the seed stored the old column names in `baseline.columns`) | Keys change as in the table. Decide whether this public endpoint needs a compatibility mode or a `breaking` declaration: the `firstPartyOnly` claim in the declaration does not hold for a documented public API |
| QA-API-U03 | `GET /api/v1/dashboards/{seeded}`: tile types | No `sql_chart`; each former SQL tile is `saved_chart` |
| QA-API-U04 | `GET /api/v1/projects/{p}/spaces/{seeded space}` | `sqlCharts` empty, SQL charts under `queries` |
| QA-API-U05 | Deprecated endpoints: response headers | `Deprecation`, `Sunset: …2027-01-18…`, `Warning` on every `sqlRunner/saved*` call; a server log warning per call |
| QA-API-N01 | Docs site (after the docs deploy): the deprecated operations | "Deprecated — use …" lead line and the migration banner |
| QA-API-N02 | `pnpm generate-api` on the branch, diff `swagger.json` against main | Only the operations in the table change |
| QA-API-N03 | `pnpm check:mcp-tools-snapshot`, `pnpm check:chart-as-code-schema` | Pass |

## Rolling update

| ID | Steps | Expected |
|---|---|---|
| QA-API-R01 | Run the previous release and the branch side by side on one database (two backend pods), the old pod first | Both serve requests; no 500s |
| QA-API-R02 | During the overlap, save a new SQL chart through the old pod | Lands in `saved_sql` only: the fold migration already ran, so the new pods never see it. After the rollout the chart is invisible in the UI (it exists only in `saved_sql`). Record; the declaration says "save it again", which the user cannot do for a chart they cannot see (see P01) |
| QA-API-R03 | During the overlap, open a dashboard with SQL tiles from a browser served by the old pod's assets | Old tab may error on tiles until reloaded (declared) |
| QA-API-R04 | Self-hosted single instance (Recreate strategy) | Upgrade in one step; no overlap issues |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-API-P01 | SQL charts created or edited by a previous release pod after the fold migration ran are never copied; created ones disappear from every new-pod listing until someone re-runs the copy | migration `20261018150000` runs once; `SavedSqlModel` reads `saved_queries` only |
| QA-API-P02 | The `firstPartyOnly` advisory on the v2 SQL chart query endpoints understates the change: they are public, documented endpoints whose response keys changed | `release-safety.declarations.json` |

## Evidence

Request and response pairs before and after for U02 to U04 (the seed's
`baseline` and `v1Read` hold the old shapes).
