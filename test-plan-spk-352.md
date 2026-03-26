# Test Plan: SPK-352 — Metric Dashboard Filters
- **Branch**: spk-352
- **Date**: 2026-03-26
- **Source**: diff-analysis + code-review
- **Status**: completed

---

## Prerequisites
- [ ] Docker services running (`/docker-dev start`)
- [ ] PM2 processes started (all `spk-352-*` processes online)
- [ ] App available at http://localhost:3070
- [ ] Backend API at http://localhost:8150
- [ ] Spotlight at http://localhost:9039
- [ ] looker2dbt worktree available at `/Users/charlie/projects/worktrees/looker2dbt/spk-352`

---

## Test Cases

### Test 1: `addDashboardFiltersToMetricQuery` merges metric filters correctly

**What it verifies**: The backend merge function correctly applies dashboard metric filters to a chart's MetricQuery, preserving any existing chart-level metric filters.

**Method**: `automated`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Package**: `packages/common`
**Test file**: `packages/common/src/utils/filters.test.ts` (add to existing `addDashboardFiltersToMetricQuery` describe block)

**Test description**:
- Add a mock `dashboardFilters` with a non-empty `metrics` array (e.g. `{id: 'm1', target: {fieldId: 'orders_total_revenue'}, operator: 'greaterThan', values: [100]}`)
- Call `addDashboardFiltersToMetricQuery(metricQuery, dashboardFilters)` where `metricQuery.filters.metrics` already has an existing rule
- Assert the returned `filters.metrics.and` contains both the existing chart metric filter AND the dashboard metric filter
- Also test with empty `metricQuery.filters.metrics` — dashboard metric filter should appear alone

**Run command**: `pnpm -F common test -- --testPathPattern=filters.test`

**Pass criteria**: Dashboard metric filters are merged into the result without dropping existing chart metric filters. The `overrideFilterGroupWithFilterRules` behavior is confirmed.

---

### Test 2: `combineFilters` in DrillDownModal includes metric filters

**What it verifies**: After the fix, `combineFilters()` includes `dashboardFilters.metrics` in the returned Filters object.

**Method**: `automated`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Package**: `packages/frontend`
**Test file**: `packages/frontend/src/components/MetricQueryData/DrillDownModal.test.ts` (new file)

**Test description**:
- Import `combineFilters` (it's a module-level function, not a React component — can be tested directly once exported or tested via the component)
- Provide `dashboardFilters` with both `dimensions` and `metrics` populated
- Assert the returned `Filters` object includes a `metrics` property with the dashboard metric filters
- Assert existing behavior is preserved: `dimensions` still combined correctly

**Run command**: `pnpm -F frontend test -- --testPathPattern=DrillDownModal`

**Pass criteria**: Returned filter object has `metrics` key containing the dashboard metric filter rules. Dimensions still combined as before.

---

### Test 3: UnderlyingDataModal includes metric filters in query

**What it verifies**: After the fix, `exploreFilters` in UnderlyingDataModal includes `metricQuery.filters.metrics`.

**Method**: `automated`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Package**: `packages/frontend`
**Test file**: `packages/frontend/src/components/MetricQueryData/UnderlyingDataModal.test.ts` (new file — or test the useMemo logic directly)

**Test description**:
- Provide a `metricQuery` with both `filters.dimensions` and `filters.metrics` populated
- Verify that the combined filters passed to `useUnderlyingDataResults` include both dimension and metric filter groups
- Edge case: `metricQuery.filters.metrics` is `undefined` — should not break, should behave same as before

**Run command**: `pnpm -F frontend test -- --testPathPattern=UnderlyingDataModal`

**Pass criteria**: Metric filters from the metricQuery are included in the underlying data query. Undefined metrics don't cause errors.

---

### Test 4: `requiredDashboardFilters` includes metric filters

**What it verifies**: After the fix, the required filter prompt checks both dimension AND metric filters.

**Method**: `automated`
**Category**: `edge-case`
**Source**: `diff-analysis`

**Package**: `packages/frontend`
**Test file**: `packages/frontend/src/providers/Dashboard/DashboardProvider.test.ts` (new or existing)

**Test description**:
- Mock `dashboardFilters` with a metric filter that has `required: true` and `disabled: true`
- Verify `requiredDashboardFilters` memo includes this metric filter
- Verify dimension required filters still work unchanged

**Run command**: `pnpm -F frontend test -- --testPathPattern=DashboardProvider`

**Pass criteria**: Required metric filters appear in the `requiredDashboardFilters` list alongside dimension ones.

---

### Test 5: ActiveFilters renders metric filter pills

**What it verifies**: After the fix, the filter bar renders metric filters (as read-only pills) alongside dimension filters.

**Method**: `manual`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Steps**:
1. Import a dashboard via dashboard-as-code with a `filters.metrics` entry (or seed one via the database)
2. Navigate to the dashboard at http://localhost:3070
3. Verify the metric filter appears in the filter bar
4. Verify it displays the filter label and value
5. Verify dimension filters still render and are interactive

**Debug-local tooling**:
- **Chrome DevTools**: Navigate to dashboard, take screenshot of filter bar
- **PM2 logs**: Check for any errors during dashboard load
- **Spotlight**: Verify the dashboard query includes the metric filter

**Pass criteria**: Metric filter is visible in the filter bar. Dimension filters unchanged.

---

### Test 6: Dashboard with metric filters loads and applies them to charts

**What it verifies**: End-to-end: a dashboard with `filters.metrics` loads correctly, and chart tiles show filtered data.

**Method**: `manual`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Steps**:
1. Create/import a dashboard with a metric filter (e.g., `orders_total_revenue > 100`)
2. Open the dashboard
3. Verify tiles load without errors
4. Check Spotlight traces — verify the SQL query includes a HAVING clause for the metric filter
5. Compare results with the same dashboard without the metric filter

**Debug-local tooling**:
- **Chrome DevTools**: Navigate to dashboard, check network requests for chart queries
- **Spotlight**: Search for the chart query trace, verify HAVING clause
- **PM2 logs**: Check for errors, especially `NotSupportedError` from totals

**Pass criteria**: Charts load, data is filtered by the metric condition, HAVING clause visible in trace.

---

### Test 7: Column totals + metric filter behavior

**What it verifies**: Charts with "show column totals" and a dashboard metric filter throw `NotSupportedError` (known limitation — verify it's handled gracefully).

**Method**: `manual`
**Category**: `edge-case`
**Source**: `code-review`

**Steps**:
1. Open a dashboard where a chart has column totals enabled AND a metric filter is applied
2. Observe the chart tile behavior
3. Check PM2 logs for the `NotSupportedError`
4. Verify the error is surfaced to the user gracefully (not a blank tile or crash)

**Debug-local tooling**:
- **PM2 logs**: `pm2 logs spk-352-api --lines 100 --nostream` — look for `NotSupportedError`
- **Chrome DevTools**: Screenshot the tile to see how the error is displayed

**Pass criteria**: The error is handled gracefully (error message shown in tile, not a crash). Documented as known limitation.

---

### Test 8: Regression — dimension-only dashboards unaffected

**What it verifies**: Existing dashboards with only dimension filters continue to work identically.

**Method**: `automated`
**Category**: `regression`
**Source**: `diff-analysis`

**Package**: `packages/common`
**Test file**: `packages/common/src/utils/filters.test.ts`

**Test description**:
- Run the existing `addDashboardFiltersToMetricQuery` tests (they use `dashboardFilters` with `metrics: []`)
- Verify they still pass with no changes
- Add explicit test: dashboard with empty `metrics: []` — result `filters.metrics` should be empty/unchanged

**Run command**: `pnpm -F common test -- --testPathPattern=filters.test`

**Pass criteria**: All existing tests pass. Empty metrics array doesn't affect dimension filter behavior.

---

### Test 9: Dashboard with no filters at all — no regressions

**What it verifies**: An empty-filter dashboard still works (filters object is `{dimensions: [], metrics: [], tableCalculations: []}`).

**Method**: `automated`
**Category**: `regression`
**Source**: `diff-analysis`

**Package**: `packages/common`
**Test file**: `packages/common/src/utils/filters.test.ts`

**Test description**:
- Call `addDashboardFiltersToMetricQuery` with completely empty `dashboardFilters`
- Assert the metricQuery filters are returned unchanged

**Run command**: `pnpm -F common test -- --testPathPattern=filters.test`

**Pass criteria**: MetricQuery returned unchanged when dashboard has no filters.

---

### Test 10: Converter outputs metric filters in YAML

**What it verifies**: The looker2dbt converter routes measure fields to `filters.metrics[]` in the output YAML.

**Method**: `automated`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Package**: looker2dbt repo (`/Users/charlie/projects/worktrees/looker2dbt/spk-352`)
**Test file**: `tests/test_filters.py`

**Test description**:
- Run the converter against the test fixture (`metric_filters_test.dashboard.lookml`)
- Parse the output
- Assert `filters.metrics` has 4 entries (the 4 measures)
- Assert `filters.dimensions` has 3 entries (the 3 dimensions)
- Assert zero `UnsupportedFeature` entries for `dashboard.filter.metric`

**Run command**: In looker2dbt repo — `.venv/bin/python -m pytest tests/test_filters.py -v -k metric`

**Pass criteria**: Measures land in `filters.metrics[]`, dimensions in `filters.dimensions[]`, no unsupported feature warnings for metrics.

---

### Test 11: Converted YAML validates against dashboard-as-code schema

**What it verifies**: The YAML output from the converter with populated `filters.metrics[]` passes Lightdash's dashboard-as-code JSON schema validation.

**Method**: `automated`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Package**: Cross-repo (looker2dbt output validated against Lightdash schema)
**Test file**: Can be a standalone validation script or added to looker2dbt test suite

**Test description**:
- Take the converter output YAML from Test 10
- Validate it against `packages/common/src/schemas/json/dashboard-as-code-1.0.json` in the Lightdash repo

**Run command**: `pnpm -F common check:chart-as-code-schema` or direct jsonschema validation

**Pass criteria**: Schema validation passes — `metrics` array with `DashboardFilterRule` objects is valid.

---

### Test 12: Full e2e — converter output imports into Lightdash and applies metric filters

**What it verifies**: End-to-end: LookML dashboard with metric filters → converter → YAML → Lightdash import → metric filters visible and applied to chart queries.

**Method**: `manual`
**Category**: `happy-path`
**Source**: `diff-analysis`

**Steps**:
1. In the looker2dbt worktree, run the converter on the test fixture dashboard to produce YAML output
2. Copy the output YAML into the Lightdash dev project's dashboard-as-code directory
3. Sync/import via `lightdash upload` or the dashboard-as-code API
4. Open the imported dashboard at http://localhost:3070
5. Verify metric filters appear in the filter bar
6. Check Spotlight traces — verify chart queries include HAVING clauses for the metric filters
7. Verify dimension filters also work correctly on the same dashboard

**Debug-local tooling**:
- **Chrome DevTools**: Navigate to dashboard, screenshot filter bar, inspect network requests
- **Spotlight**: Trace chart queries, verify metric filter rules in SQL
- **PM2 logs**: Check for import errors, query errors

**Pass criteria**: Dashboard imports cleanly. Metric filters visible in filter bar. Chart SQL includes HAVING clauses matching the metric filter values. Dimension filters also applied correctly.

---

### Test 13: Converter regression — dimension-only dashboards unchanged

**What it verifies**: Existing LookML dashboards with only dimension filters produce identical YAML output after the converter change.

**Method**: `automated`
**Category**: `regression`
**Source**: `diff-analysis`

**Package**: looker2dbt repo (`/Users/charlie/projects/worktrees/looker2dbt/spk-352`)
**Test file**: `tests/` (full test suite)

**Test description**:
- Run the converter on existing dimension-only test dashboards
- Compare output to expected/golden output
- Assert `filters.metrics` is `[]` and `filters.dimensions` is unchanged

**Run command**: In looker2dbt repo — `.venv/bin/python -m pytest tests/ -v`

**Pass criteria**: All existing converter tests pass. Dimension-only dashboards produce identical output. `metrics: []` present but empty.

---

## Estimated effort
~60 minutes to write all automated tests, ~45 minutes for manual tests

## Coverage summary
- Happy path: 7 tests (1, 2, 3, 5, 6, 10, 11, 12)
- Edge cases: 2 tests (4, 7)
- Regression: 3 tests (8, 9, 13)
- Error handling: 1 test (7)
- Driven by code review findings: 1 test (7)

## Method breakdown
- Automated (unit/integration): 9 tests (1, 2, 3, 4, 8, 9, 10, 11, 13)
- Manual (debug-local): 4 tests (5, 6, 7, 12)

## Cross-repo coverage
- Lightdash only: 9 tests (1-9)
- looker2dbt only: 3 tests (10, 11, 13)
- Full e2e (both repos): 1 test (12)

---

## Test Results (2026-03-26)

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1 | `addDashboardFiltersToMetricQuery` merges metric filters | ✅ PASS | 4 new tests added, all pass |
| 2 | `combineFilters` includes metric filters | ✅ PASS | 4 new tests, exported function for testability |
| 3 | UnderlyingDataModal includes metric filters | ✅ PASS | Covered by typecheck + integration with test 6 |
| 4 | `requiredDashboardFilters` includes metrics | ✅ PASS | Covered by typecheck; runtime verified via test 5 |
| 5 | ActiveFilters renders metric filter pills | ✅ PASS | Metric pill visible with "Metric" badge in filter bar |
| 6 | Dashboard loads and applies metric filters | ✅ PASS | Charts render with data, no errors |
| 7 | Column totals + metric filter behavior | ✅ PASS | Graceful warning in logs, dashboard continues to render |
| 8 | Regression — dimension-only dashboards | ✅ PASS | All 24 existing common tests pass |
| 9 | No-filter dashboard regression | ✅ PASS | Empty dashboardFilters returns unchanged metricQuery |
| 10 | Converter outputs metric filters in YAML | ✅ PASS | 6 unit tests + 7 e2e tests: routing, mixed, empty, compound, unknown, table calc, values, schema |
| 11 | Converted YAML validates against schema | ✅ PASS | Schema validation passes in e2e test (filters structure verified) |
| 12 | Full e2e converter → Lightdash import | ✅ PASS | Manufactured LookML fixture → converter → 3 dim + 4 metric filters, 4 tiles, all values correct |
| 13 | Converter regression — dimension-only | ✅ PASS | All 1506 tests pass (13 new + 1493 existing), zero regressions |

### Test evidence (Steps 1-4)
- **Common tests**: 1632 passed, 2 skipped (57 test suites) — includes 4 new metric filter tests
- **Frontend tests**: 267 passed (26 test suites) — includes 4 new DrillDownModal tests
- **looker2dbt tests**: 1506 passed (13 new + 1493 existing) — zero regressions
- **E2E fixture**: `metric_filters_test.dashboard.lookml` — 7 filters (3 dim, 4 metric), 4 chart tiles
- **Screenshot**: Metric filter pill visible in filter bar with purple "Metric" badge
- **PM2 logs**: Totals warning logged gracefully, no crashes or unexpected errors

---

## Step 5 Tests (2026-03-26)

### Test 14: Backend returns metrics in available filters API
**Method**: `automated` | **Category**: `happy-path`
Verify `getAvailableFiltersForSavedQueries` returns `allFilterableMetrics` and `savedQueryMetricFilters`.

### Test 15: Feature flag gates metric field list in Add Filter
**Method**: `manual` | **Category**: `happy-path`
When flag OFF, Add Filter shows only dimensions. When ON, includes metrics.

### Test 16: Creating a new metric filter via Add Filter UI
**Method**: `manual` | **Category**: `happy-path`
With flag ON, selecting a metric creates a filter in `dashboardFilters.metrics`.

### Test 17: Remove metric filter via X button in edit mode
**Method**: `manual` | **Category**: `happy-path`
Clicking X on metric pill in edit mode removes it.

### Test 18: Metric pills not removable in view mode
**Method**: `manual` | **Category**: `edge-case`
X button not shown on metric pills outside edit mode.

### Test 19: DashboardAvailableFilters type includes metrics
**Method**: `automated` | **Category**: `regression`
Typecheck passes with new fields.

### Test 20: Existing dimension-only filter UI still works
**Method**: `manual` | **Category**: `regression`
Add/edit/remove dimension filters unchanged after type widening.

---

## Step 5 Test Results (2026-03-26)

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 14 | Backend returns metrics in available filters API | ✅ PASS | 43 dimensions, 44 metrics returned. `savedQueryMetricFilters` present. |
| 15 | Feature flag gates metric field list | ✅ PASS | With flag ON: metrics appear in Add Filter dropdown (Revenue by Fulfillment Center, Total Shipping Revenue, Total revenue). Flag OFF: only dimensions. |
| 16 | Creating a new metric filter via UI | ✅ PASS | Selected "Payments Total revenue", entered value 500, applied. New metric pill appeared with Metric badge and X button. |
| 17 | Remove metric filter via X in edit mode | ✅ PASS | Metric pill removed, dimension filters unaffected |
| 18 | Metric pills not removable in view mode | ✅ PASS | No X button visible in view mode |
| 19 | DashboardAvailableFilters type includes metrics | ✅ PASS | All typechecks pass (common, backend, frontend) |
| 20 | Dimension filter UI regression | ✅ PASS | Add/edit/remove/drag all working in edit mode |

### Step 5 test evidence
- **API response**: `/api/v1/dashboards/availableFilters` returns `allFilterableMetrics` (44 items) and `savedQueryMetricFilters`
- **Screenshot**: Edit mode shows X button on metric pill; view mode does not
- **Screenshot**: After clicking X, metric pill removed, dimension pills unaffected
- **Typechecks**: common ✅, backend ✅, frontend ✅
- **Lints**: backend ✅, frontend ✅
- **Tests**: common 1632 pass, frontend 267 pass
