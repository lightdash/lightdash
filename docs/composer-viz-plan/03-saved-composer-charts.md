# Step 3 — Saved composer charts

Status: proposed
Depends on: steps 1–2 (enriched columns; a viz config worth saving)
Unblocks: step 4 (the union is the seam classic charts are reinterpreted through)

## Goal

Composer queries become saveable, shareable, dashboard-able content — **inside
`saved_queries`, not as a third content table**. `SavedChart`'s query becomes a
discriminated union; a composer chart inherits the `SAVED_CHART` tile,
`ChartScheduler`, chart-as-code, promotion, and embed paths by extending their
switches, not by cloning them. "Add to dashboard" from an agent artifact
becomes: create saved chart (composer variant) + append a `SAVED_CHART` tile.

## Current state

- `SavedChart.metricQuery` is required (`packages/common/src/types/
  savedCharts.ts:919-992`); the MetricQuery is shredded across
  `saved_queries_versions` + 6 child tables with NOT NULL columns
  (`explore_name`, `filters`, `row_limit`); `createSavedChartVersion`
  destructures `metricQuery` unconditionally (`SavedChartModel.ts:222-436`).
- Precedent for an alternative query model on a chart version:
  `saved_queries_version_merges` (jsonb `merge` + `schema_version`,
  migration `20260812230500`).
- **The cautionary tale**: `executeAsyncSavedChartQuery` branches on
  `savedChart.merge` (`AsyncQueryService.ts:5768`) but
  `executeAsyncDashboardChartQuery` (`:6117`) never reads it — merged charts
  on dashboards silently render the first leg only. Merged charts are also
  invisible to chart-as-code (`CoderService.transformChart` never reads
  `merge`) and promotion.
- Composer execution today is author-gated: `FeatureFlags.MultiSourceQuery` +
  `manage Explore` (`QuerySourceService.ts:76-112`), plus per-source checks;
  compose additionally needs `FeatureFlags.ComposeSqlRunner`. Saved charts are
  viewer-visible via `view SavedChart` + space access.
- Saved pipelines must be self-contained: artifact pipelines referencing bare
  `queryUuid`s stop replaying when results expire
  (`docs/multi-source-query-platform-plan.md:37-44` — "copy-on-save pipeline
  expansion").
- Dashboard filters: the saved-chart contract is
  `applyDashboardFiltersForTile` → `addDashboardFiltersToMetricQuery` against
  an Explore (`packages/common/src/utils/filters.ts:1546,1606`); the SQL-chart
  contract is explicitly-mapped, dimension-only column filters
  (`isSqlColumn` targets, `getDashboardFilterRulesForTileAndReferences`
  `filters.ts:1017`, applied in `SqlQueryComposer.ts:160-190`). The
  filterable-field catalogue is built from saved-chart tiles only
  (`DashboardProvider.tsx:850-920`).

## Proposed approach

1. **Type**: `SavedChartQuery = { kind: 'metricQuery'; metricQuery } |
   { kind: 'composer'; queries: SourceQuery[]; terminalNodeId }`, surfaced on
   `SavedChart`/`SavedChartDAO`/`CreateSavedChartVersion`. Keep `metricQuery`
   on the wire for the classic variant (API back-compat); make every consumer
   switch exhaustive.
2. **DB**: one nullable `composer_query` jsonb column on
   `saved_queries_versions`; relax the NOT NULLs (or write sentinels) for
   composer rows; child tables simply have no rows for the composer variant.
   Composer charts use the new viz vocabulary, so `chart_config` stores
   `AllVizChartConfig` (or a data-app viz binding) discriminated by the query
   kind + `chart_type`/`chart_kind` mapping (decide in research).
3. **Copy-on-save expansion**: saving resolves any `queryUuid`-form
   references into in-pipeline nodes so the stored pipeline is fully
   self-contained.
4. **Execution**: a chart-scoped `executeAsyncComposerChartQuery` (and
   dashboard variant) that authorizes via `view SavedChart` + space access —
   *not* the ad-hoc `manage Explore` gate — then submits the pipeline and
   returns the terminal `queryUuid`. Thread the union through every entry
   point in the same change: saved-chart view, dashboard tile, scheduler
   delivery + exports, embed, validation, chart-as-code, promotion, version
   history/rollback.
5. **Dashboard filters**: a per-rule router — semantic-field rules push into
   each `semanticLayer` node whose explore has the field (reusing
   `addDashboardFiltersToMetricQuery` per node); column rules target the
   terminal node via the existing `isSqlColumn` mechanism. Register both
   target kinds in the dashboard's filterable-field catalogue.
6. **Authoring permission**: saving a pipeline containing `sql` nodes requires
   the SQL-chart authoring permission (`manage SqlRunner` / `CustomSql`
   equivalents); semantic-only pipelines align with saved-chart authoring.

## Out of scope

- Explorer editing of composer charts (refuse-and-redirect; authoring stays
  in agents for now).
- Reinterpreting classic charts (step 4).
- Folding `saved_sql` into `saved_queries` (end-state cleanup, after step 4).
- Date zoom and threshold alerts for composer charts (design in research,
  ship later).

## Open questions

- `chart_type` column vs `ChartKind` for composer charts' denormalised kind;
  how content listing (`ChartSourceType`) labels them.
- Node-level result caching across viewers/tiles (intermediate nodes are
  billed warehouse queries; `query_history` + cache-key machinery is most of
  the answer).
- Parameters: per-node `ParametersValuesMap` threading and dashboard
  parameter merging for multi-node pipelines.
- Whether `tableConfig.columnOrder` moves into the viz config
  (`VizColumnConfig.order`) for the composer variant.
- Feature-flag posture for viewing (a saved chart that viewers can't render
  because a flag is off is worse than not saving it).

## Research prompt

```
You are researching a change to the Lightdash monorepo (repo root: lightdash/lightdash).
Read docs/composer-viz-plan/README.md and docs/composer-viz-plan/03-saved-composer-charts.md
first — they define the goal: SavedChart's query becomes a discriminated union
(metricQuery | composer pipeline), stored as a nullable jsonb column on
saved_queries_versions, executed through chart-scoped authorized paths, and
threaded through EVERY consumer of SavedChart. Do not implement; produce a
concrete design doc whose centerpiece is an exhaustive consumer inventory.

Investigate and answer, with file/line evidence:

1. Consumer inventory (the critical deliverable). Enumerate every code path
   that reads SavedChart.metricQuery, SavedChartDAO, or DbSavedChartVersion
   fields, grouped by: execution (AsyncQueryService executeAsyncSavedChartQuery,
   executeAsyncDashboardChartQuery, ProjectService legacy paths, EmbedService,
   SchedulerTask, CsvService/ExcelService/GSheets, calculate-total,
   underlying-data), content (CoderService chart-as-code, PromoteService,
   ValidationService, CatalogService chart_usage, search/content listing,
   dbt exposures), and frontend (useSavedQuery, SavedExplorer,
   DashboardChartTile, chart version history/rollback). For each: what does
   the composer variant do — branch, degrade, or explicitly unsupported-with-
   error? Use the merge-query gaps (dashboard execution, as-code, promotion)
   as the checklist of what silent failure looks like.

2. Storage design. Read SavedChartModel.createSavedChartVersion and .get, the
   entities in packages/backend/src/database/entities/savedCharts.ts, and the
   merge precedent (saved_queries_version_merges migration 20260812230500).
   Specify: the composer_query jsonb shape (schema_version included), which
   NOT NULL columns must relax vs take sentinels, how get() hydrates the
   union, what last_version_chart_kind holds for composer charts, and the
   knex migration outline including release-safety declaration needs (see
   packages/backend/src/database/migrations/CLAUDE.md).

3. Authorization. Read QuerySourceService.throwIfCannotRunQueries, the
   per-source checks (SemanticLayerQuerySource, SqlQuerySource,
   DuckdbQuerySource), and how executeAsyncSavedChartQuery /
   executeAsyncDashboardSqlChartQuery authorize viewers (CASL SavedChart /
   CustomSql subjects, embed JWT branches). Design the chart-scoped composer
   execution wrapper: what a viewer needs, what saving requires when the
   pipeline contains sql nodes, and how feature flags gate authoring vs
   viewing. Use the ld-permissions skill conventions.

4. Dashboard filter router. Read applyDashboardFiltersForTile /
   addDashboardFiltersToMetricQuery (common/src/utils/filters.ts), the SQL
   column-filter path (getDashboardFilterRulesForTileAndReferences,
   SqlQueryComposer.ts:160-190, TileFilterConfiguration.tsx sqlChartTilesMetadata),
   and DashboardProvider's filterable-field catalogue. Design: per-rule
   routing to semantic nodes and/or terminal columns, how a composer tile
   registers BOTH target kinds, what happens to dashboard sorts, parameters,
   and date zoom (metricQuery.metadata.hasADateDimension derivation).

5. Copy-on-save expansion + caching. Define the save-time transform from an
   artifact pipeline (possibly referencing external queryUuids) to a
   self-contained pipeline, and evaluate node-level result reuse across
   viewers/tiles using query_history + cache metadata.

Deliverable: a design doc containing the SavedChartQuery type, the migration
outline, the exhaustive consumer table (path → behavior for composer variant),
the authz matrix, the filter-router design, and a phased PR breakdown (this
step is too big for one PR — propose vertical slices behind one feature flag,
per the breakup-pr conventions).
```
