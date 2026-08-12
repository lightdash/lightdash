# External pre-aggregates — known issues

Found during ZAP-833 validation (2026-08-12). High → low priority.

## 1. Settings UI: external defs indistinguishable from managed

Materializations table shows external defs with "Never materialized" + "Manual"
refresh + a per-row rebuild button, and includes them in "Rebuild all". Reads
as broken/materializable while the def is live and serving hits; backend
rejects the rebuild but the UI invites it. Detail drawer omits the def name and
any external/source-table indication. Needs an External badge, source table
info, hidden rebuild actions, and different empty-state wording.

## 2. Miss reason cites the wrong dimension (pre-existing)

Explore miss tooltip reports the missing dim of the fewest-dims candidate, not
the dim that caused the miss (e.g. adding `order_id` reports "Dimension not in
pre-aggregate: orders_order_source"). Matcher should attribute the reason to
the closest-to-matching def or the offending field.

## 3. Trace attribute inconsistency on external executions

Parent span `ProjectService.executeAsyncQuery` has
`lightdash.executionSource=pre_aggregate_warehouse`, but child spans
(`query.execute.warehouse`, `s3.results.upload`) say `warehouse` —
`runAsyncWarehouseQuery` derives the source only from `warehouseClientOverride`.
External pre-agg executions are indistinguishable from normal warehouse runs
when filtering child spans.

## 4. Code polish from review

- `ResolvePreAggregationDuckDbArgs` / `PreAggregationDuckDbResolveReason` are
  now shared by both engines — rename engine-neutral.
- `'duckdb' | 'project_warehouse'` union defined in 3 places
  (`common/types/queryHistory.ts`, `database/entities/queryHistory.ts`,
  `services/AsyncQueryService/types.ts`) — define once.
- Engine → span/analytics label ternary repeated ~4× in `AsyncQueryService.ts`
  — collapse to one map.
