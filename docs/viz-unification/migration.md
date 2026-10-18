# One viz stack over every query: migration from the old world to the new

Status: in progress. This is the single reference for what changes for users
and operators as Lightdash moves every query type onto one chart stack and one
saved-content model. Each phase below says what ships, what a user sees
differently, and what breaks or needs care on upgrade. Measured performance is
in the last section and is updated as phases land.

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

Not started. Design in
[`03-saved-composer-charts.md`](../composer-viz-plan/03-saved-composer-charts.md).

## Phase 3: SQL charts fold into saved charts

Not started.

## Phase 4: the SQL runner chart stack is deleted

Not started.

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

Methodology and raw reports: `docs/viz-unification/perf/`
(`dashboard-api-bench.mjs`, `baseline-main-a7333cf.json`). The browser level
measurement (time to every tile drawn) is added with phase 2, when the first
composer chart tile exists to compare against a classic tile.
