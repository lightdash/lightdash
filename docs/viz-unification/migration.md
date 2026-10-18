# One viz stack over every query: migration from the old world to the new

Status: phases 1 to 4 are implemented on the branch
`claude/friendly-heisenberg-atf1t3`; what is left is the table drop of a
later release (see "Not in phase 4"). This is the single reference for what
changes for users and operators as Lightdash moves every query type onto one
chart stack and one saved-content model. Each phase below says what ships,
what a user sees differently, and what breaks or needs care on upgrade.
Measured performance is in the last section.

Summary of what a user notices, across all phases:

- Composer, SQL and agent answers draw with the same chart stack as saved
  charts and dashboards, with the explorer's config panel (phase 1).
- A composer result can be saved as a chart; it lands in spaces, dashboards,
  deliveries, exports, content as code and promotion like any chart (phase 2).
- Saved SQL charts are saved charts: one list, one page, one tile type, one
  set of chart actions. Old SQL chart links redirect (phase 3).
- The SQL runner's Chart tab is the explorer's; aggregation moves into the
  statement; its own config panel and the viz aggregation are gone (phase 4).
- Slack images and the MCP chart app draw what the web draws (phase 4).
- Pipeline chart tiles (composer charts, folded SQL charts) cost about one
  second where a classic tile costs a third of one; classic dashboards are
  unchanged (Performance).

## Removed and narrowed capabilities

Everything a user could do before that they cannot do now, or can do less
of. "Intended" means the design removes it; "gap" means nothing replaces it
yet. The judgement on each is in
[`migration-review.md`](migration-review.md), section "Removed capabilities:
intended or gap".

| Capability | Before | Now | Phase | Intended or gap |
|---|---|---|---|---|
| Aggregation in the SQL runner chart config | Pick sum, count, average, min or max per y-axis value; the chart aggregated the statement's rows | The chart draws the statement's rows. Write the `GROUP BY` in the SQL | 4 | Intended |
| Editing the SQL of a legacy aggregated chart | Any saved SQL chart opened in the SQL runner | Charts that aggregated in the chart (most legacy bar, line, pie and big number charts) open read-only: the runner cannot represent the aggregating node. Change the config on the chart page, or rewrite the SQL with the aggregation and save a new chart | 4 | Intended, customer-visible |
| Styling of folded SQL charts | SQL runner display config | Dropped on conversion: y-axis number format (`usd`, `%`), x-axis date format, 100% stacking (becomes normal stacking), table column order and bar colours, big number conditional formatting. Re-apply them in the chart page config panel | 3 | Gap: the converter could carry most of them |
| Number formatting in folded tables | Typed columns | Columns are strings until the chart is saved again; numbers show unformatted and the dashboard filter picker offers string operators only | 3 | Gap |
| SQL chart version history | Every version | The latest version only; older versions stay in `saved_sql_versions`, unreadable from the app | 3 | Decide: copy or accept |
| The SQL runner's own config panel and the pivoted results table under the chart | Column-addressed config; a second table of the pivoted rows | The explorer's config panel; the pivot is visible in the chart only | 4 | Intended |
| Big number in the agent viz switcher | Offered | Not offered | 1 | Intended |
| Per-series aggregation in composer artifacts | Stored in viz schema v1 | Dropped on the read-time upgrade to v2; the pipeline aggregates | 1 | Intended |
| Chart page downloads for pipeline charts | The SQL chart page had CSV, Excel and image | The pipeline chart page has no download menu (dashboard tile menus still export) | 3 | Gap |
| Dashboard date zoom, semantic dashboard filters, column totals, drill, underlying data, view SQL, "Explore from here", the in-dashboard chart editor | Available on explore charts (date zoom and semantic filters never applied to SQL tiles) | Not applied to pipeline charts, folded SQL charts included | 2, 3 | Documented as not applied; each is a gap for folded charts where it worked before |
| Threshold alerts and filter overrides on folded charts | Alert fields and overrides on SQL charts (where offered) | Alerts on folded tables see string fields only; delivery and alert filter overrides are not applied to pipeline runs | 3 | Gap |
| Validation of SQL charts | Validator checked them | Pipeline charts are skipped; a broken one is found when it runs | 2 | Gap |
| Deprecated SQL chart API fields | `views`, agent identity | `views` is 0, agent identity null | 3 | Intended (sunset) |
| Old links for a chart whose slug collided | `/sql-runner/<slug>` opened the SQL chart | The slug was suffixed `-sql-<uuid8>`; the old link opens the explore chart that holds the slug | 3 | Gap: customer-visible with no warning |
| SQL chart tile load time | One warehouse query, about 0.3 s | A pipeline run, about 0.6 s (table) to 1.1 s (aggregated chart) | 3 | Accepted cost, measured below |
| Old `@lightdash/sdk` versions | Drew SQL tiles | Cannot draw pipeline charts; the host app must upgrade the SDK | 3 | Customer action |

The plan this executes is in `docs/composer-viz-plan/` (query and result
interface) with the viz target changed: the chart stack is the explorer's
`ChartConfig` drawn by `@lightdash/visualization`, not the SQL runner's
column-addressed config. The reasoning is in
[`05-viz-config-convergence.md`](../composer-viz-plan/05-viz-config-convergence.md)
and the first section below.

## Vocabulary

- **Classic chart stack**: `ChartConfig` / `ChartType`, rendered by
  `@lightdash/visualization` through `VisualizationProvider` and
  `LightdashVisualization`. The explorer, dashboards, embeds, the SDK, the
  desktop app, scheduled screenshots and documents draw through it.
- **SQL runner chart stack** (retired by this program): `AllVizChartConfig` /
  `ChartKind`, the `common/src/visualizations` data models and
  `frontend/components/DataViz`. Used by SQL runner charts, SQL dashboard
  tiles, document SQL charts and, before phase 1, composer artifacts.
- **Composer artifact**: the chart artifact an AI agent's composer query
  creates: a pipeline of nodes, a terminal node and a viz.
- **Viz**: how a result is visualized. In the new world it has two parts:
  the agent's **intent** (the `chartConfig` vocabulary of the `runQuery`
  tool: kind, x, y, group by, labels) and an optional explorer **chart
  config** that a person saved from the config panel, which wins when set.

## Why the classic stack is the target

| | Classic stack | SQL runner stack |
|---|---|---|
| Chart types | 11 built in, custom chart types, Vega | 5 |
| Formatting from column metadata | yes | partial |
| Totals, subtotals, conditional formatting, drill, reference lines | yes | no |
| Headless render (server, SDK, desktop, screenshots) | `renderChart` | none |
| Regression harness | ~900 charts replayed per change | none |
| Consumers | every chart in the product | SQL charts, composer, documents' SQL charts |

The classic stack already accepts a column without a semantic model
(`ChartFieldDefinition` in the visualization package), and `ResultColumn`
carries the label, format and time grain a column needs. The merge query is
the proof: a three node pipeline drawn by the classic stack with items
synthesized from its columns, including custom chart types, dashboards,
content as code and promotion.

## Phase 1: composer and SQL artifacts draw through the classic stack

Shipped on the branch `claude/friendly-heisenberg-atf1t3`.

### What changes for a user

- **Composer results in the agent thread** are drawn by the same chart stack
  as every saved chart. The viz switcher offers the kinds the result supports
  (table, bar, horizontal bar, line, scatter, pie, funnel), the same set a
  `runQuery` answer offers. A kind picked in the switcher is stored on the
  artifact version, so the thread reopens on it.
- **The Chart bar** under a composer result opens the explorer's own config
  panel for the chart type: axes, series, labels, colors, table columns,
  conditional formatting, everything a saved chart can be configured with.
  Edits are written to the artifact version (thread owner or agent admin).
- **Grouped charts** (a series per value of a column) re-shape the result on
  the compose engine, run as the artifact owner. A viewer no longer needs
  their own query permission for the artifact to chart.
- **Other nodes of the pipeline** open as a table of their own columns, with
  the viz switcher available; their choice is kept on screen only.
- **SQL answers** (`runSql`) render through the same panel as a one node
  pipeline. Save and download actions are unchanged. The floating kind pill
  is gone; the switcher sits above the chart.
- **Big number** stays available as a chart type the planner can pick for a
  one row result, as an explorer config.
- **Labels and formats**: columns that come from the semantic layer keep their
  field label, format and time grain. Columns from DuckDB or Python nodes show
  a friendly name derived from the column name and format by type.

### What changes for the agent

- The composer tool's result line names the chart the artifact opens on, as
  before (`Visualization: bar chart, x = month, y = signups.`).
- The viz planner emits the `runQuery` chart vocabulary. The agent vocabulary
  for every artifact kind (semantic, merge, SQL, composer) is one and the same.

### Backwards compatibility

- **Stored composer artifacts (schema version 1)** are upgraded when read.
  Axes map onto the intent one to one. A series split becomes a pivot of the
  rows as the pipeline produced them. The viz-side aggregation (`SUM` of a
  value per series) the old config carried has no equivalent: aggregation
  belongs in the query. A version 1 chart that relied on it shows one value
  per series instead of a sum; ask the agent to aggregate in the pipeline.
  Nothing is rewritten in the database; a later edit writes version 2.
- **API**: `PATCH .../artifacts/{a}/versions/{v}/viz-config` (body
  `vizConfig`) is replaced by `PATCH .../versions/{v}/viz` (body `viz`), and
  `POST .../versions/{v}/pivot-query` is new. Only the web app calls them;
  composer artifacts sit behind the `multi-source-query` flag, off by
  default. An old browser tab gets a 404 on the old path until it refreshes.
  Declared in `release-safety.declarations.json`.
- **`ResultColumn.provenance.fieldType`** is a new optional field every
  result page carries for semantic columns. Additive.
- **Removed code**: the composer viz helpers (`composerViz.ts`,
  `composerVizPanel.ts`), the DataViz-based composer and SQL artifact
  components, the composer pivot hook that posted to the public
  query-sources API.

### Not yet in phase 1

- Saving a composer artifact as content (phase 2).
- Custom chart types on composer results (needs column-addressed field
  mapping; phase 2).
- Slack and MCP chart images still use their own ECharts builders (phase 4).

## Phase 2: composer charts are saved content

Shipped on the branch `claude/friendly-heisenberg-atf1t3`. Design in
[`03-saved-composer-charts.md`](../composer-viz-plan/03-saved-composer-charts.md),
with one change: the saved chart stores the pipeline beside the chart config
instead of a new content type, so every consumer of saved charts works without
knowing about pipelines.

### The model

A **pipeline chart** is a saved chart whose query is a composer pipeline. It is
a row in `saved_queries` like any chart, with one extra row per version in
`saved_queries_version_pipelines`: the nodes, the terminal node, and the
terminal result's columns as they were when the chart was saved. This mirrors
the merge table (`saved_queries_version_merges`): almost no version has one, so
the per-version table stays narrow.

- `tableName` and `metricQuery.exploreName` are the terminal node id. The
  chart's dimensions and metrics are the terminal columns under
  `<terminalNodeId>_<column>` field ids, dimensions or metrics by column role.
- The chart config, pivot config, table config, sorts and limit are the
  explorer's, addressed by those field ids. Everything that reads a saved
  chart (dashboards, deliveries, exports, content as code, promotion, drafts,
  history, preview projects) carries the pipeline without changes to its own
  shape.
- On every run the stored nodes are submitted as the viewer, then a chart node
  (`viz`) reads the terminal result under the chart's field ids with the
  chart's sort, limit and pivot composed over it, the way a merge's join node
  is. The chart node's query history row carries the chart's fields, so the
  result page reads like any saved chart result.

### What changes for a user

- **Save as chart** on a composer result in the agent thread. The saved chart
  draws exactly what the thread drew: the same chart config, the same pivot,
  over the same pipeline. It lands in a space or on a dashboard like any chart.
- **Pipeline charts on dashboards** load through the ordinary chart tile. Tile
  menus, downloads, duplicate, move and delete work. "Explore from here" and
  the in-dashboard chart editor are not offered: a pipeline is not a query the
  Explorer can open.
- **A pipeline chart's own page** shows the chart with the pipeline underneath,
  node by node, with the SQL or code of each node. Edit mode changes the chart
  type, config and pivot and saves a new version. The pipeline itself is edited
  where it was made, in the agent thread.
- **Deliveries and exports**: scheduled deliveries, CSV and Excel exports and
  image exports of pipeline charts run the pipeline the same way, with the
  export limit applied to the chart node.
- **Permissions**: semantic layer nodes run under the viewer's own explore
  access and user attributes. Warehouse SQL nodes run under the chart's view
  permission, the way a saved SQL chart's SQL does today; the author needed SQL
  runner access to save the chart (and content as code upload checks the same).
- **Content as code** exports a `pipeline:` block on pipeline charts and
  accepts one on upload; promotion carries it between projects.

### Not applied to pipeline charts (phase 2)

These are the same gaps a merged chart has; they are listed so a user knows
what to expect rather than guess.

- **Dashboard filters** are not pushed into a pipeline. The tile shows no
  applied filters and the dashboard filter list offers none of its fields.
- **Date zoom** is not applied.
- **Column totals** in tables are not computed; the totals request is refused
  with a message.
- **Drill into underlying data**, "view SQL" and field URLs are off, as the
  fields have no explore behind them.
- **Validation** skips pipeline charts; a pipeline that stops working is found
  when it is run, not by the validator.
- **Custom chart types and Vega** are available in the config panel but not
  yet checked against pipeline fields.
- **Documents** can link a pipeline chart (the linked chart runs through the
  chart endpoint) but cannot copy one into the document as an inline chart;
  inline document charts know explore, merge and SQL sources. Phase 3 adds
  the pipeline source when SQL charts fold in.

### Backwards compatibility

- **Database**: one new table, `saved_queries_version_pipelines`, created
  empty, cascading from chart versions. No backfill, no change to existing
  rows. Old backend pods ignore the table, so a rolling update is safe; a
  chart saved with a pipeline during the rollout is drawn by an old pod as a
  chart over an unknown explore until the pod is replaced.
- **API**: `SavedChart`, `CreateSavedChart`, `CreateSavedChartVersion` and
  `ChartAsCode` gain an optional `pipeline`. Additive; omitted on every
  existing chart. The chart as code JSON schema is regenerated accordingly.
- **Query sources**: an internal submission carries the saved chart it runs
  for, which lets its SQL nodes skip the SQL runner permission. The public
  query sources endpoint cannot set it.
- **Composer artifact to saved chart**: the saved pipeline stores the terminal
  columns at save time. If the pipeline later returns different columns (a
  node is edited in the thread and re-saved, or an upstream explore changes),
  the chart's fields keep the saved shape and missing columns read as empty.
  Re-save the chart from the thread to pick up the new columns.

## Phase 3: SQL charts fold into saved charts

Shipped on the branch `claude/friendly-heisenberg-atf1t3`.

### The model

A saved SQL chart is a pipeline chart: the statement is a SQL node, and when
the SQL runner aggregated at draw time (a bar, line, pie or big number over
raw rows) an aggregating DuckDB node follows it, so aggregation lives in the
query. The chart config is the explorer's, over the terminal columns under
`<node>_<column>` field ids. The converter is
`convertSqlChartToPipelineChart` in `packages/common/src/types/sqlChartPipeline.ts`;
its inverse rebuilds the SQL runner shape for the SQL runner page and the
agent tools that still speak it.

### What the migration does

`20261018150000_fold_saved_sql_into_saved_queries` copies every `saved_sql`
row into `saved_queries` **under the same uuid**, with one version per chart
holding the latest statement, limit, connection and SQL runner config in a
`saved_queries_version_pipelines` row at schema version 0. The backend
converts schema version 0 when it reads the chart; the next save writes the
converted shape. Direct grants are copied to the saved chart grant tables.

Nothing else moves: `saved_sql*` tables stay for the previous release,
dashboard tiles keep their `sql_chart` rows, schedulers, documents and agent
artifacts keep their `saved_sql_uuid` columns. The backend reads those uuids
as saved chart uuids. The tables and the columns are dropped in a later
release, once no pod of the previous release can read them (see phase 4).

Slugs: a SQL chart whose slug a saved chart already holds in the project gets
`<slug>-sql-<8 chars of its uuid>`. Links by slug to such a chart redirect
through the uuid and keep working.

### What changes for a user

- **SQL charts open on the chart page** (`/projects/:p/saved/:uuid`) with the
  classic chart stack and config panel. The old address
  (`/projects/:p/sql-runner/:slug`) redirects there. The SQL runner still
  edits the statement (`.../sql-runner/:slug/edit`) and saves a version.
- **SQL chart tiles are chart tiles.** Dashboard filters are applied to the
  chart node over the columns they name, like before; sorts apply; date zoom
  does not (as before). Tile menus, exports, duplicate, move and delete are
  the chart tile's.
- **Aggregated SQL charts keep their numbers.** A bar chart that summed an
  amount per status still sums per status: the aggregation runs in the
  aggregating node of the pipeline. Series split (group by) becomes a pivot.
- **Charts over the statement's raw rows** (tables, and a chart saved
  without columns) learn their columns when they run, with one probe query
  (`LIMIT 1`) on the warehouse, the way the SQL runner did on every run.
  Column types for such tables are strings until the chart is saved again,
  so numbers in those tables are shown unformatted until then.
- **Search, spaces, content lists and the home page** list SQL charts once,
  as charts. They open on the chart page.
- **Documents** that link a SQL chart show it as a linked saved chart. Inline
  SQL charts in documents are unchanged (phase 4).
- **Deliveries and Google Sheets syncs** of SQL charts run the pipeline.
- **Promotion and content as code** export SQL charts as charts with a
  `pipeline:` block; the `sqlCharts` code directory is empty on download, and
  an upload of a `sqlCharts` file creates a pipeline chart.
- **Chart version attribution** for SQL charts (which agent saved a version)
  is on the chart's history page; the legacy SQL chart response no longer
  carries it.

### Performance

A SQL chart tile ran one warehouse query. A pipeline chart tile runs its
nodes in sequence on the compose engine, each waiting on the one before it,
so it costs more than one query. Phase 3 shortens the wait between nodes
(the reference poll starts at 100 ms instead of 500 ms): a folded aggregated
bar chart (SQL node, aggregating node, chart node) is ready in about 1.1 s
on the development environment, a folded table (SQL node, chart node) in
about 0.6 s, against about 0.3 s for a classic chart tile. Dashboards of
classic charts are unchanged. Numbers are in the Performance section.

### Backwards compatibility

- **Rolling update**: the previous release's pods keep reading and writing
  `saved_sql`; the new pods read the copies in `saved_queries`. A SQL chart
  saved or edited by an old pod during the rollout is not in the copy; after
  the rollout, save it again from the SQL runner. Declared as
  `viz-unification-p3-sql-charts-fold-into-saved-charts`.
- **API**: the saved SQL chart endpoints keep their paths and shapes and
  operate on saved charts (see the declaration). `GET .../sqlRunner/saved/*`
  returns a SQL runner config rebuilt from the explorer config.
- **Conversion losses**: the fold drops y-axis number formats, x-axis date
  formats, 100% stacking, table column order and bar colours, and big number
  conditional formatting (`sqlChartPipeline.ts` does not carry them). The
  deprecated GET cannot return them either. They must be re-applied on the
  chart page. The rig confirmed the loss on every seeded chart that had them.
- **Permissions**: a SQL chart's direct grants are the saved chart's; the
  `sqlChart` access target resolves as a chart.
- **Views and favourites**: SQL charts had none; they now count views like
  charts.

## Phase 4: the SQL runner chart stack is deleted

Shipped on the branch `claude/friendly-heisenberg-atf1t3`.

### The model

The SQL runner draws through the classic chart stack. The result of the last
run is the chart's table (`sql`): its columns become dimensions and metrics
under `sql_<column>` field ids, exactly as a saved SQL chart's fields are,
and the chart config the page holds is an explorer `ChartConfig`. The
sidebar's Chart tab is the explorer's own config panel for the chosen type,
and the chart type picker lists every built-in type. A grouped chart
re-runs the statement pivoted on the warehouse, the way a saved chart's run
pivots. Saving writes a saved chart whose pipeline is the statement as one
SQL node (`buildSqlChartPipeline`); editing a saved chart loads that node
back into the editor. Nothing is converted in between: the config the
editor shows is the config the dashboard draws.

Documents' inline SQL charts run through the same path: the server converts
the stored SQL runner config to a pipeline chart and runs it as a pipeline,
and the page draws it with the classic stack like every other document
chart.

Deleted: `packages/frontend/src/components/DataViz`,
`features/queryRunner`, `features/sqlRunner/runners`, the SQL chart tile,
the document SQL chart view, the saved SQL chart hooks, and the chart data
models in `packages/common/src/visualizations` (`BigNumberDataModel`,
`CartesianChartDataModel`, `PieChartDataModel`, `TableDataModel`,
`IResultsRunner`). The stored shapes in `visualizations/types` stay, so
charts saved before the fold and old share links still convert.

### What changes for a user

- **The SQL runner's Chart tab is the explorer's.** Chart types, the config
  panel (axes, series, legend, formats, conditional formatting, pivots,
  reference lines) and the chart itself are the ones the explorer and
  dashboards use. The SQL runner's own config panel is gone.
- **Aggregation is in the SQL.** The SQL runner no longer offers an
  aggregation (sum, count, average, min, max) per y-axis value: the chart
  draws the rows the statement returns. Write the `GROUP BY` in the
  statement. Charts saved before this phase keep aggregating through the
  aggregating node the fold gave them (phase 3), and still draw and run
  everywhere; their statement cannot be edited in the SQL runner (the
  runner cannot represent the aggregating node), only their chart config on
  the chart page. To change such a chart's SQL, add the aggregation to the
  statement and save it as a new chart.
- **Saving a chart creates a saved chart** (`POST /api/v1/projects/:p/saved`)
  and opens it on the chart page. Saving from the SQL tab saves the results
  as a table. Chart name, description and space are edited from the SQL
  runner's header as before; delete goes through the saved chart delete.
- **The saved SQL chart's page is the saved chart page**, with the actions
  every saved chart has in its menu: add to dashboard, duplicate, pin,
  scheduled deliveries, Google Sheets sync, request review, promote, share
  and delete. "Edit chart" opens the statement in the SQL runner
  (`/sql-runner/:slug/edit`). The old chart address (`/sql-runner/:slug`)
  redirects to the chart page and keeps a scheduler link's query string, so
  links from the schedulers list still open the delivery or sync.
- **The results pane always shows the statement's rows** as the warehouse
  returned them. The pivoted rows a grouped chart draws are visible in the
  chart, not as a second table under it.
- **Downloads**: the chart tab's download menu is the explorer's (image and
  results, pivoted results when the chart groups); the SQL tab's download is
  the results export.
- **Share links** made before this phase carry the SQL runner config; it is
  converted to the explorer config when the link opens. New links carry the
  explorer config. The URL format is unchanged.
- **Dashboards and embeds** render a SQL chart tile a client still holds in
  its old shape as the chart tile it is.

### Backwards compatibility

- **API**: the saved SQL chart endpoints under
  `/api/v1/projects/{projectUuid}/sqlRunner/saved` are deprecated on
  2026-10-18 and sunset on 2027-01-18. They keep working as adapters over
  saved charts until then, with `Deprecation` and `Sunset` headers on every
  response. No first party client calls them. The replacements:

  | Deprecated | Replacement |
  |---|---|
  | `GET sqlRunner/saved/{uuid}`, `GET sqlRunner/saved/slug/{slug}` | `GET /api/v2/projects/{projectUuid}/saved/{uuidOrSlug}` |
  | `POST sqlRunner/saved` | `POST /api/v1/projects/{projectUuid}/saved` with a one-node SQL `pipeline` |
  | `PATCH sqlRunner/saved/{uuid}` | `PATCH /api/v1/saved/{chartUuid}` (name, description, space) and `POST /api/v1/saved/{chartUuid}/version` (statement, chart config) |
  | `DELETE sqlRunner/saved/{uuid}` | `DELETE /api/v2/projects/{projectUuid}/saved/{uuidOrSlug}` |
  | `POST sqlRunner/saved/{uuid}/promote`, `GET .../promoteDiff` | `POST /api/v1/saved/{chartUuid}/promote`, `GET /api/v1/saved/{chartUuid}/promoteDiff` |
  | `GET sqlRunner/saved/{uuid}/schedulers` | `GET /api/v2/saved/{chartUuid}/schedulers` |
  | `POST sqlRunner/saved/{uuid}/schedulers` | `POST /api/v1/saved/{chartUuid}/schedulers` |

  A SQL chart created through the saved charts endpoint carries the
  statement as `pipeline.queries[0]` (`sourceType: "sql"`, `nodeId: "sql"`,
  `sql`, `limit`, optional `warehouseConnectionUuid`), `terminalNodeId:
  "sql"`, the result `columns`, and the chart config as the explorer draws
  it with `sql_<column>` field ids. `packages/api-tests/tests/sqlRunner.test.ts`
  exercises that shape end to end (create, run through
  `POST /api/v2/projects/{projectUuid}/query/chart`, version, delete).
  Content as code, promotion and the agent tools are unchanged.
- **Google Sheets sync**: a SQL chart's sync is a saved chart's sync. The
  sync modal's SQL chart branch, which posted to the deprecated scheduler
  endpoint, is removed; the SQL chart page that opened it went in phase 3.
- **Rolling update**: the old UI pod's SQL runner saves through the adapter
  endpoints and the new pod reads the saved charts; both shapes are read by
  both pods. Nothing here needs a declaration beyond phase 3's.
- **Documents**: the stored inline SQL chart shape is unchanged (`source:
  'sql'` with the SQL runner config); the run and the drawing changed.
  Document exports (PDF) draw inline SQL charts through the same renderer
  as every other chart.

### Slack and MCP chart images

The agent's Slack images and the MCP `render_chart` tool draw through the
chart engine the web app uses (`@lightdash/visualization`'s `renderChart`).
The tool's chart config becomes the explorer chart config the way the web
answer does (`getRunQueryChartConfig`), a grouped chart pivots its rows in
process into the shape the query API returns for a pivoted result
(`pivotQueryResults`, with `pivotDetails`), the engine builds the ECharts
option headlessly, and `renderEcharts` rasterizes it with node-canvas as
before. The backend depends on `@lightdash/visualization` for this (the
image build copies the package into the backend build stage).

Deleted: the Slack ECharts config builders in
`packages/common/src/ee/AiAgent/chartConfig/slack` and the DuckDB pivot
(`getPivotedResults`). The backend keeps DuckDB for its other uses.

What changes for a user:

- **Slack images look like the web chart.** Same axes, legend, series
  colours, number and date formats, stacking and grouping as the answer in
  the app. Before, Slack had its own simplified drawing (plain default
  colours, raw axis values).
- **The MCP chart app** receives the same ECharts option the web draws.
  Function formatters do not survive JSON, so the app keeps injecting its
  own tooltip formatter; axis labels show the engine's formatted values.
- **Tables and custom chart types** are unchanged: a table answer sends no
  image, a custom chart type still exports through the headless browser.

### Not in phase 4

- `saved_sql*` tables and the `saved_sql_uuid` columns (tiles, schedulers,
  documents, agent artifacts) are dropped in a later release once no pod
  reads them. Until then the backend keeps the read paths that interpret a
  `saved_sql_uuid` as a saved chart uuid (`SavedSqlModel` reads
  `saved_queries`; the scheduler task's SQL chart branch, the unfurl
  service's SQL chart page, the document and artifact links). That release
  needs, in order: the deprecated `sqlRunner/saved*` endpoints removed after
  their sunset (2027-01-18); a migration that rewrites the remaining
  `saved_sql_uuid` references to `saved_chart_uuid` (schedulers, dashboard
  tiles still stored as `sql_chart`, document chart links, agent artifacts)
  and then drops the columns and the `saved_sql*` tables; the backend
  branches above deleted with their types (`ChartSourceType.SQL`,
  `DashboardTileTypes.SQL_CHART`, `SavedSqlModel`, `SavedSqlService`); and a
  `breaking` release-safety declaration, since a pod of the previous release
  cannot run against the dropped tables.

## Performance

Dashboard load must not regress: the bulk of saved charts are classic charts on
the optimized dashboard path, and no phase changes that path. The numbers below
are measured on the development environment (GKE, one backend pod, one
warehouse worker, Postgres warehouse, jaffle shop seed) with an API level
harness that submits every chart tile of a dashboard at once the way the web
app does and polls until every tile is ready.

### Baseline: main at 2.603.0 (`a7333cf`), 2026-10-18

Three runs per dashboard; the first run invalidates the results cache (cold),
the other two are warm. Wall time is from the first tile submission to the
last tile ready, all tiles in flight at once. Tile errors are seeded edge
cases (charts meant to fail), identical in every run.

| Dashboard | Chart tiles | Cold wall ms | Warm wall ms (median of 2) | Warm tile p95 ms | Tile errors |
|---|---|---|---|---|---|
| Jaffle dashboard | 5 | 752 | 655 | 769 | 0 |
| Dashboard with dashboard charts | 1 | 285 | 294 | 296 | 0 |
| Pivot Table Dashboard | 10 | 953 | 1112 | 1203 | 0 |
| Cartesian Charts (time dimensions) | 15 | 1064 | 1237 | 1268 | 0 |
| Scheduled delivery edge cases | 3 | 321 | 311 | 314 | 3 |
| Filter Tests Dashboard | 19 | 1378 | 1378 | 1388 | 0 |
| POP Tests Dashboard | 5 | 764 | 518 | 523 | 0 |
| Table Calculations Tests Dashboard | 8 | 771 | 634 | 727 | 0 |
| Fanout Tests Dashboard | 8 | 1115 | 1015 | 1070 | 0 |
| [CF Coverage] Dashboard | 11 | 988 | 1098 | 1108 | 0 |
| Weekly revenue review | 6 | 541 | 602 | 662 | 0 |

Reading: a dashboard's load is bounded by its slowest tile; every tile is a
separate warehouse query plus polling, and the per-tile p95 tracks the wall
time. The warehouse here is the instance's own Postgres, so these are
near-floor numbers for the API path; a real warehouse adds its own latency on
top but not to the Lightdash side.

### Phase 2 build (`a070e57`) against the baseline

Same harness, after a warm-up pass; three runs per dashboard. The "Perf
pipeline vs classic" dashboard holds one classic bar chart and one pipeline
chart (a semantic node, a DuckDB node, drawn as a bar) over the same explore.

| Dashboard | Chart tiles | Cold wall ms (base → p2) | Warm wall ms (base → p2) | Warm tile p95 ms (base → p2) |
|---|---|---|---|---|
| Jaffle dashboard | 5 | 752 → 548 | 770 → 523 | 769 → 523 |
| Pivot Table Dashboard | 10 | 953 → 889 | 1204 → 1165 | 1203 → 1160 |
| Cartesian Charts (time dimensions) | 15 | 1064 → 1118 | 1268 → 1209 | 1268 → 1208 |
| Filter Tests Dashboard | 19 | 1378 → 1235 | 1389 → 1433 | 1388 → 1431 |
| POP Tests Dashboard | 5 | 764 → 505 | 523 → 495 | 523 → 495 |
| Table Calculations Tests Dashboard | 8 | 771 → 756 | 728 → 731 | 727 → 731 |
| Fanout Tests Dashboard | 8 | 1115 → 1035 | 1070 → 980 | 1070 → 979 |
| [CF Coverage] Dashboard | 11 | 988 → 953 | 1109 → 1088 | 1108 → 1087 |
| Weekly revenue review | 6 | 541 → 543 | 663 → 788 | 662 → 787 |
| Perf pipeline vs classic | 2 | 2025 | 1911 | 1911 |

Reading: classic dashboards are unchanged within run to run noise (the
dashboard path is untouched; the differences above are within the spread of
repeated runs of the same build). A pipeline chart tile is the exception:

| Tile | Ready ms (median of 3 warm runs) |
|---|---|
| Classic bar chart | 301 |
| Pipeline bar chart (semantic → DuckDB → chart node) | 1911 |

The pipeline tile runs three queries in sequence, and each DuckDB node waited
for the one before it with a poll that started at 500 ms. Phase 3 lowers the
first poll to 100 ms; the re-measurement is below once it lands.

### Phase 3 build (`6285a84`) against the baseline

Same harness, after a warm-up pass; three runs per dashboard. "Legacy SQL
charts" holds two SQL charts saved through the old saved SQL chart API before
the fold migration ran: a bar chart that summed an amount per status (folded
to a SQL node, an aggregating node and a chart node) and a table over the raw
rows (a SQL node and a chart node, columns discovered on the first run).

| Dashboard | Chart tiles | Cold wall ms (base → p3) | Warm wall ms (base → p3) | Warm tile p95 ms (base → p3) |
|---|---|---|---|---|
| Jaffle dashboard | 5 | 752 → 644 | 770 → 826 | 769 → 824 |
| Pivot Table Dashboard | 10 | 953 → 1013 | 1204 → 1196 | 1203 → 1195 |
| Cartesian Charts (time dimensions) | 15 | 1064 → 1199 | 1268 → 1252 | 1268 → 1251 |
| Filter Tests Dashboard | 19 | 1378 → 1281 | 1389 → 1344 | 1388 → 1344 |
| POP Tests Dashboard | 5 | 764 → 663 | 523 → 520 | 523 → 520 |
| Table Calculations Tests Dashboard | 8 | 771 → 754 | 728 → 833 | 727 → 832 |
| Fanout Tests Dashboard | 8 | 1115 → 1071 | 1070 → 1071 | 1070 → 1070 |
| [CF Coverage] Dashboard | 11 | 988 → 973 | 1109 → 1112 | 1108 → 1111 |
| Weekly revenue review | 6 | 541 → 768 | 663 → 663 | 662 → 663 |
| Perf pipeline vs classic | 2 | 1113 | 1119 | 1119 |
| Legacy SQL charts | 2 | 1150 | 1141 | 1141 |

Reading: classic dashboards are still unchanged within noise. The pipeline
tile that took 1911 ms in phase 2 is ready in 1119 ms with the shorter
reference poll; the folded SQL charts cost the same order:

| Tile | Ready ms (median of 3 warm runs) |
|---|---|
| Classic bar chart | 301 |
| Pipeline bar chart (semantic → DuckDB → chart node), phase 2 | 1911 |
| Pipeline bar chart (semantic → DuckDB → chart node), phase 3 | 1119 |
| Folded SQL bar chart (SQL → aggregating node → chart node) | 1141 |
| Folded SQL table (SQL → chart node) | 598 |

Each node after the first still costs one compose engine round trip (submit,
wait for the reference, read). The remaining gap to a classic tile is that
sequence; a run that submits a pipeline as one compose job would close it.

### Phase 4 build (`5fae217`) against phase 3, A/B on one environment

Phase 4 changes nothing on the dashboard chart path (its backend changes are
the document SQL chart run and the chart page's available filters), so the
expected result is no change. A single run against the baseline showed
several dashboards 100 to 270 ms slower, which the method below shows to be
noise: the phase 3 image and the phase 4 image were deployed to the same
environment one after the other, idle, and benchmarked with five runs each
(phase 4, then phase 3, then phase 4 again).

| Dashboard | Chart tiles | Warm wall ms (p4 run 1 → p3 → p4 run 2) | Warm tile p95 ms (p4 run 1 → p3 → p4 run 2) |
|---|---|---|---|
| Jaffle dashboard | 5 | 828 → 837 → 835 | 827 → 836 → 835 |
| Dashboard with dashboard charts | 1 | 580 → 286 → 293 | 580 → 286 → 293 |
| Pivot Table Dashboard | 10 | 1349 → 1184 → 1153 | 1348 → 1182 → 1152 |
| Cartesian Charts (time dimensions) | 15 | 1239 → 1230 → 1233 | 1239 → 1229 → 1232 |
| Filter Tests Dashboard | 19 | 1341 → 1341 → 1312 | 1340 → 1341 → 1309 |
| POP Tests Dashboard | 5 | 658 → 495 → 658 | 658 → 495 → 657 |
| Table Calculations Tests Dashboard | 8 | 836 → 823 → 848 | 835 → 822 → 847 |
| Fanout Tests Dashboard | 8 | 1072 → 1056 → 1136 | 1072 → 1056 → 1136 |
| [CF Coverage] Dashboard | 11 | 1112 → 1069 → 1076 | 1112 → 1068 → 1075 |
| Weekly revenue review | 6 | 798 → 559 → 763 | 797 → 558 → 763 |
| Perf pipeline vs classic | 2 | 1140 → 1107 → 1155 | 1139 → 1107 → 1154 |
| Legacy SQL charts | 2 | 1139 → 1121 → 1136 | 1139 → 1121 → 1136 |

Reading: the spread between two runs of the same phase 4 image (580 against
293 ms on the one-tile dashboard, 1349 against 1153 on the pivot dashboard)
is as wide as any phase 3 to phase 4 difference, so the dashboard level
numbers cannot show a regression smaller than about 250 ms on this
environment. Per tile, the median submit time is identical across the three
runs (within 10 ms), and the median ready time of every tile is identical on
POP Tests. On Weekly revenue review three tiles are ready one poll later
(the harness polls every 150 ms) in both phase 4 runs: those tiles finish
within a few tens of milliseconds of the poll boundary, so the dashboard
number moves by a whole poll interval. The same A/B with a 50 ms poll, on
the phase 4 head (`0117b06`, which adds the Slack and MCP rendering and the
chart page actions), five runs each, phase 4 then phase 3 then phase 4:

| Dashboard | Chart tiles | Warm wall ms (p4 run 1 → p3 → p4 run 2) |
|---|---|---|
| Jaffle dashboard | 5 | 748 → 722 → 759 |
| Dashboard with dashboard charts | 1 | 297 → 301 → 310 |
| Pivot Table Dashboard | 10 | 1029 → 1079 → 1065 |
| Cartesian Charts (time dimensions) | 15 | 1141 → 1113 → 1174 |
| Filter Tests Dashboard | 19 | 1280 → 1230 → 1274 |
| POP Tests Dashboard | 5 | 567 → 542 → 507 |
| Table Calculations Tests Dashboard | 8 | 730 → 695 → 657 |
| Fanout Tests Dashboard | 8 | 955 → 942 → 969 |
| [CF Coverage] Dashboard | 11 | 1003 → 969 → 969 |
| Weekly revenue review | 6 | 710 → 658 → 538 |
| Perf pipeline vs classic | 2 | 1174 → 1154 → 1172 |
| Legacy SQL charts | 2 | 1180 → 1180 → 1187 |

Per tile, over the 96 chart tiles the harness runs (median of the warm runs
per tile, averaged):

| | Phase 3 | Phase 4 run 1 | Phase 4 run 2 |
|---|---|---|---|
| Submit (POST dashboard-chart) ms | 315 | 328 | 325 |
| Submit to ready ms | 496 | 507 | 501 |
| Ready ms | 811 | 836 | 830 |

Reading: phase 4 is within 10 to 25 ms per tile of phase 3 (about 3 percent),
split evenly between the submit request and the wait for the result, with
27 tiles more than 50 ms slower and 12 more than 50 ms faster. The dashboard
path's code is the same on both images; a difference of that size on this
environment is below what repeated runs of one image show. No dashboard is
slower by more than the run to run spread, and the pipeline and folded SQL
chart tiles are unchanged.

Methodology and raw reports: `docs/viz-unification/perf/`
(`dashboard-api-bench.mjs`, `baseline-main-a7333cf.json`,
`p2-a070e57.json`, `p3-6285a84.json`, `p3-6285a84-ab.json`,
`p4-5fae217-run1.json`, `p4-5fae217-run2.json`, `p3-6285a84-fine.json`,
`p4b-0117b06-fine-run1.json`, `p4b-0117b06-fine-run2.json`, `compare.mjs`).
The harness polls every 150 ms by default; `--poll 50` is the finer run.
