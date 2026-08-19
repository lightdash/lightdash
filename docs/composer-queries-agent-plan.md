# Composer Queries in the Agent Chat — Implementation Plan

Goal: the AI agent can execute **composer queries** — multi-source pipelines
(`SourceQuery[]` through `QuerySourceService`, see
[multi-source-queries.md](multi-source-queries.md)) — from agent chat, and each
run is stored as a chart artifact that renders a basic results table in the
thread. Scope is deliberately v0: web agent chat only, table rendering only,
render-from-result-id only. Sharing, re-execution, chart configs, and the
composer editor surface are out of scope but the artifact shape is chosen so
they are pure additions (see Follow-ups).

Naming: "composer query" is the product name for a multi-source submission.
It aligns with the shipped execution seam (`executeAsyncComposeSqlQuery`, the
`composeSqlRunner` context); code identifiers use `composer`.

## Design summary

- New agent tool `runComposerQueries` wrapping
  `QuerySourceService.executeSourceQueries` (service call, not HTTP), gated by
  the `multi-source-query` feature flag (`FeatureFlags.MultiSourceQuery`).
- The tool submits with `context: QueryExecutionContext.AI`, so `sql` nodes
  inherit the project's agent SQL scope with no new enforcement code — the
  scope check keys on context inside `AsyncQueryService.executeAsyncSqlQuery`
  (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
  `isAgentScopedQueryContext` branch), which the `sql` source funnels through.
  `duckdb` nodes read only referenced results (authorized at reference
  resolution), so the scope does not apply to them by construction.
- Results return to the model the way `runQuery`/`runSql` results do: inline
  CSV of the terminal node (existing truncation helpers), plus the terminal
  `ResultColumns` (the schema for the model's next step) and the terminal
  `queryUuid` (so a later submission can reference it via the map form of
  `references`).
- A new artifact chart-config source `'composer'` stores the full pipeline and
  the terminal result id. v0 renders the stored `lastQueryUuid` directly —
  the owner is the creator, so creator-scoped results auth just works and no
  new read endpoint is needed.

The artifact shape (the load-bearing decision — everything later is additive):

```ts
export type AiComposerChartArtifactConfig = {
    source: 'composer';
    schemaVersion: 1;
    /** The replayable pipeline. Node ids are always pinned (resolved ids from submission). */
    queries: SourceQuery[];
    /** Which node's result this artifact shows. */
    terminalNodeId: QueryNodeId;
    /** Snapshot of the terminal node's last run; rendering v0 reads only this. */
    lastQueryUuid: string;
};
```

`queries` is unused by v0 rendering but written from day one: the tool has it
in hand, artifact `chartConfig` is schemaless jsonb (no migration), and it is
what makes re-execution/sharing later a read-path change instead of an
artifact migration. Never ship a shape that is only `{ lastQueryUuid }`.

## Phase 1 — common contracts (`packages/common`)

1. **Artifact config type** — `src/ee/AiAgent/index.ts`: add
   `AiComposerChartArtifactConfig` (above) to the `AiChartArtifactConfig`
   union next to `AiSqlChartArtifactConfig`, plus an
   `isAiComposerChartArtifactConfig` guard mirroring
   `isAiSqlChartArtifactConfig`.
2. **Tool input schema** — `src/ee/AiAgent/schemas/tools/toolComposerQueryArgs.ts`:
   Zod union mirroring `SourceQuery` (discriminated on `sourceType`), plus the
   tool-level fields (optional `title`/`description` for the artifact, like
   `runSql`). Pin drift at compile time against the canonical TS types in
   `src/types/querySources.ts` (`satisfies z.ZodType<...>` on each member).
   Enforce the agent row-limit caps (`maxLimit` pattern from `runSql`) on
   every node's `limit`. The tool description must teach the workflow: name
   nodes with `nodeId`, reference them from `duckdb` SQL, referenced columns
   are the upstream result's `ResultColumns`, prior turns' results are
   referenced by `queryUuid` in the map form.
3. **Tool definition** — `schemas/tools/toolDefinitions.ts`: `defineTool` as
   `runComposerQueries`, `availability: ['agent', 'mcp']` (the MCP tool is the
   plan's MCP surface item, free from the same definition). Register in all
   three collections at the bottom of the file
   (`AgentToolDefinitionsByName`, `agentToolDefinitionsByName`,
   `builtInToolDefinitions`) and update the contract snapshot
   (`packages/backend/src/ee/services/ai/tools/agentToolContracts.snapshot.test.ts`).

## Phase 2 — backend tool (`packages/backend/src/ee`)

4. **Dependency type** — `services/ai/types/aiAgentDependencies.ts`:

   ```ts
   type RunComposerQueriesFn = (queries: SourceQuery[]) => Promise<{
       submissions: SourceQuerySubmission[]; // pinned nodeId → queryUuid
       terminal: {
           queryUuid: string;
           columns: ResultColumns;
           rows: Record<string, unknown>[]; // first page, capped
           rowCount: number;
       };
   }>;
   ```

5. **Implementation** — `AiAgentToolsService.runComposerQueries`, alongside
   `runSqlJob`. Inject `QuerySourceService` (core service, available from the
   `ServiceRepository`; add to the EE service's constructor args in
   `packages/backend/src/ee/index.ts`). Flow: `executeSourceQueries({account,
   projectUuid, queries, context: QueryExecutionContext.AI})` → poll the
   terminal node's status (`getSourceQueryStatuses`; polling only the terminal
   uuid is sufficient — its completion implies upstream completion and its
   error carries upstream failures) with the same bounded timeout as
   `runSqlJob` → fetch the first page via the standard async results path.
   Feature-flag check happens inside `executeSourceQueries` already
   (`throwIfMultiSourceQueryDisabled`); the CASL check for `sql` nodes
   (`manage SqlRunner`) is enforced by the source's wrapped execution path.
6. **Tool file** — `services/ai/tools/runComposerQueries.ts`
   (`getRunComposerQueries(deps)` factory, standard `tool({...})` shape):
   - Validate `terminalNodeId`: default to the unique sink (the one node no
     other node references); require it explicitly when the pipeline has
     multiple sinks. Reject empty pipelines.
   - **SQL approval**: when any node is `sql`, run the same per-thread human
     approval gate as `runSql` (`waitForSqlApproval` /
     `isThreadSqlAutoApproved` in `services/ai/tools/sqlApprovals.ts`,
     presenting each `sql` node's SQL). A pipeline with only
     `semanticLayer`/`duckdb` nodes needs no approval.
   - Execute via the dependency, then `createOrUpdateArtifact({ artifactType:
     'chart', vizConfig: { source: 'composer', schemaVersion: 1, queries:
     queriesWithPinnedNodeIds, terminalNodeId, lastQueryUuid } })` — pin node
     ids from the returned `submissions` before persisting.
   - Model-facing result: per-node `{nodeId, sourceType, queryUuid, status}`,
     terminal `ResultColumns`, inline CSV (reuse
     `convertQueryResultsToCsv` + truncation note helpers from `runQuery.ts`),
     and the terminal `queryUuid` stated in the text.
   - Errors through `toolErrorHandler`; upstream node failures surface with
     the failing node id so the model can fix the right query.
   - v0 surface: web chat only. In the Slack path, behave like `runSql`'s
     `isSlack` branch minus the artifact (CSV/summary only), or simply omit
     the tool from Slack assemblies — decide at implementation, but do not
     block v0 on Slack rendering.
7. **Assembly** — `services/ai/agents/agentV2.ts` `getAgentTools()`:
   construct with deps and spread gated on a new `enableComposerQueries`
   boolean on `AiAgentArgs`, resolved where the other flags are
   (`FeatureFlags.MultiSourceQuery` + agent settings toggle). Pipelines
   containing `sql` nodes additionally require the existing `canRunSql`;
   enforce at tool validation (reject `sql` nodes with a clear message when
   SQL is disabled) rather than hiding the whole tool.
8. **Frontend tool-call chip** — a description component under
   `frontend/src/ee/features/aiCopilot/components/ChatElements/ToolCalls/descriptions/`
   plus progress copy (`updateProgress('Running composer queries...')`).

## Phase 3 — frontend artifact rendering (v0: table from `lastQueryUuid`)

9. **`AiComposerArtifactVisualization.tsx`** — modeled on
   `AiSqlArtifactVisualization.tsx`, minus the viz-query round trip: feed the
   stored `lastQueryUuid` straight into
   `useInfiniteQueryResults(projectUuid, lastQueryUuid)` (the hook already
   pages the standard results endpoint and returns `columns`), derive the
   `VizTableConfig` from `ResultColumn[]` exactly as the SQL component does,
   render `ChartDataTable`.
   - **Designed expiry state**: on 404/410/403 (results expired or viewer is
     not the creator), render an intentional empty state — "These results have
     expired — ask the agent to re-run this query" — not an error card. This
     is the v0 trade-off made visible; the re-execution fallback in
     Follow-ups replaces it.
10. **Dispatch** — `AiArtifactPanel.tsx`: branch on
    `isAiComposerChartArtifactConfig` next to the existing `isSqlArtifact`
    branch, skipping the `useAiAgentArtifactVizQuery` handle for composer
    artifacts in v0.
11. **Quick actions**: none in v0 — no save (needs the saved object), no
    explore-from-here (needs the composer surface). Keep View SQL for the
    terminal `duckdb` node's SQL if cheap; otherwise omit.

## Validation

- `pnpm -F common test` / `lint` / `typecheck` (schema drift assertions, type
  guards), `pnpm -F backend test:dev:nowatch` (tool contract snapshot,
  `AiAgentToolsService.runComposerQueries` unit tests with a mocked
  `QuerySourceService`, approval-gate test for `sql` nodes),
  `pnpm -F frontend lint` / `typecheck`.
- No controller changes → no `pnpm generate-api` needed; artifact
  `chartConfig` is jsonb → no migration.
- Manual: seeded dev project, agent thread running the doc's example pipeline
  (sql + semanticLayer + duckdb join); confirm artifact renders the joined
  table, confirm agent SQL scope blocks an out-of-scope `sql` node, confirm
  the expiry empty state by shortening the results TTL locally.

## Follow-ups (explicitly not v0, unblocked by the artifact shape)

- **Re-execution fallback**: a `'composer'` branch in
  `AiAgentService.getArtifactVizQuery` that resubmits `queries` as the viewer
  and refreshes `lastQueryUuid` — the SQL branch is the template, including
  its embed guard (forbid in embedded agents when the pipeline contains a
  `sql` node, mirroring the raw-SQL/user-attributes rule).
- **Chart configs**: optional `vizConfig: AllVizChartConfig` on composer *and*
  sql artifacts, model-generated at tool time and validated against the
  terminal `ResultColumns` — one piece of work that gives both sources charts
  via the generic viz stack.
- **Save/share**: the composer saved object (`queries` + viz config,
  copy-on-save, replay-as-viewer) and the composer viewer/editor surfaces —
  see the viz-stack items in
  [multi-source-query-platform-plan.md](multi-source-query-platform-plan.md).
