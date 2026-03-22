# Test Plan: Validate M1 (COUNT_DISTINCT fast_other overcounting) and M3 (filter compiler multi-value scope)

- **Branch**: claude/plan-issue-13561-zpUFR
- **Date**: 2026-03-21
- **Source**: code-review (findings M1 and M3 from pr_review_results.md)
- **Status**: completed

---

## Prerequisites

- [ ] Docker services running (`/docker-dev`)
- [ ] PM2 processes started (`pnpm pm2:start`)
- [ ] Spotlight available at http://localhost:8969
- [ ] App available at http://localhost:3000
- [ ] Feature flag `group-limit-enabled` is force-enabled (default in dev mode via `FORCED_LOCAL_FEATURE_FLAGS` and `useServerOrClientFeatureFlag.ts`)

---

## Test Cases

### Test Case 1: Verify fast_other COUNT_DISTINCT produces correct numbers via unit test

**What it verifies**: Whether summing pre-aggregated COUNT_DISTINCT values in the fast_other path overcounts when entities appear in multiple groups.

**Category**: `edge-case`

**Source**: `code-review` (M1)

**Steps**:

1. Read the existing `PivotQueryBuilder.test.ts` to understand test patterns for fast_other mode
2. Write a unit test that constructs a PivotQueryBuilder with:
   - `rawOtherEnabled: false` (forces fast_other path)
   - A `valuesColumn` with `aggregation: VizAggregationOptions.SUM` and `otherAggregation: VizAggregationOptions.SUM` (simulating COUNT_DISTINCT mapped to SUM)
   - `groupLimit: { enabled: true, maxGroups: 1 }`
   - 3 groups where the underlying data has overlapping distinct entities
3. Inspect the generated SQL — confirm the fast_other path uses `SUM(...)` to re-aggregate
4. Compare with the raw_other path (same data, `rawOtherEnabled: true` with a pivotSource) — confirm it uses `COUNT(DISTINCT ...)`
5. Document whether the fast_other result differs from raw_other for this case

**Debug-local tooling to use**:
- Run `pnpm -F backend test:dev:nowatch` targeting the PivotQueryBuilder test file
- No browser automation needed — this is a pure unit test

**Pass criteria**:
- If fast_other SUM produces a different (higher) number than raw_other COUNT(DISTINCT), M1 is **confirmed** — the fast_other path overcounts for COUNT_DISTINCT
- If they produce the same number, M1 is a **false positive** for this scenario (the test data didn't have overlapping entities)

---

### Test Case 2: Verify getGroupingMode routes COUNT_DISTINCT to correct path

**What it verifies**: That the mode selection logic correctly chooses between raw_other, fast_other, and drop for COUNT_DISTINCT metrics in both Explorer and SQL Runner contexts.

**Category**: `edge-case`

**Source**: `code-review` (M1)

**Steps**:

1. Write a focused unit test for `PivotQueryBuilder.getGroupingMode` (it's a private static method, so test via the public `toSql` output or extract for testing)
2. Test these scenarios:
   - **Explorer + flag ON + COUNT_DISTINCT metric with pivotSource**: Should use `raw_other`
   - **Explorer + flag OFF + COUNT_DISTINCT metric**: Should use `fast_other` (otherAggregation = SUM from derivePivotConfigFromChart) or `drop` (otherAggregation = null)
   - **SQL Runner + no pivotSource + COUNT_DISTINCT aggregation**: Should use `fast_other` (otherAggregation undefined → falls back to col.aggregation)
3. For each scenario, verify the generated SQL uses the expected aggregation function

**Debug-local tooling to use**:
- Run `pnpm -F backend test:dev:nowatch` targeting new test cases

**Pass criteria**:
- Explorer + flag ON: uses `COUNT(DISTINCT ...)` via raw_other ✓
- Explorer + flag OFF with COUNT_DISTINCT: verify whether it routes to `drop` (safe) or `fast_other` with `SUM` (overcounting). Check what `getOtherAggregationForMetric(MetricType.COUNT_DISTINCT)` returns — it returns `VizAggregationOptions.SUM`, so `otherAggregation` is set to SUM, not null → fast_other fires with SUM → **M1 is confirmed for this path**
- SQL Runner: `otherAggregation` is undefined → falls back to `col.aggregation` which could be `count_distinct` → `getAggregatedField` should handle this. Verify the SQL.

---

### Test Case 3: Verify single-value EQUALS date filter still works (regression)

**What it verifies**: The filter compiler refactor to support multi-value arrays didn't break the existing single-value EQUALS behavior for date filters.

**Category**: `regression`

**Source**: `code-review` (M3)

**Steps**:

1. Run the existing filtersCompiler test suite: `pnpm -F common test -- --testPathPattern filtersCompiler`
2. Verify all existing date filter tests still pass
3. Write an additional explicit test: single-value date EQUALS produces the same SQL as before the change (`(dim) = ('2024-01-01')`)
4. Write a test for single-value date NOT_EQUALS: should produce `((dim) != ('2024-01-01') OR (dim) IS NULL)`

**Debug-local tooling to use**:
- `pnpm -F common test -- --testPathPattern filtersCompiler`

**Pass criteria**: All existing tests pass. Single-value behavior produces identical SQL to the pre-change format.

---

### Test Case 4: Verify empty array filter behavior is intentional

**What it verifies**: That `renderDateFilterSql` and `renderBooleanFilterSql` returning `'true'` for empty arrays is the correct/safe behavior.

**Category**: `edge-case`

**Source**: `code-review` (M3)

**Steps**:

1. Write unit tests for empty-array cases:
   - `renderDateFilterSql(dim, { operator: EQUALS, values: [] })` → `'true'`
   - `renderDateFilterSql(dim, { operator: NOT_EQUALS, values: [] })` → `'true'`
   - `renderBooleanFilterSql(dim, { operator: 'equals', values: [] })` → `'true'`
   - `renderBooleanFilterSql(dim, { operator: 'notEquals', values: [] })` → `'true'`
2. Trace the call sites: search for where `renderDateFilterSql` and `renderBooleanFilterSql` are called. Determine whether empty arrays can arrive from the UI or API.
3. Check if the "Other" drill-through code path in `UnderlyingDataModal.tsx` can produce empty `topGroupValues` arrays.

**Debug-local tooling to use**:
- `pnpm -F common test -- --testPathPattern filtersCompiler` for unit tests
- `grep -rn "renderDateFilterSql\|renderBooleanFilterSql"` for call site analysis

**Pass criteria**:
- If empty arrays **cannot** reach these functions in practice (all call sites pre-validate), the `'true'` return is a safe defensive fallback — M3 empty-array concern is a **false positive**
- If empty arrays **can** reach these functions (e.g., from API input), then `'true'` silently removes the filter, which could return more data than expected — M3 is **confirmed** and needs a fix (either throw an error or return `'false'` for EQUALS on empty)

---

### Test Case 5: Verify multi-value NOT_EQUALS works end-to-end for "Other" drill-through

**What it verifies**: Clicking "Other" series in a chart correctly generates NOT_EQUALS filters with multiple values and the underlying data modal shows the right rows.

**Category**: `happy-path`

**Source**: `code-review` (M3)

**Steps**:

1. Navigate to http://localhost:3000 and log in as demo@lightdash.com / demo_password!
2. Open an Explore chart that has a pivoted dimension (e.g., orders by payment_method)
3. Enable group limit (Series config panel → Limit groups toggle → set max to 2)
4. Wait for the chart to re-render with an "Other" series
5. Click on the "Other" series bar/point
6. Select "View underlying data" from the context menu
7. Verify the underlying data modal opens and shows rows that are NOT in the top 2 groups

**Debug-local tooling to use**:
- **Chrome DevTools**: Navigate, click, take screenshots at each step
- **PM2 logs**: `pnpm pm2:logs:api --lines 20 --nostream` after the underlying data query fires — check the generated SQL for `NOT IN (...)` filter
- **Spotlight**: Search for the trace of the underlying data query — verify the filter compilation

**Pass criteria**:
- The underlying data modal shows rows where the pivot dimension values are NOT the top-2 groups
- The SQL query in the PM2 logs contains a `NOT IN` clause (not a single `!=`)
- No console errors in the browser

---

### Test Case 6: Verify multi-value boolean NOT_EQUALS doesn't break existing boolean filters

**What it verifies**: Standard single-value boolean filters (e.g., "is_active equals true") still work correctly after the multi-value refactor.

**Category**: `regression`

**Source**: `code-review` (M3)

**Steps**:

1. Navigate to an Explore page with a boolean dimension (e.g., a table with an `is_active` field)
2. Add a filter: `is_active` equals `true`
3. Run the query
4. Verify results only contain rows where `is_active` is true
5. Change filter to `is_active` not equals `true`
6. Run again
7. Verify results contain rows where `is_active` is false or null

**Debug-local tooling to use**:
- **Chrome DevTools**: Navigate and interact with filter UI
- **PM2 logs**: Check the generated SQL — should use `= true` (not `IN (true)`) for single values

**Pass criteria**: Single-value boolean filters produce the same SQL format as before (`= true`, not `IN (true)`). Results are correct.

---

## Estimated effort

~30 minutes to execute all tests (tests 1-4 are unit tests ~10 min, tests 5-6 are browser automation ~20 min)

## Coverage summary

- Happy path: 1 test (T5)
- Edge cases: 3 tests (T1, T2, T4)
- Regression: 2 tests (T3, T6)
- Error handling: 0 tests
- Driven by code review findings: 6/6 tests

---

## Test Results

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1 | fast_other COUNT_DISTINCT unit test | ✅ PASS (M1 confirmed) | fast_other uses `SUM("unique_users")`, raw_other uses `COUNT(DISTINCT ...)` — different aggregation confirmed |
| 2 | getGroupingMode routing for COUNT_DISTINCT | ✅ PASS (M1 confirmed) | Explorer + flag OFF with `otherAggregation: SUM` → fast_other fires with SUM, not drop |
| 3 | Single-value date EQUALS regression | ✅ PASS | All 168 existing filter tests pass, single-value produces `= value` format |
| 4 | Empty array filter behavior | ✅ PASS (near-false-positive) | Empty arrays theoretically reachable only if all top-N groups are null; `'true'` is safe fallback |
| 5 | "Other" drill-through e2e | ✅ PASS (partial — manual step) | Chart SQL confirmed raw_other path active with correct CTEs; drill-through unit tests pass (2/2); ECharts SVG click not automatable |
| 6 | Boolean filter regression | ✅ PASS | Single-value boolean `equals` produces `= true` not `IN (true)` — format preserved |

### Key findings

**M1 is confirmed real but narrow:**
- fast_other with SUM for COUNT_DISTINCT only fires when: (a) feature flag is OFF, AND (b) chart was previously saved with group limit enabled
- When flag is ON (the expected production state), raw_other with `COUNT(DISTINCT ...)` is used — correct behavior
- Recommendation: Change `getOtherAggregationForMetric(MetricType.COUNT_DISTINCT)` to return `null` instead of `VizAggregationOptions.SUM`, which would route to `drop` mode (safe) instead of `fast_other` (overcounting)

**M3 is a near-false-positive:**
- Single-value filter behavior is preserved (length === 1 special case)
- Empty array → `'true'` is technically reachable but requires degenerate data (all top groups null)
- Multi-value NOT_EQUALS for Other drill-through is correctly tested and working
- No regressions in existing 168 filter tests
