# Step 4 — Classic charts interpreted as pipelines

Status: proposed
Depends on: step 3 (the union and the composer execution path exist)
Unblocks: step 5; the end-state of one execution path for all chart content

## Goal

Read the existing 90%+ of content — classic metric-query charts, and later SQL
charts — *through the composer lens*: an adapter maps a classic chart to a
single-node pipeline at the execution seam, so one code path serves both union
variants. Zero data migration, zero behavior change for single-node pipelines,
flag-gated with a parity harness proving equivalence before rollout.

## Current state

- `SemanticLayerSourceQuery` (`packages/common/src/types/querySources.ts:75`)
  mirrors `MetricQuery` **except**: `metricOverrides`, `dimensionOverrides`
  (viz-relevant format overrides applied in `QueryComposer.getFields()`),
  parameters, `pivotDimensions`, and `metadata` (e.g. `hasADateDimension`
  used by date zoom).
- The semanticLayer source already routes to
  `AsyncQueryService.executeAsyncMetricQuery`
  (`packages/backend/src/services/QuerySourceService/sources/
  SemanticLayerQuerySource.ts`) — the same execution machinery saved charts
  use — so a single-node pipeline is *already* the saved-chart path with a
  thin wrapper.
- Saved-chart execution today adds chart-scoped behavior around the metric
  query: filter overrides (`addFiltersToMetricQuery`), dashboard filters/
  sorts/parameters/date zoom (`executeAsyncDashboardChartQuery:6117-6320`),
  pivot derivation (`derivePivotConfigurationFromChart`), limit clamping
  (`applyMetricQueryLimit`), CSV cell limits, embed/JWT authorization.
- A SQL chart is likewise a single-`sql`-node pipeline: `sql` + `limit` map
  directly; its pivot already derives from viz config at execution time
  (`prepareSqlChartAsyncQueryArgs`).
- Merge charts map naturally too: `MergeQueryMetricSource[]` ≈ N
  semanticLayer nodes + a DuckDB join node — a candidate for retiring the
  bespoke merge execution path later.

## Proposed approach

1. **Close the node-fidelity gaps**: add `metricOverrides`,
   `dimensionOverrides`, and per-node parameters to
   `SemanticLayerSourceQuery` (additive optional fields; the tool zod schema
   in `toolComposerQueryArgs.ts` compiles against the canonical type, so both
   move together). Derive — don't store — `pivotDimensions` and
   date-dimension metadata.
2. **The adapter**: `savedChartToPipeline(chart): {queries, terminalNodeId}` —
   pure function in `packages/common`, unit-tested for round-trip fidelity
   (`pipeline → executed metric query` deep-equals `chart.metricQuery` after
   normalization).
3. **Seam placement**: inside `executeAsyncSavedChartQuery` /
   `executeAsyncDashboardChartQuery`, after chart-scoped mutations
   (dashboard filters, sorts, date zoom, parameter merging, limit clamping)
   are applied to the metric query — i.e. adapt the *effective* query, so all
   dashboard behavior stays in one place and works identically for both
   variants.
4. **Parity harness**: behind `FeatureFlags`, run both paths and compare
   compiled SQL (and/or result checksums) in dev/CI across a corpus of seeded
   charts; promote to default only when parity holds. The existing
   `docs/ai-agent-merge-query-parity.md` pattern is prior art.
5. **SQL charts second**: same adapter shape over `saved_sql`, unifying the
   tile/scheduler forks afterwards.

## Out of scope

- Rewriting stored rows (never).
- Retiring the legacy renderer or `ChartConfig` (classic charts keep their
  renderer; provenance-carrying columns from step 1 keep `useColumns.tsx`
  working).
- Merge-execution retirement (candidate follow-up, not this step).

## Open questions

- Whether single-node pipelines bypass `QuerySourceService` submission
  entirely (direct call, zero overhead) vs go through it for uniformity —
  performance and query_history semantics.
- Query-history/analytics continuity: `QueryExecutionContext` values, chart
  view analytics, and usage metrics must not shift when the flag flips.
- Result-cache key stability: the adapter must not change cache keys for
  identical queries, or every dashboard cold-loads on rollout.
- How `executeAsyncMetricQuery`'s warnings/fields response fields surface
  through the pipeline wrapper (the frontend consumes `fields: ItemsMap` from
  the execute response today).

## Research prompt

```
You are researching a change to the Lightdash monorepo (repo root: lightdash/lightdash).
Read docs/composer-viz-plan/README.md and docs/composer-viz-plan/04-classic-charts-as-pipelines.md
first — they define the goal: an adapter that interprets classic saved charts
(and later SQL charts) as single-node composer pipelines at the execution
seam, flag-gated, with a parity harness proving no behavior change.
Do not implement; produce a concrete design doc.

Investigate and answer, with file/line evidence:

1. Fidelity diff, exhaustively. Field-by-field compare MetricQuery
   (packages/common/src/types/metricQuery.ts) with SemanticLayerSourceQuery
   (packages/common/src/types/querySources.ts) AND compare what
   executeAsyncSavedChartQuery/executeAsyncDashboardChartQuery do around the
   metric query (filter overrides, dashboard filters/sorts, date zoom,
   parameter merging, limit clamping via applyMetricQueryLimit, timezone,
   pivot derivation, hasADateDimension metadata, embed authorization,
   analytics events) versus what QuerySourceService +
   SemanticLayerQuerySource.submitQuery pass through to
   executeAsyncMetricQuery. Produce the complete list of gaps and, for each:
   add to the node type, derive at execution, or keep in the chart-scoped
   wrapper.

2. Seam design. Given the gaps, decide where the adapter runs: (a) inside the
   two saved-chart execute methods after chart-scoped mutations (adapt the
   effective MetricQuery), (b) at QuerySourceService with chart context passed
   down, or (c) a new executeAsyncComposerChartQuery from step 3 that both
   variants converge into. Evaluate against: dashboard filter router (step 3),
   embed/JWT paths, scheduler delivery, and the frontend's dependence on the
   execute response carrying metricQuery + fields: ItemsMap
   (ApiExecuteAsyncMetricQueryResults, useDashboardChartReadyQuery).

3. Invariance requirements. Identify everything that must NOT change when the
   flag flips: result cache keys (find how cache keys are computed in the
   async query pipeline), query_history rows and QueryExecutionContext values,
   usage analytics (addChartViewEvent), csvCellsLimit behavior, and warnings.
   Specify how the adapter guarantees each.

4. Parity harness. Read docs/ai-agent-merge-query-parity.md for prior art.
   Design a harness that runs both paths over seeded charts (jaffle shop seed
   data) comparing compiled SQL and/or result checksums; where should it run
   (unit-level against QueryComposer output? integration in CI? shadow mode in
   dev?), and what normalization is needed for legitimate SQL differences.

5. SQL charts second wave. Sketch savedSqlChartToPipeline over saved_sql
   (sql, limit, config-derived pivot) and list what the SQL-chart execution
   path does that the sql-node path doesn't (parameter replacement, user
   attribute replacement, dashboard column filters, column discovery probe) —
   same gap-table treatment as question 1.

Deliverable: a design doc with the adapter signature and placement decision,
the complete gap table with per-gap resolution, the invariance checklist, the
parity-harness design, and a rollout plan (flag stages, corpus, abort
criteria).
```
