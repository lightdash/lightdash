# Plan: Semi-Additive Metrics in Lightdash (DRAFT)

## Problem

Some measures (like account balances, inventory levels, MRR) cannot be meaningfully summed across time. A daily balance of $100 across 30 days doesn't mean $3,000 in revenue — it means $100 at the end of the month. These are **semi-additive metrics**: they aggregate normally across most dimensions (SUM balance across branches, regions, account types) but need special treatment on the time dimension (take the FIRST or LAST value in each time period).

dbt's semantic layer has a similar concept called `non_additive_dimension`. We'll call ours `semi_additive` — a clearer, more widely-understood term.

---

## User Guide: How to Use Semi-Additive Metrics

### What is a semi-additive metric?

A semi-additive metric is any metric where **summing across time doesn't make sense**. Common examples:

| Metric | Why it's semi-additive |
|--------|----------------------|
| Account balance | $100 today + $100 yesterday ≠ $200 total — it's still $100 |
| Inventory on hand | 50 units on Monday + 50 on Tuesday ≠ 100 units — it's still 50 |
| Monthly recurring revenue (MRR) | You can't sum daily MRR snapshots to get monthly MRR |
| Active subscriptions | 1,000 subs today + 1,000 yesterday ≠ 2,000 — it's still ~1,000 |
| Headcount | 200 employees on Jan 1 + 200 on Feb 1 ≠ 400 |

These metrics **can** be summed across non-time dimensions (balance across accounts, MRR across regions), but on the time dimension you want the **first** or **last** value in the period instead.

### YAML Syntax

Add `semi_additive` to any metric definition in your dbt model's `meta` config:

#### Column-level metric (most common)

```yaml
models:
  - name: daily_account_balances
    columns:
      - name: balance
        meta:
          metrics:
            current_balance:
              type: sum
              semi_additive:
                time_dimension: date_day      # Which time dimension to not aggregate over
                window_choice: max            # 'max' = latest/last, 'min' = earliest/first
                window_groupings:             # Optional: partition by these entities
                  - account_id
```

#### Model-level metric

```yaml
models:
  - name: daily_account_balances
    meta:
      metrics:
        total_balance:
          type: sum
          sql: balance
          semi_additive:
            time_dimension: date_day
            window_choice: max
```

### Configuration Reference

| Property | Required | Values | Description |
|----------|----------|--------|-------------|
| `time_dimension` | Yes | dimension name | The time/date dimension that should not be aggregated over. Must reference a DATE or TIMESTAMP dimension in the same table. |
| `window_choice` | Yes | `min` or `max` | `max` = take the **latest** (most recent) value. `min` = take the **earliest** (oldest) value. Most use cases want `max`. |
| `window_groupings` | No | list of dimension names | Entity dimensions to partition by when selecting first/last. Use this when your table has multiple entities per date (e.g., one row per account per day). |

### When to use `window_groupings`

**Use `window_groupings`** when your source table has **multiple entities per time period**:

```
# Table: daily_account_balances
# One row per account per day
| date_day   | account_id | region | balance |
|------------|------------|--------|---------|
| 2024-01-01 | A          | East   | 100     |
| 2024-01-01 | B          | West   | 200     |
| 2024-01-02 | A          | East   | 150     |
| 2024-01-02 | B          | West   | 250     |
```

With `window_groupings: [account_id]` and `window_choice: max`:
→ For each account, take the row with the latest `date_day`
→ Account A: balance = 150 (from Jan 2), Account B: balance = 250 (from Jan 2)
→ Then SUM across accounts: total = 400

**Omit `window_groupings`** when your table has **one row per time period** (already at the grain you want):

```
# Table: daily_company_metrics
# One row per day, company-wide totals
| date_day   | total_mrr | headcount |
|------------|-----------|-----------|
| 2024-01-01 | 50000     | 200       |
| 2024-02-01 | 55000     | 210       |
```

Without `window_groupings`, `window_choice: max`:
→ Take the single row with the latest `date_day`
→ total_mrr = 55000, headcount = 210

### Combining with other metric features

Semi-additive works with existing metric features:

```yaml
current_balance:
  type: sum
  description: "Current account balance (as of latest date)"
  filters:                          # Metric-level filters still work
    - is_active: "true"
  semi_additive:
    time_dimension: date_day
    window_choice: max
    window_groupings:
      - account_id
  hidden: false
  groups: ["finance"]
```

**Cannot be combined with**: `distinct_keys` (sum_distinct) — these are separate patterns that both use CTE-based query rewriting.

### What users see in the Explore UI

Semi-additive metrics appear in the sidebar **exactly like any other metric** — no special UI. The difference is entirely in the SQL that gets generated. Users select dimensions and metrics as normal; the query engine handles the semi-additive logic transparently.

### Example queries and results

**Scenario**: `daily_account_balances` table with columns `date_day`, `account_id`, `region`, `balance`

**Query 1**: Metric `current_balance` grouped by `region`
```
| region | current_balance |
|--------|-----------------|
| East   | 150             |  ← Sum of latest balances for East accounts
| West   | 250             |  ← Sum of latest balances for West accounts
```

**Query 2**: Metric `current_balance` grouped by `region` + `date_day` (monthly)
```
| date_month | region | current_balance |
|------------|--------|-----------------|
| January    | East   | 150             |  ← Last balance in Jan for East accounts
| January    | West   | 250             |
| February   | East   | 180             |  ← Last balance in Feb for East accounts
| February   | West   | 300             |
```
When the time dimension itself is in the GROUP BY, the semi-additive logic applies **within each time bucket**.

**Query 3**: Metric `current_balance` with no dimensions (grand total)
```
| current_balance |
|-----------------|
| 400             |  ← Sum of latest balance per account, across all accounts
```

---

## Generated SQL (Conceptual)

**Case A: With `window_groupings`** (ROW_NUMBER approach):

```sql
WITH sa_current_balance AS (
  SELECT
    region,
    SUM(balance) AS current_balance
  FROM (
    SELECT
      region,
      balance,
      ROW_NUMBER() OVER (
        PARTITION BY account_id    -- window_groupings
        ORDER BY date_day DESC     -- DESC for 'max', ASC for 'min'
      ) AS __sa_rn
    FROM daily_account_balances
    WHERE <dimension_filters>
  ) __sa_sub
  WHERE __sa_rn = 1
  GROUP BY region
)
SELECT
  base.region,
  sa_current_balance.current_balance
FROM base_query base
LEFT JOIN sa_current_balance ON base.region = sa_current_balance.region
```

**Case B: Without `window_groupings`** (simpler global min/max date filter):

```sql
WITH sa_current_balance AS (
  SELECT
    region,
    SUM(balance) AS current_balance
  FROM daily_account_balances
  WHERE date_day = (SELECT MAX(date_day) FROM daily_account_balances WHERE <filters>)
    AND <dimension_filters>
  GROUP BY region
)
...
```

---

## Implementation Plan

### Phase 1: Types & Configuration (packages/common)

#### 1.1 Add `SemiAdditiveConfig` type

**File**: `packages/common/src/types/field.ts`

```typescript
export type WindowChoice = 'min' | 'max';

export type SemiAdditiveConfig = {
    /** The time dimension name that should not be aggregated over */
    timeDimension: string;
    /** Whether to pick the first (min) or last (max) value */
    windowChoice: WindowChoice;
    /** Optional dimension/entity names to partition by before applying the window */
    windowGroupings: string[];
};
```

Add to `Metric` interface:
```typescript
export interface Metric extends Field {
    // ... existing fields ...
    semiAdditive?: SemiAdditiveConfig;
}
```

Add to `CompiledMetric`:
```typescript
compiledSemiAdditive?: {
    timeDimensionSql: string;                // compiled SQL for the time dimension
    windowChoice: WindowChoice;
    compiledWindowGroupings: string[];       // compiled SQL for each grouping column
};
```

#### 1.2 Add to dbt YAML types

**File**: `packages/common/src/types/dbt.ts`

Add to `DbtColumnLightdashMetric`:
```typescript
export type DbtColumnLightdashMetric = {
    // ... existing fields ...
    semi_additive?: {
        time_dimension: string;
        window_choice: 'min' | 'max';
        window_groupings?: string[];
    };
};
```

#### 1.3 Add to `AdditionalMetric`

**File**: `packages/common/src/types/metricQuery.ts`

Add to `AdditionalMetric` interface (for UI-created custom metrics):
```typescript
export interface AdditionalMetric {
    // ... existing fields ...
    semiAdditive?: SemiAdditiveConfig;
}
```

#### 1.4 Wire through metric conversion

**File**: `packages/common/src/types/dbt.ts` — `convertModelMetric()`

Map `semi_additive` from YAML to `semiAdditive` on the `Metric`:
```typescript
...(metric.semi_additive
    ? {
          semiAdditive: {
              timeDimension: metric.semi_additive.time_dimension,
              windowChoice: metric.semi_additive.window_choice,
              windowGroupings: metric.semi_additive.window_groupings ?? [],
          },
      }
    : {}),
```

#### 1.5 Update JSON schema for YAML validation

**File**: `packages/common/src/dbt/schemas/lightdashMetadata.json`

Add `semi_additive` to the `LightdashMetric` definition (after `distinct_keys`):

```json
"semi_additive": {
    "type": "object",
    "required": ["time_dimension", "window_choice"],
    "properties": {
        "time_dimension": {
            "type": "string",
            "description": "The time dimension that should not be aggregated over"
        },
        "window_choice": {
            "type": "string",
            "enum": ["min", "max"],
            "description": "Whether to pick the first (min) or last (max) value"
        },
        "window_groupings": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Dimensions to partition by before applying the window choice"
        }
    }
}
```

#### 1.6 Helper predicates

**File**: `packages/common/src/types/field.ts`

```typescript
export const isSemiAdditiveMetric = (metric: Metric | AdditionalMetric): boolean =>
    'semiAdditive' in metric && metric.semiAdditive !== undefined;
```

### Phase 2: SQL Compilation (packages/common + packages/warehouses)

#### 2.1 Compile semi-additive dimension references in ExploreCompiler

**File**: `packages/common/src/compiler/exploreCompiler.ts`

In `compileMetricSql()`, after the existing logic that handles `SUM_DISTINCT`, add handling for semi-additive metrics. The key is to compile the dimension SQL references so the MetricQueryBuilder has resolved SQL to work with:

```typescript
if (metric.semiAdditive) {
    const sa = metric.semiAdditive;

    // Compile the time dimension SQL reference
    const timeDimRef = this.compileDimensionReference(
        sa.timeDimension, tables, metric.table, fieldContext
    );

    // Compile window grouping references
    const compiledGroupings = sa.windowGroupings.map(ref => {
        const compiled = this.compileDimensionReference(
            ref, tables, metric.table, fieldContext
        );
        tablesReferences = new Set([...tablesReferences, ...compiled.tablesReferences]);
        return compiled.sql;
    });

    tablesReferences = new Set([...tablesReferences, ...timeDimRef.tablesReferences]);

    return {
        sql: compiledSql,          // The normal aggregation SQL (e.g., SUM(balance))
        tablesReferences,
        valueSql: renderedSql,     // The raw un-aggregated expression
        compiledSemiAdditive: {
            timeDimensionSql: timeDimRef.sql,
            windowChoice: sa.windowChoice,
            compiledWindowGroupings: compiledGroupings,
        },
    };
}
```

Update the return type of `compileMetricSql()` to include the new field.

### Phase 3: Query Building (packages/backend)

#### 3.1 Build Semi-Additive CTEs in MetricQueryBuilder

**File**: `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`

This follows the exact same pattern as `buildSumDistinctCtes()`. Add a new method `buildSemiAdditiveCtes()`:

```typescript
private buildSemiAdditiveCtes({
    dimensionSelects,
    dimensionGroupBy,
    dimensionFilters,
    sqlFrom,
    joinsSql,
    dimensionJoins,
    baseCteName,
}): { ctes: string[]; saJoins: string[]; saMetricSelects: string[] }
```

**For each semi-additive metric**, generate a CTE with this structure:

**Case A: With `windowGroupings`** (ROW_NUMBER approach):

```sql
sa_metric_name AS (
  SELECT
    dim1, dim2,                             -- all query dimensions
    AGG(CASE WHEN __sa_rn = 1 THEN __sa_val ELSE NULL END) AS "metric_id"
  FROM (
    SELECT
      dim1, dim2,                           -- all query dimensions
      value_expression AS __sa_val,         -- un-aggregated metric value
      ROW_NUMBER() OVER (
        PARTITION BY grouping1, grouping2   -- window_groupings
        ORDER BY time_dim DESC              -- DESC for max, ASC for min
      ) AS __sa_rn
    FROM base_table
    [JOINs]
    [WHERE dimension_filters]
  ) __sa_sub
  WHERE __sa_rn = 1
  GROUP BY dim1, dim2
)
```

**Case B: Without `windowGroupings`** (simpler global min/max date filter):

```sql
sa_metric_name AS (
  SELECT
    dim1, dim2,
    AGG(value_expression) AS "metric_id"
  FROM base_table
  [JOINs]
  WHERE time_dim = (
    SELECT MAX(time_dim)                    -- or MIN for window_choice: min
    FROM base_table
    [JOINs]
    [WHERE dimension_filters]
  )
  AND [dimension_filters]
  GROUP BY dim1, dim2
)
```

#### 3.2 Integrate into `compileQuery()` pipeline

In `compileQuery()`, after the sum_distinct CTE block (around line 2700), add:

```typescript
// Semi-additive metrics CTEs
const saMetricIds = this.getSemiAdditiveMetricIds();
if (saMetricIds.length > 0) {
    const saBaseCteName = 'sa_base';
    ctes.push(MetricQueryBuilder.wrapAsCte(saBaseCteName, finalSelectParts));

    const { ctes: saCtes, saJoins, saMetricSelects } =
        this.buildSemiAdditiveCtes({
            dimensionSelects: dimensionsSQL.selects,
            dimensionGroupBy: dimensionsSQL.groupBySQL,
            dimensionFilters: dimensionsSQL.filtersSQL,
            sqlFrom,
            joinsSql: joins.joinSQL,
            dimensionJoins: dimensionsSQL.joins,
            baseCteName: saBaseCteName,
        });

    ctes.push(...saCtes);

    // Update finalSelectParts to join base with semi-additive CTEs
    finalSelectParts = [
        `SELECT`,
        [`  ${saBaseCteName}.*`, ...saMetricSelects].join(',\n'),
        `FROM ${saBaseCteName}`,
        ...saJoins,
    ];
}
```

#### 3.3 Exclude semi-additive metrics from regular SELECT

In `getMetricsSQL()`, skip semi-additive metrics from the regular aggregation (similar to how sum_distinct is skipped at line 746):

```typescript
if (isSemiAdditiveMetric(metric)) {
    // Semi-additive metrics are handled via CTE, skip from regular SELECT
    // but still track table references for JOINs
    return;
}
```

### Phase 4: Frontend Support (packages/frontend)

#### 4.1 Custom Metric Creation UI

When users create custom metrics from the UI (right-click a dimension -> "Add custom metric"), we'd need to allow configuring semi-additive settings for appropriate metric types.

**This can be a follow-up phase.** Initially, semi-additive metrics would only be configurable via YAML. The UI would display them correctly since the SQL generation is server-side.

#### 4.2 Metric display

Semi-additive metrics will appear in the explore sidebar like any other metric. No special UI treatment needed — they just generate different SQL.

### Phase 5: Validation & Edge Cases

#### 5.1 Validation rules

Add validation in the ExploreCompiler:

1. `semi_additive.time_dimension` must reference a valid dimension of type DATE or TIMESTAMP in the same table (or a joined table)
2. `window_groupings` entries must reference valid dimensions
3. Semi-additive config is only valid on aggregate metric types (SUM, COUNT, COUNT_DISTINCT, AVERAGE, etc.) — not on non-aggregate or post-calculation types
4. Cannot combine `semi_additive` with `distinct_keys` (sum_distinct) — they're separate CTE-based row-selection strategies that cannot coexist (see Phase 6 conflict analysis)
5. PoP (Period-over-Period) comparisons on semi-additive metrics are **not supported in initial release** — the metric falls back to regular calculation for the PoP portion (see Phase 6)

#### 5.2 Edge cases to handle

- **No dimensions selected**: When querying a semi-additive metric with no GROUP BY, it should still filter to the last/first date row(s) before aggregating
- **Time dimension is in the query**: When the semi-additive time dimension itself is included as a GROUP BY column, the semi-additive behavior should still apply within each time bucket (e.g., grouping by month should take the last date within each month)
- **Metric filters**: Metric-level filters (CASE WHEN) should be applied inside the semi-additive CTE, before the ROW_NUMBER
- **Multiple semi-additive metrics in one query**: Each gets its own CTE, joined back independently (same pattern as multiple sum_distinct metrics)
- **Interaction with PoP metrics**: Semi-additive metrics should work with Period-over-Period comparisons. The PoP CTE would reference the semi-additive CTE's result
- **Interaction with metric inflation protection**: Need to ensure the experimental metrics CTE logic also handles semi-additive metrics correctly, or excludes them (since they already have their own CTE isolation)

### Phase 6: CTE Conflict Analysis & Integration Strategy

The `compileQuery()` pipeline in MetricQueryBuilder composes CTEs in a strict order. Each feature that rewrites queries must be aware of the others. Here's the full pipeline order and how semi-additive metrics slot in:

#### Current `compileQuery()` CTE pipeline order

```
1. getDimensionsSQL()       → dimension selects, filters, GROUP BY, joins, custom dimension CTEs
2. getMetricsSQL()          → metric selects, filters
3. getJoinsSQL()            → JOIN clauses from table references
4. Build initial SELECT     → SELECT dims + metrics FROM base JOIN ... WHERE ... GROUP BY
5. experimentalMetricsCte   → IF metric inflation risk: cte_keys_<table> + cte_metrics_<table>
   ELSE IF popConfigs       → base_metrics CTE + pop_min_max + pop_metrics CTEs
6. buildSumDistinctCtes()   → sd_base CTE + sd_<metric> CTEs per sum_distinct metric
7. Post-aggregation         → metrics CTE + post_calc + metric_filters + table_calculations CTEs
8. Assemble final SQL       → WITH cte1, cte2, ... SELECT ... ORDER BY ... LIMIT
```

Steps 5 and 6 are the critical integration points. Semi-additive CTEs slot in **between steps 5 and 6** (or alongside step 6).

#### Conflict: Semi-additive + Sum Distinct

**Risk**: Both create metric-isolation CTEs that wrap `finalSelectParts` as a base CTE and join separate metric CTEs back in. If both run, the second would wrap the first's output.

**Resolution**: This combination is **explicitly disallowed** (validation in Phase 5.1, rule 4). The YAML validation will reject a metric that has both `semi_additive` and `distinct_keys`. This mirrors dbt's behavior — these are fundamentally different row-selection strategies.

#### Conflict: Semi-additive + Experimental Metrics CTE (Metric Inflation Protection)

**Risk**: The experimental metrics CTE (`getExperimentalMetricsCteSQL()`) creates its own per-table CTEs (`cte_keys_<table>`, `cte_metrics_<table>`) to prevent metric inflation from join fan-out. Semi-additive also creates per-metric CTEs. Both could try to handle the same metric.

**Resolution — Phase 1 approach**: When a metric has `semiAdditive`, the experimental metrics CTE should **skip it** (don't create a `cte_metrics_<table>` for it). Semi-additive CTEs already isolate the metric from regular aggregation, providing their own inflation protection by operating on raw data with explicit ROW_NUMBER partitioning.

**Implementation detail**: In `getExperimentalMetricsCteSQL()`, add a check:
```typescript
if (isSemiAdditiveMetric(metric)) {
    // Skip — handled by buildSemiAdditiveCtes() with its own isolation
    continue;
}
```

The semi-additive CTE itself queries from raw tables (not from experimental CTEs), so there's no dependency conflict.

#### Conflict: Semi-additive + Period-over-Period (PoP)

**Risk**: PoP creates its own CTEs (`pop_min_max_<suffix>`, `pop_metrics_<suffix>`) that recalculate metrics from raw data over a shifted date range. The PoP path is an `else if` branch from the experimental metrics CTE path. A semi-additive metric with a PoP comparison would need:
1. The base semi-additive CTE (latest value in the current date range)
2. A PoP semi-additive CTE (latest value in the *shifted* date range)

**Resolution — Phase 1 approach**: PoP + semi-additive is **not supported in initial release**. If a semi-additive metric is requested with a PoP comparison, we should:
1. Log a warning
2. Fall back to treating it as a regular metric for the PoP portion (calculate normally without semi-additive logic)

**Future enhancement**: Build dedicated `sa_pop_<metric>_<suffix>` CTEs that apply ROW_NUMBER within the shifted date range. This is tractable but adds significant complexity.

#### Conflict: Semi-additive + Table Calculations

**Risk**: Table calculations run in post-aggregation CTEs (step 7) that reference the `metrics` CTE. If a table calculation references a semi-additive metric, it needs to see the already-resolved semi-additive value.

**Resolution**: No conflict. By the time table calculations run, the semi-additive metric has already been resolved via CTE and joined back into `finalSelectParts`. The `metrics` CTE (step 7) will contain the semi-additive metric's value as a regular column. Table calculations will reference it normally.

#### Conflict: Semi-additive + Pivot Tables

**Risk**: Pivot wraps the entire metric query in additional CTEs for `row_index`/`column_index` via DENSE_RANK().

**Resolution**: No conflict. Pivot operates on the final query output. Semi-additive metrics produce a regular column in the result set, which pivots normally.

#### Conflict: Semi-additive + Custom Dimensions (Bins)

**Risk**: Custom bin dimensions add CTEs and JOINs in step 1. These propagate into the base query.

**Resolution**: No conflict. Custom dimension CTEs are resolved before metric CTEs. The semi-additive CTE reads from raw tables with all joins intact, so custom dimension JOINs are available.

#### Cache Key Impact

The cache key is SHA256 of the **entire compiled SQL** (`QueryHistoryModel.getCacheKey`). Since semi-additive CTEs change the SQL text, any query with semi-additive metrics automatically gets a distinct cache key. No special handling needed.

#### Integration point in `compileQuery()` — precise location

The semi-additive CTE block should be inserted at **line ~2700** (after `buildSumDistinctCtes()` completes, before the post-aggregation block):

```
// After sum_distinct CTE handling (step 6):
const saMetricIds = this.getSemiAdditiveMetricIds();
if (saMetricIds.length > 0) {
    // ... buildSemiAdditiveCtes() logic from Phase 3
}

// Existing post-aggregation block (step 7):
if (needsPostAgg) {
    // ... existing logic unchanged
}
```

This placement ensures:
- Semi-additive CTEs read from raw tables (not from other CTEs)
- Semi-additive results are available for post-aggregation (table calcs, metric filters)
- Sum-distinct and semi-additive don't collide (validated to be mutually exclusive)

## Files Changed (Summary)

| File | Change |
|------|--------|
| `packages/common/src/types/field.ts` | Add `SemiAdditiveConfig` type, add to `Metric` interface, add `isSemiAdditiveMetric()` |
| `packages/common/src/types/dbt.ts` | Add `semi_additive` to `DbtColumnLightdashMetric`, wire through `convertModelMetric()` |
| `packages/common/src/dbt/schemas/lightdashMetadata.json` | Add `semi_additive` to `LightdashMetric` JSON schema for YAML validation |
| `packages/common/src/types/metricQuery.ts` | Add `semiAdditive` to `AdditionalMetric` |
| `packages/common/src/compiler/exploreCompiler.ts` | Compile semi-additive dimension references, return compiled metadata |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` | Add `buildSemiAdditiveCtes()`, integrate into `compileQuery()`, skip from regular SELECT |
| `packages/backend/src/queryCompiler.ts` | Wire `semiAdditive` through `compileAdditionalMetric()` |
| `packages/warehouses/src/utils/sql.ts` | No changes needed (aggregation function itself doesn't change) |
| `packages/common/src/utils/additionalMetrics.ts` | Potentially expose semi-additive as a custom metric option (Phase 4) |

## Design Decisions

### Why CTE-based approach (like sum_distinct) vs PostCalculation (like running_total)?

**CTE approach chosen because:**
1. Semi-additive metrics need to change **which rows** are aggregated, not just wrap the aggregation in a window function
2. The ROW_NUMBER + filter pattern requires access to raw (pre-aggregated) data
3. It's the exact same pattern as sum_distinct, which is already battle-tested
4. PostCalculation metrics operate on already-aggregated results — too late to filter rows

### Why not a new MetricType?

Semi-additivity is **orthogonal** to the aggregation type. A metric can be `type: sum` AND semi-additive, or `type: count_distinct` AND semi-additive. Making it a separate config property (like `distinct_keys` for sum_distinct) keeps the type system clean and avoids a combinatorial explosion of types.

### Why `semi_additive` instead of dbt's `non_additive_dimension`?

- "Semi-additive" is the standard data modeling term (Kimball, OLAP literature)
- It's clearer: the metric *is* additive on some dimensions, just not on time
- dbt's `non_additive_dimension` is a mouthful and slightly misleading (the metric isn't fully "non-additive")
- Shorter YAML config name is friendlier

## Testing Strategy

1. **Unit tests** (`packages/common`): Test that `convertModelMetric` correctly maps YAML config to Metric type
2. **Unit tests** (`packages/common`): Test validation rules (invalid dimension references, type restrictions)
3. **Integration tests** (`packages/backend`): Test `buildSemiAdditiveCtes()` generates correct SQL for:
   - With window_groupings (ROW_NUMBER pattern)
   - Without window_groupings (subquery MIN/MAX pattern)
   - Multiple semi-additive metrics in one query
   - Semi-additive + regular metrics in same query
   - Edge cases (no dimensions, time dimension in query)
4. **E2E tests**: Test with a seeded table containing daily balance-like data
