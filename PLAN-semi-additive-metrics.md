# Plan: Semi-Additive Metrics in Lightdash

## Problem

Some measures (like account balances, inventory levels, MRR) cannot be meaningfully summed across time. A daily balance of $100 across 30 days doesn't mean $3,000 in revenue — it means $100 at the end of the month. These are **semi-additive metrics**: they aggregate normally across most dimensions (SUM balance across branches, regions, account types) but need special treatment on the time dimension (take the FIRST or LAST value in each time period).

dbt's semantic layer calls this `non_additive_dimension`. We'll implement equivalent functionality in Lightdash.

## How It Works (User-Facing)

### YAML Configuration (dbt model `meta`)

Users define semi-additive metrics on columns or at the model level, just like they define `sum` or `count` today, but with an additional `non_additive_dimension` property:

```yaml
# schema.yml
models:
  - name: daily_account_balances
    columns:
      - name: balance
        meta:
          metrics:
            current_balance:
              type: sum
              non_additive_dimension:
                name: date_day          # The time dimension to not aggregate over
                window_choice: max      # 'min' (first) or 'max' (last)
                window_groupings:       # Optional: partition by these before picking first/last
                  - account_id
```

### Behavior

When a user queries `current_balance` grouped by `region`:

1. **Without** semi-additive: `SELECT region, SUM(balance) FROM daily_account_balances GROUP BY region` — **WRONG**, sums balance across all dates
2. **With** semi-additive (`window_choice: max`): Takes only each account's balance from the **latest date** in the queried range, then sums across regions — **CORRECT**

### Generated SQL (Conceptual)

```sql
-- CTE: filter to latest row per partition, then aggregate
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
INNER JOIN sa_current_balance ON base.region = sa_current_balance.region
```

When there are **no `window_groupings`**, it's simpler — just filter to the single min/max date globally:

```sql
WITH sa_current_balance AS (
  SELECT
    region,
    SUM(balance) AS current_balance
  FROM daily_account_balances
  WHERE date_day = (SELECT MAX(date_day) FROM daily_account_balances WHERE <dimension_filters>)
    AND <dimension_filters>
  GROUP BY region
)
...
```

## Implementation Plan

### Phase 1: Types & Configuration (packages/common)

#### 1.1 Add `NonAdditiveDimension` type

**File**: `packages/common/src/types/field.ts`

```typescript
export type WindowChoice = 'min' | 'max';

export type NonAdditiveDimension = {
    /** The time dimension name that should not be aggregated over */
    name: string;
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
    nonAdditiveDimension?: NonAdditiveDimension;
}
```

Add to `CompiledMetric`:
```typescript
// The compiled SQL references for the non-additive dimension config
compiledNonAdditiveDimension?: {
    dimensionSql: string;       // compiled SQL for the time dimension
    windowChoice: WindowChoice;
    compiledWindowGroupings: string[];  // compiled SQL for each grouping column
};
```

#### 1.2 Add to dbt YAML types

**File**: `packages/common/src/types/dbt.ts`

Add to `DbtColumnLightdashMetric`:
```typescript
export type DbtColumnLightdashMetric = {
    // ... existing fields ...
    non_additive_dimension?: {
        name: string;           // dimension name (snake_case, matching YAML convention)
        window_choice: 'min' | 'max';
        window_groupings?: string[];  // optional
    };
};
```

#### 1.3 Add to `AdditionalMetric`

**File**: `packages/common/src/types/metricQuery.ts`

Add to `AdditionalMetric` interface (for UI-created custom metrics):
```typescript
export interface AdditionalMetric {
    // ... existing fields ...
    nonAdditiveDimension?: NonAdditiveDimension;
}
```

#### 1.4 Wire through metric conversion

**File**: `packages/common/src/types/dbt.ts` — `convertModelMetric()`

Map `non_additive_dimension` from YAML to `nonAdditiveDimension` on the `Metric`:
```typescript
...(metric.non_additive_dimension
    ? {
          nonAdditiveDimension: {
              name: metric.non_additive_dimension.name,
              windowChoice: metric.non_additive_dimension.window_choice,
              windowGroupings: metric.non_additive_dimension.window_groupings ?? [],
          },
      }
    : {}),
```

#### 1.5 Update JSON schema for YAML validation

**File**: `packages/common/src/dbt/schemas/lightdashMetadata.json`

Add `non_additive_dimension` to the `LightdashMetric` definition (after `distinct_keys`):

```json
"non_additive_dimension": {
    "type": "object",
    "required": ["name", "window_choice"],
    "properties": {
        "name": {
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
    'nonAdditiveDimension' in metric && metric.nonAdditiveDimension !== undefined;
```

### Phase 2: SQL Compilation (packages/common + packages/warehouses)

#### 2.1 Compile non-additive dimension references in ExploreCompiler

**File**: `packages/common/src/compiler/exploreCompiler.ts`

In `compileMetricSql()`, after the existing logic that handles `SUM_DISTINCT`, add handling for semi-additive metrics. The key is to compile the dimension SQL references so the MetricQueryBuilder has resolved SQL to work with:

```typescript
if (metric.nonAdditiveDimension) {
    const nad = metric.nonAdditiveDimension;

    // Compile the non-additive dimension SQL reference
    const nadDimRef = this.compileDimensionReference(
        nad.name, tables, metric.table, fieldContext
    );

    // Compile window grouping references
    const compiledGroupings = nad.windowGroupings.map(ref => {
        const compiled = this.compileDimensionReference(
            ref, tables, metric.table, fieldContext
        );
        tablesReferences = new Set([...tablesReferences, ...compiled.tablesReferences]);
        return compiled.sql;
    });

    tablesReferences = new Set([...tablesReferences, ...nadDimRef.tablesReferences]);

    return {
        sql: compiledSql,          // The normal aggregation SQL (e.g., SUM(balance))
        tablesReferences,
        valueSql: renderedSql,     // The raw un-aggregated expression
        compiledNonAdditiveDimension: {
            dimensionSql: nadDimRef.sql,
            windowChoice: nad.windowChoice,
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

When users create custom metrics from the UI (right-click a dimension → "Add custom metric"), we'd need to allow configuring non-additive dimensions for appropriate metric types.

**This can be a follow-up phase.** Initially, semi-additive metrics would only be configurable via YAML. The UI would display them correctly since the SQL generation is server-side.

#### 4.2 Metric display

Semi-additive metrics will appear in the explore sidebar like any other metric. No special UI treatment needed — they just generate different SQL.

### Phase 5: Validation & Edge Cases

#### 5.1 Validation rules

Add validation in the ExploreCompiler:

1. `non_additive_dimension.name` must reference a valid dimension of type DATE or TIMESTAMP in the same table (or a joined table)
2. `window_groupings` entries must reference valid dimensions
3. Semi-additive config is only valid on aggregate metric types (SUM, COUNT, COUNT_DISTINCT, AVERAGE, etc.) — not on non-aggregate or post-calculation types
4. Cannot combine `non_additive_dimension` with `distinct_keys` (sum_distinct) — they're separate patterns

#### 5.2 Edge cases to handle

- **No dimensions selected**: When querying a semi-additive metric with no GROUP BY, it should still filter to the last/first date row(s) before aggregating
- **Time dimension is in the query**: When the non-additive time dimension itself is included as a GROUP BY column, the semi-additive behavior should still apply within each time bucket (e.g., grouping by month should take the last date within each month)
- **Metric filters**: Metric-level filters (CASE WHEN) should be applied inside the semi-additive CTE, before the ROW_NUMBER
- **Multiple semi-additive metrics in one query**: Each gets its own CTE, joined back independently (same pattern as multiple sum_distinct metrics)
- **Interaction with PoP metrics**: Semi-additive metrics should work with Period-over-Period comparisons. The PoP CTE would reference the semi-additive CTE's result
- **Interaction with metric inflation protection**: Need to ensure the experimental metrics CTE logic also handles semi-additive metrics correctly, or excludes them (since they already have their own CTE isolation)

## Files Changed (Summary)

| File | Change |
|------|--------|
| `packages/common/src/types/field.ts` | Add `NonAdditiveDimension` type, add to `Metric` interface, add `isSemiAdditiveMetric()` |
| `packages/common/src/types/dbt.ts` | Add `non_additive_dimension` to `DbtColumnLightdashMetric`, wire through `convertModelMetric()` |
| `packages/common/src/dbt/schemas/lightdashMetadata.json` | Add `non_additive_dimension` to `LightdashMetric` JSON schema for YAML validation |
| `packages/common/src/types/metricQuery.ts` | Add `nonAdditiveDimension` to `AdditionalMetric` |
| `packages/common/src/compiler/exploreCompiler.ts` | Compile non-additive dimension references, return compiled metadata |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` | Add `buildSemiAdditiveCtes()`, integrate into `compileQuery()`, skip from regular SELECT |
| `packages/backend/src/queryCompiler.ts` | Wire `nonAdditiveDimension` through `compileAdditionalMetric()` |
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

### Why match dbt's `non_additive_dimension` naming?

Alignment with dbt's semantic layer terminology reduces cognitive load for users who work with both tools. The YAML property name uses dbt's snake_case convention (`non_additive_dimension`), while the TypeScript property uses camelCase (`nonAdditiveDimension`).

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
