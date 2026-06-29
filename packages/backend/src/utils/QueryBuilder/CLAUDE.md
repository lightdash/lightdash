<summary>
SQL generation and transformation utilities for Lightdash queries.
Three main builders: MetricQueryBuilder (metrics/dimensions with joins), PivotQueryBuilder (flat → pivot table with row/column indexes), SqlQueryBuilder (SQL charts with filtering).
PivotQueryBuilder does NOT pivot data — it generates SQL that tags each row with `row_index` and `column_index` metadata via DENSE_RANK(). The actual pivoting happens downstream in AsyncQueryService.runQueryAndTransformRows.
</summary>

<howToUse>

**MetricQueryBuilder** — builds the base SQL from an Explore + MetricQuery (dimensions, metrics, filters, joins, table calculations). Handles fan-out protection via CTEs and period-over-period comparisons.

```typescript
import { MetricQueryBuilder } from './MetricQueryBuilder';

const builder = new MetricQueryBuilder({
    explore,
    compiledMetricQuery,
    warehouseSqlBuilder,
    userAttributes,
    intrinsicUserAttributes,
    parameters,
    parameterDefinitions,
    timezone,
});
const { query, fields, warnings } = builder.buildQuery();
```

**PivotQueryBuilder** — wraps a flat SQL query and adds `row_index` / `column_index` metadata for pivot table rendering.

```typescript
import { PivotQueryBuilder } from './PivotQueryBuilder';

const pivotBuilder = new PivotQueryBuilder(
    query, // flat SQL (typically from MetricQueryBuilder)
    pivotConfiguration, // { indexColumn, valuesColumns, groupByColumns, sortBy }
    warehouseSqlBuilder,
    limit,
    itemsMap,
);
const sql = pivotBuilder.toSql({ columnLimit: 100 });
```

**SqlQueryBuilder** — builds queries for SQL charts (user-written SQL with filters and parameter replacement).

```typescript
import { SqlQueryBuilder } from './SqlQueryBuilder';

const builder = new SqlQueryBuilder(
    {
        referenceMap,
        select,
        from: { name, sql: userSql },
        filters,
        parameters,
        limit,
    },
    warehouseConfig,
);
const { sql, parameterReferences } = builder.getSqlAndReferences();
```

</howToUse>

<importantToKnow>

**Three CTE pipeline modes** depending on configuration:

1. **Simple** (no groupByColumns): `original_query → group_by_query → SELECT with ORDER BY + LIMIT`. No pivoting, no row/column indexes.

2. **Dimension sort** (groupByColumns present, sorting by dimension/index columns): `original_query → group_by_query → pivot_query → filtered_rows → total_columns`. `pivot_query` computes `row_index` and `column_index` inline with DENSE_RANK. No anchor CTEs.

3. **Metric sort** (sorting by a value column): anchor windows folded into the ranking CTEs:

```mermaid
graph TD
    A[original_query] --> B[group_by_query]
    B --> D["column_ranking — DENSE_RANK for col_idx; FIRST_VALUE column anchor folded into a nested scan of group_by_query"]
    D --> E["anchor_column — picks col_idx = 1 (reads column_ranking)"]
    E --> G["row_ranking — DENSE_RANK for row_index; MAX(CASE) row anchor folded into a nested scan of group_by_query CROSS JOIN anchor_column"]
    B --> G
    D --> H["pivot_query — JOINs row_ranking + column_ranking"]
    G --> H
    B --> H
    H --> I[filtered_rows + total_columns]
```

**Metric sorting anchor system**: When users sort by a metric, rows are ordered by that metric's value in the _first pivot column only_ (the anchor column), not by MIN/MAX across all columns. The anchor column is determined by `column_ranking` (`col_idx = 1`).

**Anchors folded into rankings (PROD-8441)**: The column anchor (`FIRST_VALUE` per groupBy value, aliased `${ref}_ca_value`) and row anchor (`MAX(CASE …)` metric value at the anchor column, aliased `${ref}_ra_value`) are computed inside a nested subquery (aliased `g`) within `column_ranking` / `row_ranking` respectively — not as standalone `{ref}_ca` / `{ref}_ra` CTEs. This keeps `group_by_query` referenced ~3× on the metric-sort path (once per nested anchor scan + once by `pivot_query`) instead of ~6×, which matters on inlining engines like Trino (`query.max-stage-count`). It is also more robust for Databricks/Spark: the anchor value lives in the same scan as the ranking Window, so there is no cross-CTE column reference for an inliner to lose. `anchor_column` (and the per-metric `{ref}_anchor_column` pinned variant) stays its own CTE — it reads `column_ranking`, not `group_by_query`.

**Precomputed rankings for Databricks/Spark**: Databricks inlines CTEs instead of materializing them. When `pivot_query` had inline DENSE_RANK with anchor column references, Spark couldn't resolve them across the inlined CTE boundary. Fix: `row_ranking` and `column_ranking` are self-contained CTEs (each folding its own anchor scan); `pivot_query` just JOINs the precomputed results. This activates automatically when metric sorting + index columns are present.

**Single-scan addendum (warehouses without CTE materialization)**: Some engines (Trino, Athena) never materialize a CTE, so each reference to `group_by_query` re-runs its whole lineage (base scan + filters + GROUP BY) — the 3-CTE precomputed form references it 3× and so scans the base ~4 times. On the metric-sort path these engines instead collapse `column_ranking` + `anchor_column` + `row_ranking` into a single self-contained `pivot_query` that scans `group_by_query` **once**: the column anchor, column rank, row anchor and row rank become a stack of window functions over one nested scan rather than separate CTEs joined back together. It's equivalent because each anchor value is constant within its combo, so dropping the `SELECT DISTINCT` leaves the ranks unchanged. Gated on a capability — `warehouseSqlBuilder.supportsCteMaterialization()` returning false — not on the adapter type; it defaults to true, so every other dialect (including Databricks/Spark, which reuses its computed CTE result) keeps the 3-CTE form unchanged.

**Anchor value aliasing**: The folded anchor value columns keep the `${ref}_ca_value` / `${ref}_ra_value` aliases (resolved against the nested derived table `g`). The `_ca`/`_ra` suffixes are kept short to stay within Postgres' 63-char identifier limit when field references are long. Hardcoded CTE names (`row_ranking`, `pivot_query`, etc.) don't need quoting.

**Two-phase pivot**: PivotQueryBuilder outputs rows tagged with `row_index` + `column_index`. The actual pivot (spreading values into `{field}_{aggregation}_{groupByValue}` columns) happens in `AsyncQueryService.runQueryAndTransformRows` which streams results and pivots on `row_index` changes.

</importantToKnow>

<links>

- @/packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts — Query execution and pivot result streaming
- @/packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts — PivotQueryBuilder tests (all CTE paths)
- @/packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.test.ts — MetricQueryBuilder tests
- @/packages/backend/src/utils/QueryBuilder/parameters.ts — Parameter replacement (safe + raw modes)
- @/packages/backend/src/utils/QueryBuilder/utils.ts — SQL parsing, sort helpers, join utilities
- @/packages/warehouses/src/warehouseSqlBuilder.ts — Dialect-specific SQL builders
- @/packages/common/src/types/pivot.ts — PivotConfiguration types

</links>
