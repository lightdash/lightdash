# Lightdash Backend Query Generation Resources

## Knowledge

- [Lightdash docs: Joins reference — fanouts and relationships](https://docs.lightdash.com/references/joins)
  Defines join relationships, primary keys, directionality, and fanout handling. Use for: user-facing semantics of fanout protection.
- [Lightdash docs: Period-over-period guide](https://docs.lightdash.com/guides/period-over-period)
  Explains period comparison workflows and examples. Use for: user-facing intent before backend SQL mechanics.
- [`packages/backend/src/utils/QueryBuilder/CLAUDE.md`](packages/backend/src/utils/QueryBuilder/CLAUDE.md)
  Local map of query builders and pivot CTE modes. Use for: high-level architecture and pivot boundaries.
- [`packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`](packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts)
  Main semantic SQL builder. Use for: joins, metric SELECTs, fanout CTEs, distinct metric CTEs, PoP CTEs, alias rewriting.
- [`packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`](packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts)
  Pivot SQL wrapper. Use for: `original_query`, `group_by_query`, `pivot_query`, row/column ranks, sort anchor CTEs.
- [`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`](packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts)
  Query execution and streaming pivot row transformation. Use for: how long pivot SQL rows become wide result rows.
- [`packages/common/src/types/pivot.ts`](packages/common/src/types/pivot.ts)
  `PivotConfig` and `PivotConfiguration` types. Use for: vocabulary and fields passed to `PivotQueryBuilder`.
- [`packages/common/src/pivot/derivePivotConfigFromChart.ts`](packages/common/src/pivot/derivePivotConfigFromChart.ts)
  Derives `PivotConfiguration` from saved chart config and metric query. Use for: how table/cartesian chart settings become backend pivot instructions.
- [`packages/common/src/types/periodOverPeriodComparison.ts`](packages/common/src/types/periodOverPeriodComparison.ts)
  PoP helper metadata and generated additional metric construction. Use for: generated metric IDs, labels, and comparison keys.

## Wisdom (Communities)

- Lightdash backend/query-builder PR review
  Best place to test edge-case assumptions against maintainers.
- Jess Hitchcock / Analytics Engineering Advocate review
  Internal high-context reviewer for fanout and period-over-period semantics.
