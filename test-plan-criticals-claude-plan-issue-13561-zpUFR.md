# Test Plan: Group Limit Feature — Critical & Important Findings
- **Branch**: claude/plan-issue-13561-zpUFR
- **Date**: 2026-03-21
- **Source**: code-review
- **Status**: completed

---

## Prerequisites
- [x] Docker services running
- [x] PM2 processes started
- [x] App available at http://localhost:3000

## Test Cases

### Test Case 1: NaN maxGroups produces valid SQL
- **Category**: error-handling | **Source**: code-review (Critical)
- **Result**: ✅ PASS (after fix)
- **Finding**: **Bug confirmed** — `Math.max(1, Math.floor(NaN))` = `NaN` and `Math.max(1, Math.floor(Infinity))` = `Infinity` both produced invalid SQL like `WHERE gr.__group_rn <= NaN`.
- **Fix applied**: Added `!Number.isFinite(groupLimit.maxGroups)` guard to `getGroupingMode()` in `PivotQueryBuilder.ts`. Non-finite values now fall back to `'none'` mode (no grouping).
- **Tests**: 3 new tests in PivotQueryBuilder.test.ts (NaN, Infinity, negative maxGroups).

### Test Case 2: getPivotSourceContract handles all MetricType variants
- **Category**: regression | **Source**: code-review (Important)
- **Result**: ✅ PASS
- **Tests**: 10 new parametric tests covering SUM, MIN, MAX, COUNT, COUNT_DISTINCT (expected strategies) and NUMBER, STRING, DATE, TIMESTAMP, BOOLEAN (expected undefined pivotSource).
- **Note**: RUNNING_TOTAL, PERCENTILE, MEDIAN, PERCENT_OF_PREVIOUS, PERCENT_OF_TOTAL were excluded from the parametric test because they require post-calculation metric resolution that can't be tested with a simple mock. They are covered by the existing `omit unsupported custom aggregate` test pattern.

### Test Case 3: Grouping mode fallback chain correctness
- **Category**: happy-path | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 7 new tests in PivotQueryBuilder.test.ts covering:
  - disabled groupLimit → no grouping CTEs
  - empty groupByColumns → no grouping CTEs
  - rawOtherEnabled + no pivotSource → drop mode
  - rawOtherEnabled + missing metric inputs → drop mode
  - rawOtherEnabled=false + additive metrics → fast_other mode
  - otherAggregation=null → drop mode
  - fast_other with all supported → sentinel value in SQL

### Test Case 4: COUNT_DISTINCT routed correctly in raw_other vs fast_other
- **Category**: edge-case | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 2 new tests verifying:
  - raw_other path: SQL contains `COUNT(DISTINCT b."__metric_...")` not `SUM(...)`
  - fast_other path with null otherAggregation: falls to drop mode

### Test Case 5: Sentinel value detected and displayed as "Other"
- **Category**: happy-path | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 6 tests in `valueFormatter.test.ts`:
  - Sentinel `$$_lightdash_other_$$` → returns `"Other"`
  - Normal string → does NOT return "Other"
  - null → does NOT return "Other"
  - undefined → does NOT return "Other"
  - **NEW**: Sentinel with date field in itemsMap → still returns "Other" (not formatted as date)
  - **NEW**: Real date value with date field → formatted normally (not "Other")

### Test Case 6: Drill-through from "Other" generates NOT_EQUALS filter
- **Category**: happy-path | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 4 tests in `utils.test.ts`:
  - `topGroupValues` correctly collects non-Other series values
  - Boolean pivot values are correctly stringified
  - **NEW**: Returns undefined `topGroupValues` when no Other series exists
  - **NEW**: Deduplicates pivot values across multiple series

### Test Case 7: Empty filter values produce safe SQL
- **Category**: edge-case | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 10 new tests in `filtersCompiler.test.ts`:
  - Multi-value date EQUALS → `IN (...)` clause
  - Multi-value date NOT_EQUALS → `NOT IN (...) OR IS NULL` clause
  - Single date value → backward-compatible `=` operator
  - Empty date values EQUALS → `'true'` safe fallback
  - Empty date values NOT_EQUALS → `'true'` safe fallback
  - Multi-value boolean EQUALS → `IN (true,false)`
  - Multi-value boolean NOT_EQUALS → `NOT IN (...) OR IS NULL`
  - Empty boolean values EQUALS → `'true'`
  - Empty boolean values NOT_EQUALS → `'true'`

### Test Case 8: fast_other mode generates correct re-aggregation SQL
- **Category**: happy-path | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 2 new tests in PivotQueryBuilder.test.ts:
  - SUM metric → `sum("revenue")` in group_by_query with sentinel CASE WHEN + total_groups CTE
  - MIN metric → `min("lowest_price")` in group_by_query with sentinel

### Test Case 9: maxGroups=1 boundary (everything becomes Other)
- **Category**: edge-case | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 2 new tests in PivotQueryBuilder.test.ts:
  - fast_other with maxGroups=1: valid SQL with `__group_rn <= 1`, no NaN/Infinity
  - drop mode with maxGroups=1: valid SQL filtering to only top 1 group

### Test Case 10: pivotColumnValueSuffix handles null and sentinel values
- **Category**: edge-case | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 10 new tests in `pivotColumnReference.test.ts` (new file):
  - `getPivotColumnValueKey`: null→`__NULL__`, string passthrough, number→string, sentinel passthrough, boolean→string, undefined→string
  - `getPivotColumnValueSuffix`: underscore joining, null in array, empty array, mixed types

### Test Case 11: getOtherAggregationForMetric covers all MetricType variants
- **Category**: happy-path | **Source**: code-review
- **Result**: ✅ PASS
- **Tests**: 14 new tests in `derivePivotConfigFromChart.test.ts`:
  - SUM → `VizAggregationOptions.SUM`
  - MIN → `VizAggregationOptions.MIN`
  - MAX → `VizAggregationOptions.MAX`
  - COUNT → `VizAggregationOptions.SUM` (summing counts)
  - COUNT_DISTINCT, AVERAGE, RUNNING_TOTAL, PERCENTILE, MEDIAN, NUMBER, STRING, DATE, BOOLEAN → `null`
  - Without groupLimit → otherAggregation is undefined (not set)

### Test Case 12: End-to-end group limit with date pivot dimension (manual)
- **Category**: regression | **Source**: code-review
- **Result**: ✅ PASS (API-validated)
- **Method**: API-based validation (Chrome DevTools unavailable)
- **Findings**:
  - String pivot (status): 5 total groups, top 2 kept, 3 aggregated into "Other"
  - Date pivot (order_date_month): 26 total groups, top 3 kept, 23 aggregated into "Other"
  - "Other" column displays as "Other" (NOT formatted as date) in both API response and CSV
  - `isOtherGroup: true` flag correctly set on sentinel pivot values
  - `totalGroupCount` correctly stored in query_history DB (26 for date pivot)
  - Spotlight trace: 0 errors, 113ms total, SQL contains all expected CTEs
  - Math verified: 2024-06 Other=131.8 (return_pending 15 + shipped 116.8) ✅

### Test Case 13: Scheduled CSV export with group-limited chart (manual)
- **Category**: regression | **Source**: code-review
- **Result**: ✅ PASS (API-validated via download endpoint)
- **Method**: Used `/query/:queryUuid/download` with `pivotConfig` to simulate scheduler CSV path
- **Findings**:
  - Pivoted CSV header shows "Other" (not sentinel value)
  - "Other" column values are correctly aggregated sums
  - Math verified against ungrouped query: 2024-06=US$131.80, 2025-01=US$251.00, 2025-02=US$106.00 ✅

## Test Results Summary

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1 | NaN maxGroups | ✅ PASS | Bug found and fixed (prior run) |
| 2 | MetricType coverage | ✅ PASS | 10 parametric tests (prior run) |
| 3 | Grouping mode fallback | ✅ PASS | 7 tests (prior run) |
| 4 | COUNT_DISTINCT routing | ✅ PASS | 2 tests (prior run) |
| 5 | Sentinel value display | ✅ PASS | 6 tests (2 new: date field) |
| 6 | Drill-through filter | ✅ PASS | 4 tests (2 new: dedup + no-Other) |
| 7 | Multi-value filters | ✅ PASS | 10 new tests (date + boolean) |
| 8 | fast_other re-aggregation | ✅ PASS | 2 new tests (SUM + MIN) |
| 9 | maxGroups=1 boundary | ✅ PASS | 2 new tests |
| 10 | pivotColumnReference | ✅ PASS | 10 new tests (new file) |
| 11 | otherAggregation mapping | ✅ PASS | 14 new tests |
| 12 | E2E date pivot (manual) | ✅ PASS | API-validated: date sentinel, math verified, Spotlight clean |
| 13 | CSV export (manual) | ✅ PASS | Pivoted CSV shows "Other" with correct aggregated values |

## Files Modified

### New test files
- `packages/backend/src/services/pivotColumnReference.test.ts` — 10 tests

### Extended test files
- `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts` — 4 new tests (fast_other + maxGroups=1)
- `packages/common/src/visualizations/helpers/valueFormatter.test.ts` — 2 new tests (date field sentinel)
- `packages/common/src/compiler/filtersCompiler.test.ts` — 10 new tests (multi-value date + boolean)
- `packages/common/src/pivot/derivePivotConfigFromChart.test.ts` — 14 new tests (otherAggregation mapping)
- `packages/frontend/src/components/MetricQueryData/utils.test.ts` — 2 new tests (dedup + no-Other)

### Total new automated tests this run: 42
### Manual tests executed: 2 (API-validated with math verification)
### Grand total (including prior run): 68 new tests, 1 bug fix, 2 manual validations
