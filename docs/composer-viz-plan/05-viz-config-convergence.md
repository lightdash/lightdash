# Step 5 — Viz config convergence

Status: proposed
Depends on: steps 1–4 (the interface, the render path, the saved union, the adapter)
Unblocks: retiring renderers; one viz vocabulary for humans and agents

## Goal

Reduce four viz-config vocabularies toward one system, opportunistically and
per chart kind — never as a big-bang migration. Target state: the
column-addressed stack (`AllVizChartConfig` + data models) for built-in chart
kinds, data app custom vizzes (`DataAppVizSchema` bindings) for everything
bespoke, classic `ChartConfig` surviving only where its expressiveness isn't
yet matched, and the AI tool-arg vocabulary retired.

## Current state — the four vocabularies

| Vocabulary | Addressing | Types | Wiring cost per new type |
|---|---|---|---|
| `ChartConfig`/`ChartType` (classic) | field ids via `ItemsMap`/Explore | 11 | ~9 layers (`LightdashVisualization/CLAUDE.md`) |
| `AllVizChartConfig`/`ChartKind` (SQL charts) | column references | 5 | ~4 layers (config type, data model, slice, switches) |
| AI tool-args JSON | field ids, synthesised to `ChartConfig` via `getWebAiChartConfig` | 7 enum values | n/a (LLM-authored) |
| `DataAppVizSchema` + `{dataAppVizUuid, fieldMapping, optionValues}` | declared slots → field ids | unbounded (generated code) | none (generated) |

Translation layers exist only in the AI direction; classic ↔ new have none.

Capability deltas that keep classic alive: pivot-table rendering with
subtotals (`PivotData` + `PivotTable/`), conditional formatting, table-calc
totals/row calculations, custom Vega, treemap/gauge/map/sankey, per-value
dimension colors, rich text/image cells, `field.urls` actions.

Data-app viz specifics: it is already a classic `ChartType` (`DATA_APP_VIZ`)
bound to metric-query results; its runtime payload (`DataAppVizContext`: rows,
fieldMapping, options, palette, pivotDetails) is essentially the generic
results interface; its `fieldMapping` targets are metric-query field ids
today. The copilot has no awareness of it (`getAvailableChartTypes` /
`canRenderAsChart` don't know `ChartType.DATA_APP_VIZ`).

## Proposed approach

1. **Measure first.** Query production/telemetry for chart population per
   `ChartType` and per config feature (conditional formatting present?
   subtotals on? custom Vega?) so convergence order follows real usage, and
   "retire when population reaches zero" is checkable.
2. **Lossless translations where they exist**: per-kind
   `ChartConfig → AllVizChartConfig` converters (big number and simple
   cartesian/pie first), applied at *read/render* time initially (render
   classic configs through the new stack behind a flag), with write-migration
   only after parity.
3. **Data-app vizzes bind to columns**: extend `fieldMapping` targets to
   column references so a data-app viz can sit on a composer chart; make the
   copilot aware of project chart types.
4. **Retire the AI vocabulary**: semantic artifacts move to emitting
   `AllVizChartConfig` (step 2 did composer/SQL); `getWebAiChartConfig`
   becomes legacy-read-only.
5. **Close the biggest capability gaps in the new stack** in priority order
   from the measurement: table conditional formatting and totals are the
   likely first two (both have partial precedents:
   `VizBigNumberDisplay.conditionalFormatting`, `VizColumnConfig`
   aggregation/display fields; step 1's enriched columns supply the
   numeric/type gates that classic conditional formatting reads from
   `ItemsMap`).

## Out of scope

- Pivot-table (subtotals) parity in the new stack — track separately; it is
  the deepest gap (`TableDataModel.getPivotedChartData` is a stub).
- Migrating custom Vega charts (position data-app vizzes as the successor;
  the picker already presents them side by side in `CustomVisConfig.tsx`).
- Deleting any renderer.

## Open questions

- Whether translated-at-render classic charts keep byte-identical saved
  configs (yes — write-migration is a separate, later decision per kind).
- How color assignment converges: classic palette cycling per group
  (`useChartColorConfig`) vs the new stack's explicit per-series hex.
- Whether `ChartKind` and `ChartType` unify or stay as (storage kind, config
  discriminant) pair.
- Where funnel/treemap/gauge/map/sankey land: new-stack data models, data-app
  vizzes, or stay classic indefinitely.

## Research prompt

```
You are researching a change to the Lightdash monorepo (repo root: lightdash/lightdash).
Read docs/composer-viz-plan/README.md and docs/composer-viz-plan/05-viz-config-convergence.md
first — they define the goal: converge four viz-config vocabularies onto the
column-addressed stack (AllVizChartConfig + data models) plus data-app custom
vizzes, opportunistically per chart kind, translations at render time first.
Do not implement; produce a concrete design doc.

Investigate and answer, with file/line evidence:

1. Translation feasibility per kind. For each ChartConfig variant
   (packages/common/src/types/savedCharts.ts:899-910), map its config surface
   against the corresponding Viz*Config (packages/common/src/visualizations/
   types/index.ts) and classify every property: direct-translatable,
   translatable-with-loss (name the loss), or no-target-exists. Do BigNumber,
   Cartesian, Pie, Table in full detail; summarize Funnel/Treemap/Gauge/Map/
   Sankey/Custom. Key subtleties: field-id → column-reference resolution
   (pivoted references, table calc names, custom dimensions), CartesianChart
   layout+eChartsConfig series shape vs PivotChartLayout+CartesianChartDisplay,
   and where aggregation lives (semantic layer vs fieldConfig.y[].aggregation).

2. Measurement queries. Write the SQL (against the Lightdash app database
   schema: saved_queries, saved_queries_versions.chart_type/chart_config)
   that counts current-version charts per ChartType and detects config
   feature usage (conditional formattings non-empty, showSubtotals,
   showColumnCalculation, custom vega spec present, metricsAsRows, etc.).
   These queries drive convergence order and retirement criteria.

3. Gap-closure design for the two likely-first gaps: (a) conditional
   formatting in the generic table — read
   packages/common/src/utils/conditionalFormatting.ts and its ItemsMap-typed
   gates (isNumericItem etc.) and specify what it needs from step 1's
   enriched columns; (b) column/row totals — compare useAsyncCalculateTotal /
   TotalQueryBuilder with what a composer terminal node could support.

4. Data-app viz on columns. Read the fieldMapping/auto-mapping chain
   (autoMapDataAppVizFields.ts, getDataAppVizFieldItems.ts,
   deriveDataAppVizPivotConfig.ts, DataAppVizRenderer/index.tsx,
   reconcileDataAppVizFieldMapping) and specify what changes when mapping
   targets are column references from a composer terminal result instead of
   metric-query field ids — including how the series-slot → pivot derivation
   works when pivot is executed by the composer path, and what the copilot
   needs (getAvailableChartTypes.ts, canRenderAsChart.ts) to select a
   project's data-app viz.

5. Render-time translation architecture. Where does a
   chartConfigToVizConfig(chart) converter slot into the frontend so a
   classic chart renders through getChartDataModel behind a flag —
   VisualizationProvider? DashboardChartTile? — and how does the parity check
   work (visual regression? spec diff?). Check what
   getWebAiChartConfig already proves about ChartConfig synthesis in the
   other direction.

Deliverable: a design doc with the per-kind translation matrix, the
measurement SQL, the two gap-closure designs, the data-app-viz column-binding
spec, and a convergence order recommendation with retirement criteria.
```
