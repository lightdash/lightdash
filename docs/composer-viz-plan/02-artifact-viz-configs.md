# Step 2 — Viz configs on composer and SQL artifacts

Status: proposed
Depends on: step 1 (formatted, labelled columns make the charts worth looking at)
Unblocks: step 3 ("save as chart" becomes a metadata operation)

## Goal

An AI agent run that produces a composer (or SQL) artifact can also produce a
chart, not just a raw table: an optional `vizConfig: AllVizChartConfig` stored
on the artifact, validated against the terminal node's `ResultColumns`, and
rendered through the existing SQL-chart data models. This retires the fourth
viz vocabulary (LLM tool-args JSON) for new artifact types and gives agent
output and saved content the same render path.

This step was already sketched in `docs/composer-queries-agent-plan.md:189-192`
and `docs/multi-source-query-platform-plan.md` ("Viz stack" section); this doc
scopes it.

## Current state

- `AiComposerChartArtifactConfig` (`packages/common/src/ee/AiAgent/
  composerArtifact.ts`) has no viz config: `{source, schemaVersion, queries,
  terminalNodeId, lastQueryUuid}`. `AiSqlChartArtifactConfig` likewise stores
  only `{sql, limit}`.
- Rendering is table-only: `AiArtifactPanel.tsx:111-159` composer branch feeds
  `lastQueryUuid` into `useInfiniteQueryResults` →
  `AiComposerArtifactVisualization` → `AiArtifactTableVisualization`
  (raw-unwrapped `ChartDataTable`). The chart-type switcher is gated on
  `AiResultType.QUERY_RESULT` and never reached.
- The render machinery to reuse exists end-to-end in the SQL-chart stack:
  `SqlChartResultsRunner` (constant-function runner over already-pivoted
  results), `getChartDataModel`, `CartesianChartDataModel.getSpec`,
  `ChartView`/`BigNumberView`/`Table`
  (`useSavedSqlChartResults.tsx` shows the whole flow).
- Pivot is the open mechanical question: cartesian/pie/big-number configs need
  pivoted data. SQL charts get it by executing with a `PivotConfiguration`
  derived from `config.fieldConfig` (`prepareSqlChartAsyncQueryArgs`,
  `AsyncQueryService.ts:8517-8528`). The compose/DuckDB execution path's pivot
  support is unverified.
- Tool surface: `runComposerQueries` already takes `title`/`description` and
  writes the artifact (`packages/backend/src/ee/services/ai/tools/
  runComposerQueries.ts:193-211`); the semantic path has separate viz tools
  (`toolVerticalBarArgs` etc.) — a design decision is whether composer viz is
  an argument, a follow-up tool, or model-authored config validated post hoc.

## Proposed approach

1. Extend `AiComposerChartArtifactConfig` (and `AiSqlChartArtifactConfig`)
   with `vizConfig?: AllVizChartConfig` (schemaVersion bump; jsonb column is
   schemaless so no migration).
2. Agent emits the config — likely as nullable args on `runComposerQueries`
   (zod mirror of `AllVizChartConfig`, LLM-friendly nullable fields) —
   validated server-side against the terminal `ResultColumns`
   (references exist, x is time/category-compatible, y are aggregatable).
   Invalid config degrades to table + a model-actionable error, never a
   failed run.
3. Frontend: composer artifact branch builds a results runner from the
   terminal query results and dispatches on `vizConfig.type` exactly like
   `DashboardSqlChartTile` does; table remains the fallback and the
   "show underlying results" toggle.
4. Pivoted execution for the terminal node when the config needs it —
   mechanism per research below (extend the compose path with
   `PivotConfiguration`, or re-run the terminal node through the
   pivot-capable SQL path against the referenced CTEs).

## Out of scope

- Saving artifacts as charts (step 3).
- Data-app viz bindings on artifacts (possible later extension; note the
  copilot currently has no awareness of `ChartType.DATA_APP_VIZ`).
- Retiring the existing semantic-artifact tool-arg vocabulary (works today;
  converge in step 5).

## Open questions

- Where the viz config is authored: same tool call vs a separate
  `configureViz` tool the model can call after seeing terminal columns
  (columns are only known post-execution — the tool result already lists
  them, so a same-call config is authored blind unless the model re-runs).
- Pivot on the compose path: does `executeAsyncComposeSqlQuery` accept a
  `PivotConfiguration` today? If not, is DuckDB-side pivot (native `PIVOT`)
  preferable to routing through `PivotQueryBuilder`?
- Palette resolution for artifacts (org/project palette — SQL charts resolve
  via `resolvedColorPalette`; artifacts have no space/dashboard context).
- Slack rendering: keep table-only, or port `getSpec` output to the Slack
  image path?

## Research prompt

```
You are researching a change to the Lightdash monorepo (repo root: lightdash/lightdash).
Read docs/composer-viz-plan/README.md and docs/composer-viz-plan/02-artifact-viz-configs.md
first — they define the goal: an optional vizConfig (AllVizChartConfig) on
composer and SQL AI artifacts, validated against the terminal node's result
columns and rendered through the existing DataViz data-model stack.
Do not implement; produce a concrete design doc.

Investigate and answer, with file/line evidence:

1. Pivot feasibility on the compose path. Trace executeAsyncComposeSqlQuery →
   runComposeSqlQuery → runDuckdbSqlQuery in packages/backend/src/services/
   AsyncQueryService/AsyncQueryService.ts and determine whether a
   PivotConfiguration can be applied there today. Compare with how
   prepareSqlChartAsyncQueryArgs + SqlQueryComposer + PivotQueryBuilder do it
   for SQL charts (packages/backend/src/utils/QueryBuilder/). Evaluate: (a)
   route the terminal DuckDB query through PivotQueryBuilder, (b) use DuckDB
   native PIVOT, (c) re-execute the terminal node via the SQL path with the
   referenced CTEs inlined. Recommend one with tradeoffs (S3 round-trips,
   result-cache reuse, pivotDetails fidelity).

2. Tool-surface design. Read packages/backend/src/ee/services/ai/tools/
   runComposerQueries.ts, the zod schemas in packages/common/src/ee/AiAgent/
   schemas/tools/ (esp. toolComposerQueryArgs.ts and how AllVizChartConfig
   maps to an LLM-friendly nullable zod shape), and how semantic viz tools
   (toolVerticalBarArgs etc.) flow into artifacts. Decide: vizConfig as args
   on runComposerQueries vs a follow-up configureViz tool vs both, given that
   terminal columns are only known after execution. Specify the validation
   rules against ResultColumns and the degrade-to-table behavior.

3. Frontend render path. Map exactly what the composer branch of
   AiArtifactPanel.tsx needs to reuse from useSavedSqlChartResults.tsx /
   SqlChartResultsRunner / getChartDataModel to render vizConfig, including
   where pivoted data comes from (getPivotQueryResults unpacking pivotDetails)
   and how the chart-type switcher + save/export quick actions
   (currently gated on AiResultType.QUERY_RESULT) extend to composer
   artifacts. Note palette resolution options.

4. Artifact schema evolution. Check parseAiArtifactChartConfig
   (packages/common/src/ee/AiAgent/utils.ts) and the artifact version tables:
   how does schemaVersion bump + optional field addition interact with
   existing rows and with the transcriptToolPolicy / threadDumpSanitizer
   shaping of tool results?

5. Replayability interaction. The artifact stores lastQueryUuid and results
   expire (see AiComposerArtifactVisualization expiry state). If vizConfig
   needs pivoted execution, define what "re-run" means for an expired
   artifact and whether the pipeline-expansion issue flagged in
   docs/multi-source-query-platform-plan.md must be fixed in this step.

Deliverable: a design doc with the extended artifact config type, the chosen
tool surface (zod schema sketch), the pivot mechanism decision, the frontend
component/data-flow diagram, and a test plan covering the agent tool contract
snapshot tests (agentToolContracts.snapshot.test.ts) and runComposerQueries.test.ts.
```
