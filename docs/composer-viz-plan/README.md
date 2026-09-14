# Charts on Composer Queries — Plan Index

Status: proposed (investigation complete, no implementation)
Date: 2026-08-24

## Goal

Collapse Lightdash's parallel chart stacks (saved metric-query charts, saved SQL
charts, AI artifacts, metrics-explorer output) onto one architecture:

- **Query stack**: composer queries (`SourceQuery[]` pipelines,
  `packages/common/src/types/querySources.ts`). A classic chart is a
  single-`semanticLayer`-node pipeline; a SQL chart is a single-`sql`-node
  pipeline.
- **Interface**: the generic v2 results shape
  (`ReadyQueryResultsPage`: rows + columns + pivotDetails), enriched with
  enough column metadata (label, format, provenance) to drive visualization.
- **Viz stack**: the newer column-addressed viz system (`AllVizChartConfig` +
  `IResultsRunner` + data models) for built-ins, and data app custom vizzes
  (`DataAppVizSchema` bindings) as the extensible end.

Background and full findings: see the investigation report (internal artifact,
"Charts on Composer Queries") and the prior in-repo docs
`docs/multi-source-queries.md`, `docs/multi-source-query-platform-plan.md`,
`docs/composer-queries-agent-plan.md`.

## The sequence

Each step ships value on its own and none blocks on migrating existing chart
configs. Each doc ends with a **research prompt**: a self-contained brief to
hand to a fresh research agent to turn the plan into a concrete design.

| Step | Doc | One-liner |
|---|---|---|
| 1 | [01-enrich-result-columns.md](01-enrich-result-columns.md) | Add label/format/provenance to `ResultColumn` so generic results can drive viz |
| 2 | [02-artifact-viz-configs.md](02-artifact-viz-configs.md) | Optional `AllVizChartConfig` on composer + SQL artifacts; agent output gets real charts |
| 3 | [03-saved-composer-charts.md](03-saved-composer-charts.md) | `SavedChart` query becomes a discriminated union; save/share/tile composer charts |
| 4 | [04-classic-charts-as-pipelines.md](04-classic-charts-as-pipelines.md) | Interpret existing charts as single-node pipelines at the execution seam |
| 5 | [05-viz-config-convergence.md](05-viz-config-convergence.md) | Opportunistically converge the four viz config vocabularies |

Cross-cutting: [perf-instrumentation.md](perf-instrumentation.md) — query-path
instrumentation and before/after dashboard plan for the view-time formatting
migration (ships before any behavior flag flips).

## Design tenets (apply to every step)

1. **Union, not optional.** `metricQuery` never becomes `metricQuery?:`.
   Query kind is a discriminated union so `assertUnreachable` finds every
   consumer at compile time.
2. **The merge-query lesson.** `executeAsyncSavedChartQuery` handles
   `savedChart.merge`; `executeAsyncDashboardChartQuery` never reads it, so
   merged charts silently render wrong on dashboards. Any new query kind must
   be threaded through *every* execution entry point in the same change.
3. **Interpretation before migration.** Existing rows are never rewritten;
   classic charts are *read* through the composer lens via adapters.
4. **Pivot belongs to the viz layer**, derived at execution time from the viz
   config (the SQL-chart precedent: `fieldConfig` → `PivotConfiguration`), not
   stored on query nodes.
5. **Query unification ≠ config migration.** The classic `ChartConfig` tail
   (pivot tables with subtotals, conditional formatting, custom Vega, maps…)
   keeps its legacy renderer indefinitely; step 5 is opportunistic.
