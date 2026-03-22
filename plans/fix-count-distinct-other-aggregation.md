# Fix "Other" Group Aggregation for All Metric Types

## Problem

When grouping pivot/chart series into top-N + "Other", the current implementation re-aggregates already-aggregated metric values. That is wrong for non-additive metrics.

**Example:**

```text
Top N keeps regions A and B
All other regions are merged into "Other"

If customer 123 appears in both region C and region D:
- SUM(COUNT_DISTINCT(customer_id)) counts customer 123 twice
- COUNT(DISTINCT customer_id) over the merged "Other" bucket counts it once
```

Affected metric types: `COUNT_DISTINCT`, `SUM_DISTINCT`, `AVERAGE_DISTINCT`.

The same architecture also produces wrong results for `AVERAGE`, `MEDIAN`, and `PERCENTILE` — those are currently forced to `drop` because the code correctly identifies them as non-additive, but the underlying reason is the same: you cannot re-aggregate pre-aggregated values for non-additive metrics.

### Evidence from live reproductions

- `COUNT_DISTINCT` on `customers_unique_customer_count` grouped by `orders_order_date_month` with `maxGroups = 2`:
  - pivoted "Other" = 87, true excluded-month union = 70, overcount delta = 17
- `SUM_DISTINCT` on `customers_total_order_amount_deduped` grouped by `payments_payment_method` with `maxGroups = 2`:
  - pivoted "Other" = 2969.36, true deduped excluded-group sum = 2650.41, overcount delta = 318.95
- `AVERAGE_DISTINCT` on `customers_avg_order_amount_deduped` grouped by `payments_payment_method`:
  - pivoted "Other" = 27.7228, true deduped average = 27.3429, delta = 0.3799

## Root Cause

The current pipeline works exclusively on `original_query`, which is already aggregated:

```
raw rows
  → GROUP BY (in MetricQueryBuilder)
  → original_query (one row per group, metrics already aggregated)
  → pre_group_by (re-aggregate by groupBy columns)
  → __group_ranking (rank groups by metric value)
  → group_by_query (CASE WHEN rank <= N … ELSE 'Other', re-aggregate metrics)
```

The final re-aggregation in `group_by_query` uses `otherAggregation` (SUM/MIN/MAX) on the pre-aggregated values. This is correct for additive metrics (SUM, COUNT, MIN, MAX) but wrong for everything else.

## Solution: Single Raw-Row Bucketed Path

### Key insight from industry research

Every BI tool that handles this correctly (Looker, Tableau, Superset, Sigma) does the same thing: **bucket assignment happens before aggregation**. They never aggregate first and re-aggregate second.

The current plan's complexity came from trying to maintain two parallel paths (fast additive path + raw distinct path), which created a "mixed chart" problem requiring a phased rollout. Instead, use **one path for all metrics** when "Other" is enabled.

### Design

```
                          Two modes, not four strategies

  Group limit disabled               Group limit enabled with "Other"
  or no groupBy columns?             ───────────────────────────────
  ────────────────────
                                      1. original_query → ranking (existing)
  Current path, unchanged.            2. pivot_source → raw rows (new)
  No changes needed.                  3. bucket assignment on raw rows
                                      4. single aggregation pass for ALL metrics
```

This eliminates:
- The mixed chart problem (all metrics go through one path)
- The strategy pattern (two modes: off or bucketed)
- The phased rollout (all supported metric types from day one)
- The `reAggregation` metadata on `ValuesColumn` (compiler just emits raw expressions)

### New pipeline when "Other" is enabled

```
1. original_query
   Already aggregated. Used for ranking only.

2. pre_group_by
   Current pivot pre-aggregation over original_query. Used for ranking.

3. __group_totals / __group_ranking
   Current top-N ranking logic. Unchanged.

4. __pre_group_scope
   DISTINCT groupBy + index combinations from pre_group_by.
   Preserves metric-filtered row scope — prevents excluded rows from leaking
   back into "Other" via the raw path.

5. pivot_source
   Raw row relation built by MetricQueryBuilder.
   One raw input column per metric + dimension aliases + order columns.

6. scoped_source
   pivot_source INNER JOIN __pre_group_scope.
   Keeps only raw rows that belong to grouped rows that survived filters.

7. bucketed_source
   CASE WHEN rank <= N THEN group ELSE 'Other' END.
   Bucket assignment happens here, before any metric aggregation.

8. group_by_query
   Single aggregation pass over bucketed_source for ALL metrics.
   - SUM: SUM(raw_col)
   - COUNT: COUNT(raw_col)  or  COUNT(*)
   - MIN/MAX: MIN/MAX(raw_col)
   - COUNT_DISTINCT: COUNT(DISTINCT raw_col)
   - SUM_DISTINCT: dedup CTE + SUM
   - AVERAGE_DISTINCT: dedup CTE + AVG
   - AVERAGE: AVG(raw_col)
   - MEDIAN: PERCENTILE_CONT(0.5)(raw_col) etc.
```

### Compiler contract

`MetricQueryBuilder` emits a `pivotSource` alongside the main `query`. For each metric, it provides the raw expression and the aggregation strategy:

```
┌─────────────────────┬──────────────────────────┬────────────────────────────┐
│ Metric type         │ Raw expression           │ Re-aggregate in bucket     │
├─────────────────────┼──────────────────────────┼────────────────────────────┤
│ SUM                 │ "table".column           │ SUM(raw)                   │
│ COUNT               │ "table".column or '*'    │ COUNT(raw)                 │
│ MIN                 │ "table".column           │ MIN(raw)                   │
│ MAX                 │ "table".column           │ MAX(raw)                   │
│ COUNT_DISTINCT      │ "table".column           │ COUNT(DISTINCT raw)        │
│ SUM_DISTINCT        │ "table".column           │ dedup CTE → SUM            │
│ AVERAGE_DISTINCT    │ "table".column           │ dedup CTE → AVG            │
│ AVERAGE             │ "table".column           │ AVG(raw)                   │
│ NUMBER (custom SQL) │ may be aggregate expr    │ unsupported → drop         │
│ Table calculations  │ N/A                      │ unsupported → drop         │
└─────────────────────┴──────────────────────────┴────────────────────────────┘
```

The compiler knows whether `compiledValueSql` is a raw column reference or an aggregate expression. If it cannot provide a raw expression for a metric, that metric is marked unsupported and the chart falls back to `drop`.

---

## Implementation Plan

### Step 0: Re-baseline current behavior

Before implementing the new path:

- Revert any backend changes previously committed for this feature work
- Re-establish current backend behavior as the source-of-truth baseline
- Add regression coverage for current flag-off behavior:
  - no group limit
  - existing `fast_other` (all-additive charts)
  - existing `drop` (charts with unsupported metrics)
- Confirm emitted SQL and results remain unchanged before introducing the new path

**Files:** `PivotQueryBuilder.test.ts`
**Risk:** Low

---

### Step 1: Add feature flag

**Files:**
- `packages/common/src/types/featureFlags.ts`
- `packages/backend/src/services/ProjectService/ProjectService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`

Resolve `FeatureFlags.GroupLimitEnabled` once in the service layer (not inside query builders). Pass the resolved boolean into `PivotQueryBuilder` as a constructor arg.

When the flag is off, behavior must be identical to today.

**Risk:** Low

---

### Step 2: Expose `pivotSource` from MetricQueryBuilder

**File:** `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`

Add a new optional field to `CompiledQuery`:

```typescript
export type CompiledQuery = {
    query: string;
    fields: ItemsMap;
    warnings: QueryWarning[];
    parameterReferences: Set<string>;
    missingParameterReferences: Set<string>;
    usedParameters: ParametersValuesMap;
    compilationErrors: string[];
    pivotSource?: PivotSourceContract;
};

export type PivotSourceMetricInput =
    | {
          strategy: 'simple';
          inputAlias: string;
          aggregateWith: 'SUM' | 'COUNT' | 'COUNT_STAR' | 'MIN' | 'MAX' | 'AVG';
      }
    | {
          strategy: 'count_distinct';
          inputAlias: string;
      }
    | {
          strategy: 'distinct_dedup';
          inputAlias: string;
          distinctKeyAliases: string[];
          aggregateWith: 'SUM' | 'AVG';
      };

export type PivotSourceContract = {
    query: string;
    metricInputs: Record<string, PivotSourceMetricInput>;
};
```

`pivotSource.query` is a complete SQL statement built from the same compiler context as the main query:
- base table
- joins
- dimension helper joins / CTEs
- dimension filters
- parameter replacement

It selects:
- every dimension alias needed by pivoting (groupBy + index columns)
- every `_order` alias for sorted bin dimensions
- one raw input alias per metric (`__metric_<fieldId>_value`)
- distinct key aliases for `SUM_DISTINCT` / `AVERAGE_DISTINCT` (`__metric_<fieldId>_dk_<n>`)

#### How `MetricQueryBuilder` decides what's supported

For each selected metric:

1. **`SUM`, `MIN`, `MAX`**: `compiledValueSql` is already the raw expression (e.g. `"orders".amount`). Emit as `strategy: 'simple'`.

2. **`COUNT`**: The raw input is the column being counted. If the metric counts `*`, emit `COUNT_STAR`. Otherwise emit the column reference with `aggregateWith: 'COUNT'`.

3. **`COUNT_DISTINCT`**: `compiledValueSql` is the column being distinct-counted (e.g. `"customers".customer_id`). Emit as `strategy: 'count_distinct'`.

4. **`SUM_DISTINCT`, `AVERAGE_DISTINCT`**: `compiledValueSql` + `compiledDistinctKeys` already exist. Emit as `strategy: 'distinct_dedup'`.

5. **`AVERAGE`**: `compiledValueSql` is the raw column. Emit as `strategy: 'simple'` with `aggregateWith: 'AVG'`.

6. **Custom SQL metrics (`NUMBER`, `STRING`, etc.)**: `compiledValueSql` may be an aggregate expression. If the compiler cannot determine a raw input, do not include it in `metricInputs`. Its absence signals "unsupported."

7. **`MEDIAN`, `PERCENTILE`**: These require warehouse-specific syntax. If the compiler can emit a raw input, include it with a warehouse-specific aggregate. Otherwise, omit.

8. **Table calculations**: Not metrics. Never included in `pivotSource`.

The key rule: **if `compiledValueSql` is an aggregate expression (contains `SUM(`, `COUNT(`, etc.), the metric is unsupported** unless the compiler can extract the pre-aggregation input. For standard metric types (SUM, COUNT, MIN, MAX, AVG, COUNT_DISTINCT, SUM_DISTINCT, AVERAGE_DISTINCT), the compiler already knows the raw column. For custom SQL metrics, it does not.

#### How to determine if `compiledValueSql` is raw vs. aggregate

Standard metrics are compiled from a known `sql` expression in the dbt model definition + a `type` field. The compiler wraps `sql` with the aggregation function to produce `compiledSql`, and stores the unwrapped expression as `compiledValueSql`. For standard types, `compiledValueSql` is always the raw column expression. The metric `type` field is the reliable signal — not string-parsing the SQL.

#### Assembly approach

`pivotSource.query` should be assembled inside `compileQuery()` using the same `sqlFrom`, `joinsSql`, `dimensionJoins`, `dimensionFilters`, and CTE chain that the main query uses. This is similar to how `getExperimentalMetricsCteSQL()` already builds the dedup inner subquery from those same fragments.

Parameter replacement should be applied to `pivotSource.query` in the same pass as the main query.

**Risk:** High — this is the most complex step, but it reuses existing compiler internals.

---

### Step 3: Thread `pivotSource` to PivotQueryBuilder

**Files:**
- `packages/backend/src/services/ProjectService/ProjectService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
- `packages/backend/src/services/AsyncQueryService/PreAggregationDuckDbClient.ts`
- `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`

Add `pivotSource` as an optional constructor arg to `PivotQueryBuilder`:

```typescript
constructor(
    sql: string,
    pivotConfiguration: PivotConfiguration,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    limit?: number,
    itemsMap?: ItemsMap,
    pivotSource?: PivotSourceContract,
    rawOtherEnabled?: boolean,
)
```

Pass `compiledResult.pivotSource` from every compiled-metric-query call site:
- `ProjectService.compileQuery()` — for accurate `pivotQuery` in debug/test output
- `AsyncQueryService` — for async metric queries
- `PreAggregationDuckDbClient.resolve()` — for pre-aggregated execution

`ProjectService.pivotQueryWorkerTask()` starts from arbitrary SQL Runner SQL, not a compiled metric query. It cannot produce `pivotSource`, so it passes `undefined`. When the raw path is needed but `pivotSource` is missing, `PivotQueryBuilder` falls back to `drop`.

**Risk:** Low

---

### Step 4: Build the raw bucketed "Other" path in PivotQueryBuilder

**File:** `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`

#### 4a. Update `getGroupingMode()`

```typescript
private static getGroupingMode(
    groupLimit: GroupLimitConfig | undefined,
    groupByColumns: PivotConfiguration['groupByColumns'],
    valuesColumns: PivotConfiguration['valuesColumns'],
    pivotSource?: PivotSourceContract,
    rawOtherEnabled?: boolean,
): 'raw_other' | 'fast_other' | 'drop' | 'none' {
    if (!groupLimit?.enabled || !groupByColumns?.length) return 'none';
    if (valuesColumns.length === 0) return 'none';

    // New raw path — all metrics must have pivotSource inputs
    if (rawOtherEnabled && pivotSource) {
        const allSupported = valuesColumns.every((col) =>
            pivotSource.metricInputs[col.reference]
        );
        if (allSupported) return 'raw_other';
        // If any metric is unsupported, fall through to drop
        return 'drop';
    }

    // Legacy path — flag off or no pivotSource
    const hasUnsupported = valuesColumns.some(
        (col) => col.otherAggregation === null,
    );
    return hasUnsupported ? 'drop' : 'fast_other';
}
```

When `rawOtherEnabled` is true, the legacy `fast_other` path is never used. This is intentional: the raw path produces correct results for all metric types, so there is no reason to keep the additive shortcut when the flag is on.

When `rawOtherEnabled` is false, behavior is identical to today.

#### 4b. Add `__pre_group_scope` CTE

```sql
__pre_group_scope AS (
  SELECT DISTINCT <groupBy aliases>, <index aliases>
  FROM pre_group_by
)
```

Preserves the metric-filtered row scope.

#### 4c. Add `pivot_source` CTE

```sql
pivot_source AS (<compiledQuery.pivotSource.query>)
```

#### 4d. Add `scoped_source` CTE

```sql
scoped_source AS (
  SELECT ps.*
  FROM pivot_source ps
  INNER JOIN __pre_group_scope s
    ON <null-safe equality across groupBy + index aliases>
)
```

Use null-safe equality (IS NOT DISTINCT FROM or warehouse equivalent) for all join conditions.

#### 4e. Add `bucketed_source` CTE

```sql
bucketed_source AS (
  SELECT
    CASE WHEN gr.__group_rn <= N THEN CAST(ss."group_col" AS TEXT) ELSE 'Other' END AS "group_col",
    ss."index_col",
    ss."sorted_bin_order_col",
    ss."__metric_revenue_value",
    ss."__metric_users_value",
    ss."__metric_avg_dk_0",
    ...
  FROM scoped_source ss
  LEFT JOIN __group_ranking gr
    ON <groupBy alias equality>
)
```

#### 4f. Build `group_by_query` from `bucketed_source`

For `simple` and `count_distinct` metrics, aggregate directly:

```sql
group_by_query AS (
  SELECT
    "group_col",
    "index_col",
    MIN("sorted_bin_order_col") AS "sorted_bin_order_col",
    SUM("__metric_revenue_value") AS "revenue_ANY",
    COUNT(DISTINCT "__metric_users_value") AS "unique_customers_ANY"
  FROM bucketed_source
  GROUP BY "group_col", "index_col"
)
```

For `distinct_dedup` metrics (SUM_DISTINCT, AVERAGE_DISTINCT), add a per-metric dedup CTE before the final aggregation:

```sql
__dd_<metricId> AS (
  SELECT
    "group_col", "index_col",
    "__metric_<id>_value" AS __dd_val,
    ROW_NUMBER() OVER (
      PARTITION BY "group_col", "index_col", <distinct_key_aliases>
      ORDER BY "__metric_<id>_value"
    ) AS __dd_rn
  FROM bucketed_source
)
```

Then in `group_by_query`:
- `SUM_DISTINCT`: `SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END)`
- `AVERAGE_DISTINCT`: `CAST(SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) AS FLOAT) / NULLIF(COUNT(CASE WHEN __dd_rn = 1 THEN __dd_val END), 0)`

If distinct_dedup metrics are present, `group_by_query` joins the dedup CTEs to the main aggregation via bucketed groupBy + index columns.

If all metrics are `simple` or `count_distinct`, no dedup CTEs are needed and `group_by_query` is a single SELECT from `bucketed_source`.

#### 4g. Integration with existing CTE chain

The new CTEs slot into `getFullPivotSQL()` between `__group_ranking` and the existing `group_by_query` position. Everything downstream of `group_by_query` (column anchors, row ranking, pivot_query, filtered_rows, total_columns) remains unchanged.

```
existing:  original_query → pre_group_by → __group_totals → __group_ranking → group_by_query → ...

raw_other: original_query → pre_group_by → __group_totals → __group_ranking
           → __pre_group_scope → pivot_source → scoped_source → bucketed_source
           → [__dd_<metric> CTEs if needed] → group_by_query → ...
                                                                 ↑
                                                          same shape as before,
                                                          rest of pipeline unchanged
```

**Risk:** High

---

### Step 5: Update `derivePivotConfigFromChart`

**File:** `packages/common/src/pivot/derivePivotConfigFromChart.ts`

When the raw path is active, `otherAggregation` on `ValuesColumn` is no longer the correctness mechanism — `pivotSource.metricInputs` is. But `otherAggregation` still serves as a frontend signal for the grouping mode UI, and the legacy path still uses it when the flag is off.

Changes:
- Keep `getOtherAggregationForMetric()` as-is for the legacy path
- For metrics that were previously `null` (AVERAGE, MEDIAN, PERCENTILE), **keep them as `null`** — the backend now handles them via `pivotSource` when the flag is on, and `drop` when the flag is off
- `COUNT_DISTINCT` and `SUM_DISTINCT` currently map to `otherAggregation: SUM` (which is wrong). When the flag is on, the backend ignores `otherAggregation` entirely, so this incorrect mapping becomes harmless. When the flag is off, it preserves current (buggy) behavior, which is the correct baseline preservation.

No `reAggregation` metadata is needed on `ValuesColumn`. The compiler contract lives in `pivotSource.metricInputs`, not in the pivot config.

**Risk:** Low

---

### Step 6: Fallback rules

| Condition | Result |
|-----------|--------|
| `groupLimit.enabled` is false | `none` — no group limiting |
| `rawOtherEnabled` is true + `pivotSource` present + all metrics have inputs | `raw_other` — full raw bucketed path |
| `rawOtherEnabled` is true + any metric missing from `pivotSource.metricInputs` | `drop` — fail closed |
| `rawOtherEnabled` is true + `pivotSource` missing (SQL Runner) | `drop` — fail closed |
| `rawOtherEnabled` is false + all metrics have `otherAggregation` | `fast_other` — legacy path, unchanged |
| `rawOtherEnabled` is false + any metric has `otherAggregation === null` | `drop` — legacy path, unchanged |

The critical rule: **never silently fall back to incorrect re-aggregation**. If the raw path is enabled but cannot be used, use `drop`, not `fast_other`.

---

### Step 7: Tests

**File:** `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts`

SQL generation tests:

1. `COUNT_DISTINCT` with "Other" uses `COUNT(DISTINCT ...)` from `bucketed_source`
2. `SUM_DISTINCT` with "Other" uses dedup CTE, not `SUM(sum_distinct_metric)`
3. `AVERAGE_DISTINCT` with "Other" uses dedup CTE with float division
4. `SUM` with "Other" uses `SUM(raw_col)` from `bucketed_source`
5. `COUNT` with "Other" uses `COUNT(raw_col)` from `bucketed_source`
6. `MIN`/`MAX` with "Other" uses `MIN`/`MAX(raw_col)` from `bucketed_source`
7. `AVERAGE` with "Other" uses `AVG(raw_col)` from `bucketed_source`
8. Mixed `SUM + COUNT_DISTINCT` — single bucketed path, both correct
9. Mixed `SUM + AVERAGE_DISTINCT` — single bucketed path with dedup CTE
10. Metric filters preserved by `__pre_group_scope`
11. Custom/bin dimensions use aliases from `pivot_source`
12. Sorted bin `_order` fields preserved through raw path
13. Missing `pivotSource` forces `drop`
14. Unsupported metric in `metricInputs` forces `drop`
15. Flag off preserves exact legacy `fast_other` behavior
16. Flag off preserves exact legacy `drop` behavior
17. SQL Runner path (no `pivotSource`) falls back to `drop`

Strategy selection tests:

18. `none` when group limit disabled
19. `raw_other` when flag on + all metrics supported
20. `drop` when flag on + unsupported metric
21. `fast_other` when flag off + all additive
22. `drop` when flag off + non-additive metric

**File:** `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.test.ts`

23. `pivotSource` emitted with correct aliases for SUM metric
24. `pivotSource` emitted with correct aliases for COUNT_DISTINCT metric
25. `pivotSource` emitted with distinct key aliases for SUM_DISTINCT
26. `pivotSource` emitted with distinct key aliases for AVERAGE_DISTINCT
27. `pivotSource` not emitted for custom SQL metrics with aggregate expressions
28. `pivotSource.query` includes dimension filters
29. `pivotSource.query` includes dimension helper joins/CTEs
30. Parameter replacement applied to `pivotSource.query`

Result-level tests (on seeded data):

31. Compare `COUNT_DISTINCT` "Other" result against direct raw-row query
32. Compare `SUM_DISTINCT` "Other" result against direct raw-row query
33. Compare `AVERAGE_DISTINCT` "Other" result against direct raw-row query
34. Compare mixed `SUM + COUNT_DISTINCT` chart against direct raw-row queries

---

## Files Changed Summary

| File | Change | Risk |
|------|--------|------|
| `packages/common/src/types/featureFlags.ts` | Reuse `GroupLimitEnabled` for raw "Other" rollout | Low |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` | Emit `pivotSource` with raw expressions and metric input metadata | **High** |
| `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts` | Add raw bucketed "Other" path with scope, bucketing, and per-metric aggregation CTEs | **High** |
| `packages/backend/src/services/ProjectService/ProjectService.ts` | Thread `pivotSource` and flag into PivotQueryBuilder | Medium |
| `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts` | Pass `pivotSource` to PivotQueryBuilder | Low |
| `packages/backend/src/services/AsyncQueryService/PreAggregationDuckDbClient.ts` | Pass `pivotSource` to PivotQueryBuilder | Low |
| `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts` | Add coverage for raw "Other" SQL generation + strategy selection | Medium |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.test.ts` | Add coverage for `pivotSource` emission | Medium |

Note: `ValuesColumn` type does not change, so no `pnpm generate-api` needed. `PivotConfiguration` is unchanged.

---

## Edge Cases & Limitations

1. **SQL Runner path**: No `pivotSource` available. Falls back to `drop` when the flag is on.

2. **Table calculations**: Not metrics. Cannot participate in raw re-aggregation. If a chart has table calculations that reference pivoted metrics, the table calc operates on the already-correct `group_by_query` output — no change needed.

3. **Metric filters**: Raw re-aggregation is scoped through `__pre_group_scope`, which derives from `pre_group_by`. Rows that were excluded by metric HAVING filters in `original_query` do not appear in `pre_group_by`, so their dimension combinations are not in `__pre_group_scope`, so matching raw rows are excluded from `scoped_source`. This is correct.

4. **Custom/bin dimensions**: Must come from `pivot_source` aliases (emitted by `MetricQueryBuilder`), not from raw-table aliases reconstructed in `PivotQueryBuilder`.

5. **Fanout protection**: `pivot_source` is built from the same compiler context as the main query, so any join inflation protection (e.g., distinct CTEs) applies equally.

6. **Warehouse-specific casting**: `AVERAGE_DISTINCT` dedup CTEs should reuse the existing `warehouseSqlBuilder.getFloatingType()` logic.

7. **Custom SQL metrics**: If `compiledValueSql` is an aggregate expression, the metric is excluded from `pivotSource.metricInputs`. Any chart containing such a metric falls back to `drop`.

8. **Performance**: The raw path scans the base table twice within the same CTE chain (once for ranking via `original_query`, once for bucketing via `pivot_source`). Warehouse query planners may deduplicate this. This is the same trade-off Tableau, Superset, and Sigma make — correctness over a potential second scan.

9. **Null groups**: The existing null-ranking/null-join bug (where NULL dimension values can consume a top-N slot and then fail to match on join) is a separate issue. It should be fixed independently, not as part of this change.

10. **`MEDIAN` / `PERCENTILE`**: These require warehouse-specific syntax. If `MetricQueryBuilder` can emit a raw input and the warehouse builder can produce the correct aggregate syntax, they can be supported. Otherwise they remain unsupported and fall back to `drop`. This is strictly better than today, where they always `drop`.

---

## Follow-up Investigations

These are separate from the backend raw-`Other` aggregation work above. They should be investigated and fixed independently.

### 1. Explorer chart does not reliably render the `Other` series

Observed behavior:
- Explorer query results can include non-zero `Other` values in `pivotDetails.valuesColumns` and row data
- The chart UI still renders only the visible top-group series and omits `Other`

Investigation tasks:
1. Reproduce in Explorer with `groupLimit.enabled = true` using a chart where the backend returns non-zero `Other` values.
2. Capture the async query payload and result payload from the browser network tab and confirm `pivotDetails.valuesColumns` includes the `Other` pivot column.
3. Trace how the result is transformed into chart series in:
   - `packages/common/src/visualizations/CartesianChartDataModel.ts`
   - any helper that filters or maps `pivotDetails.valuesColumns` into rendered series
4. Verify whether series construction, legend filtering, hidden-series config, or pivot column ordering is excluding `Other`.
5. Add a regression test that starts from a SQL-pivot result containing `Other` and asserts the chart model produces a visible `Other` series.
6. Re-run the manual Explorer scenario after the fix and confirm the chart renders top N + `Other`.

### 2. Drill-through for `Other` is wrong for date and boolean pivots

Observed behavior:
- Clicking `Other` constructs a multi-value exclusion filter
- Date and boolean `NOT_EQUALS` compilation effectively excludes only the first visible top value instead of all visible top values

Investigation tasks:
1. Reproduce with a date pivot and a boolean pivot in Explorer, using `Other` drill-through to open underlying data.
2. Inspect the filter payload generated for drill-through in:
   - `packages/frontend/src/components/MetricQueryData/types.ts`
   - `packages/frontend/src/components/MetricQueryData/utils.ts`
   - `packages/frontend/src/components/MetricQueryData/UnderlyingDataModal.tsx`
3. Inspect filter compilation for multi-value `NOT_EQUALS` in:
   - `packages/common/src/compiler/filtersCompiler.ts`
4. Decide the intended contract:
   - either emit one `NOT_EQUALS` filter per excluded pivot value
   - or make date/boolean `NOT_EQUALS` correctly support multiple values
5. Add regression coverage for:
   - date pivot `Other` drill-through
   - boolean pivot `Other` drill-through
   - verification that underlying data totals match the `Other` bucket totals
6. Re-run the manual drill-through scenarios after the fix and confirm the underlying data matches the `Other` bucket exactly.
