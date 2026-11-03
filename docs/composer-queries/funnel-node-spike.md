# Spike: a funnel as a composer node

Status: spike, 2026-11-03. Read-only lineage cell first; editing later.

## Question

Can a conversion funnel be one of the node kinds the query composer runs,
declared like a metric query (no SQL written by the user), reusing the
funnel builder's SQL logic, and shown in the Lineage tab like any other cell?

## Answer

Yes, with three small pieces, none of which touch the engine:

1. **Model.** `FunnelSourceQuery` is a new member of the `SourceQuery` union
   (`packages/common/src/types/querySources.ts`), discriminated by
   `QuerySourceType.FUNNEL`. Its fields are the funnel builder's
   `FunnelQueryRequest` plus the node envelope (`nodeId`, `title`,
   `description`, `limit`): explore, the three event fields (who / when /
   what), ordered steps, date range, conversion window, optional breakdown.
   It reads no other node, so it is a **source node** in the Lineage.
2. **Backend.** `FunnelQuerySource` implements `QuerySourceClient`: it loads
   the explore, compiles the funnel with the SQL generator extracted from
   `FunnelService` (`services/FunnelService/funnelSql.ts`) and submits the
   compiled SQL through `executeAsyncSqlQuery`, exactly as `SqlQuerySource`
   does. Registered in `QuerySourceRegistry.withBuiltInSources` behind the
   existing `funnelBuilder.enabled` config (on in PR mode). The result
   columns are a fixed contract downstream DuckDB nodes can read:
   `step_order, step_name, total_users, conversion_rate,
   step_conversion_rate, median_time_to_convert[, breakdown_value]`.
3. **Frontend.** The Lineage cell renders `FunnelNodeDetails` where a
   semantic cell renders its metric-query details. Node icon, type label
   ("Funnel") and the explore toolbar come from the same switch sites every
   other kind uses (`nodeTypeIcon`, `nodeTypeLabelOf`, `NodeQuery`).

Everything else (statuses, row counts, results toggle, lineage lines,
"Add to chat") works unchanged because the node flows through the standard
async query pipeline.

## Cell information architecture

What a reader must get from the cell, in priority order:

1. **The steps, in order, and the rule between them.** Event A, then B, then
   C; a user counts in a step only after every earlier one; the next step
   must happen within the window. This is the funnel; it leads.
2. **Who, when, what.** The explore and the three fields the funnel reads:
   user id, timestamp, event name. Without them the steps are just words.
3. **Scope.** Date range scanned; breakdown dimension when set (and that a
   user converts only within the same breakdown value).
4. **What it returns.** One row per step (per breakdown value), with the
   fixed columns. Readers of the pipeline need this to follow the DuckDB
   node that reads the funnel.
5. **After a run:** users and conversion per step. Already available through
   the results toggle; a compact per-step strip is an option (variant C).

Variants explored (screenshots in the PR / thread):

- **A. Rows.** The semantic-cell idiom: icon-led rows for Steps, Source,
  Range, Breakdown, Returns. Lowest novelty, instantly consistent.
- **B. Spine.** The steps as a vertical numbered spine with the window
  written between steps; source and scope as a footer line.
- **C. Sentence + strip.** A declarative sentence ("Of users who viewed a
  page, how many went on to …, each within 7 days, over the last 30 days,
  by device type?") and, after a run, a per-step bar strip with users and
  conversion.

## Out of scope, in order of value

1. **Agent write path.** A `funnel` node kind in the composer tool schema
   (`toolComposerQueryArgs.ts`) so the agent can author funnels; today only
   the public query-sources API can submit one. Small: a Zod shape mirroring
   `FunnelSourceQuery` plus a `toSourceQuery` case.
2. **Hand-built editor.** The funnel builder's sidebar already edits exactly
   these fields; it can become the cell's edit mode once the composer has
   per-node editing.
3. **Authorization.** The compiled SQL runs through the SQL runner path, so
   the node needs `manage:SqlRunner` like the funnel builder does today. A
   compiled, explore-bound query should eventually be gated like a metric
   query (view explore), which needs an AsyncQueryService entry for compiled
   SQL over an explore binding.
4. **Compiled SQL panel.** Semantic cells show their compiled SQL through
   `useCompiledSqlFromMetricQuery`; funnels have no compile endpoint yet.
5. **Funnel as a transformation.** The SQL generator assumes a base table.
   Running the same shape in DuckDB over a referenced node's rows (events
   from an API or Python node) would make funnels composable rather than
   only a source. Same cell, one more `references` field.
6. **Retire the `/funnel/*` REST endpoints** in favour of query sources once
   the builder page runs on a funnel node.
