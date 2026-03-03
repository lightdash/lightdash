# Plan: Support Totals for All Metric Types in Pivot Tables

## Issue Summary

GitHub Issue #9981: Pivot table totals currently only work for `sum` and `count` metric types. Users want totals for all numeric metric types (`count_distinct`, `average`, `min`, `max`, `median`, `percentile`, `sum_distinct`).

## Root Cause

The `isSummable()` function in `packages/common/src/types/field.ts:900-919` hardcodes only `MetricType.COUNT` and `MetricType.SUM` as eligible for totals. All totals calculations then use simple summation (`reduce((acc, val) => acc + val, 0)`), which is only correct for sum/count types.

## Approach

Introduce **metric-type-aware aggregation** for totals:

| Metric Type | Aggregation | Rationale |
|---|---|---|
| `SUM` | Sum | Correct: sum of sums = total sum |
| `COUNT` | Sum | Correct: sum of counts = total count |
| `COUNT_DISTINCT` | Sum | Approximation: useful default, matches user expectation |
| `SUM_DISTINCT` | Sum | Approximation: useful default |
| `AVERAGE` | Average | Average of displayed values (not weighted, but useful) |
| `MEDIAN` | Average | Best client-side approximation |
| `PERCENTILE` | Average | Best client-side approximation |
| `MIN` | Min | Correct: min of mins = total min |
| `MAX` | Max | Correct: max of maxs = total max |
| `NUMBER` | Excluded | Non-aggregate derived metric, summing is meaningless |
| `STRING/DATE/TIMESTAMP/BOOLEAN` | Excluded | Non-numeric types |
| `PERCENT_OF_*`, `RUNNING_TOTAL` | Excluded | Post-calculation types |

Dimensions with type `NUMBER` will continue to use Sum (preserving current behavior).

## Implementation Steps

### Step 1: Add aggregation types and utility functions

**File: `packages/common/src/types/field.ts`**

1. Add a `TotalAggregation` enum:
   ```typescript
   export enum TotalAggregation {
       SUM = 'sum',
       AVERAGE = 'average',
       MIN = 'min',
       MAX = 'max',
   }
   ```

2. Add `getTotalAggregationType(item): TotalAggregation | null`:
   - Returns `SUM` for SUM, COUNT, COUNT_DISTINCT, SUM_DISTINCT
   - Returns `AVERAGE` for AVERAGE, MEDIAN, PERCENTILE
   - Returns `MIN` for MIN
   - Returns `MAX` for MAX
   - Returns `null` for excluded types (NUMBER, STRING, DATE, post-calculation, table calculations, custom dimensions)
   - Preserves existing dimension handling: NUMBER-type dimensions → SUM, percent-formatted and date-part dimensions → null

3. Add `canHaveTotal(item): boolean` — returns `true` when `getTotalAggregationType(item) !== null`

4. Update `isSummable()` to delegate to `canHaveTotal()` (or keep separate if used in places where only SUM/COUNT should apply — need to verify). After review: `isSummable` is only used in the 4 files that all need updating, so we can update `isSummable` to match `canHaveTotal` to minimize churn, and just add the `getTotalAggregationType` function.

**Decision**: Rename approach — update `isSummable` to become `canHaveTotal` and update all callers. Keep `isSummable` as a deprecated alias. Actually, simpler: just expand `isSummable` to include the new types and add `getTotalAggregationType`. This minimizes the diff.

**Final approach for Step 1:**
- Expand `isSummable()` to include AVERAGE, MEDIAN, PERCENTILE, MIN, MAX, COUNT_DISTINCT, SUM_DISTINCT
- Add `getTotalAggregationType()` that maps items to their aggregation strategy
- Add `aggregateNumericValues(values: number[], aggregation: TotalAggregation): number` helper

### Step 2: Update pivot table totals calculation

**File: `packages/common/src/pivot/pivotQueryResults.ts`**

There are two code paths that compute totals (one for the original pivot, one for the retrofit pivot). Each has 4 cases: {row totals, column totals} × {metricsAsRows true, metricsAsRows false}.

For each case, replace the hardcoded `reduce(sum)` with `aggregateNumericValues()` using the correct aggregation type for the metric being totaled:

1. **`getColumnTotals()` function (lines 398-478)**:
   - Add `getField` parameter
   - **metricsAsRows=true**: Each total row corresponds to a `summableMetricFieldIds[rowIndex]` — look up its aggregation type
   - **metricsAsRows=false**: Each column corresponds to a metric — need to determine which metric via column index. Use `headerValues` to look up the fieldId for each column, then get aggregation type

2. **Row totals in main `pivotQueryResults()` (lines 756-815)**:
   - **metricsAsRows=true**: Each row corresponds to a metric — determine from `indexValues[rowIndex]` or the row-metric mapping
   - **metricsAsRows=false**: Each total column corresponds to `summableMetricFieldIds[totalColIndex]` — look up aggregation type

3. **Row totals in retrofit path (lines 1239-1295)**: Same pattern as #2

4. **Column totals call in retrofit path (line 1298)**: Pass `getField` to `getColumnTotals`

Key helper to add in `pivotQueryResults.ts`:
```typescript
const getAggregationForFieldId = (fieldId: string): TotalAggregation => {
    const field = getField(fieldId);
    return getTotalAggregationType(field) ?? TotalAggregation.SUM;
};
```

### Step 3: Update non-pivot column totals

**File: `packages/frontend/src/hooks/useColumnTotals.ts`**

Update `getResultColumnTotals` to:
1. Accept `itemsMap` so it can look up aggregation type per column
2. Use `getTotalAggregationType` instead of `isSummable` for filtering
3. Apply the correct aggregation per column (sum, average, min, max)

### Step 4: Update PivotTable rendering

**File: `packages/frontend/src/components/common/PivotTable/index.tsx`**

Line 318: Replace `isSummable(item)` check with the new `canHaveTotal(item)` (or updated `isSummable`).

The `getColumnTotalValueFromAxis` callback (line 312) returns `null` for non-summable items, causing the cell not to render a value. After updating `isSummable`, this will naturally include the new metric types. No other changes needed here.

### Step 5: Export new types

**File: `packages/common/src/index.ts`** (or wherever field.ts exports are re-exported)

Ensure `TotalAggregation`, `getTotalAggregationType`, `aggregateNumericValues` are exported.

### Step 6: Add/update tests

**File: `packages/common/src/types/field.test.ts`** (or create if needed)
- Test `isSummable` with all metric types
- Test `getTotalAggregationType` returns correct aggregation for each metric type

**File: `packages/common/src/pivot/pivotQueryResults.test.ts`**
- Add a test case with AVERAGE metric type and verify totals use averaging
- Add a test case with MIN/MAX metric type and verify totals use min/max
- Verify COUNT_DISTINCT uses sum

### Step 7: Typecheck and lint

Run:
```bash
pnpm -F common typecheck
pnpm -F common lint
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F common test
```

## Files Changed (Summary)

| File | Change |
|---|---|
| `packages/common/src/types/field.ts` | Add TotalAggregation enum, getTotalAggregationType(), aggregateNumericValues(), expand isSummable() |
| `packages/common/src/pivot/pivotQueryResults.ts` | Use aggregation-type-aware totals in all 4 total calculation paths |
| `packages/frontend/src/hooks/useColumnTotals.ts` | Use aggregation-type-aware totals for non-pivot tables |
| `packages/frontend/src/components/common/PivotTable/index.tsx` | Update isSummable import if renamed |
| `packages/common/src/pivot/pivotQueryResults.test.ts` | Add tests for new metric type totals |

## Risks and Mitigations

1. **Mathematical incorrectness**: Average-of-averages is not a weighted average. Mitigate by documenting this is a client-side approximation. Could add a tooltip in a follow-up.
2. **Breaking existing behavior**: SUM and COUNT behavior must remain identical. Tests will verify.
3. **Performance**: Aggregation type lookup adds a `getField` call per total cell. This is negligible since pivot tables are bounded in size.
