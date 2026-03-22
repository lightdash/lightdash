# Pull Request Review: feat: Add group limiting feature to aggregate small chart groups

**PR**: lightdash/lightdash#19865
**Branch**: `claude/plan-issue-13561-zpUFR`
**Reviewed**: 2026-03-21

## Executive Summary

This PR implements a "group limit" feature for Cartesian charts that caps visible pivot groups to a configurable max, aggregating the rest into an "Other" bucket at the SQL level. It spans backend SQL generation (PivotQueryBuilder, MetricQueryBuilder), frontend UI (config panels, series rendering, drill-through), database migration, and feature flagging. The implementation is thorough with three grouping modes (raw_other, fast_other, drop) chosen based on metric type support.

**Recommendation**: Request Changes — 2 high-priority issues should be addressed before merge.

## Unaddressed Comments

No review comments from other reviewers yet.

## Critical Findings

None.

## High Priority Findings

### H1. Sentinel value interpolated directly into SQL string

**Files**: `PivotQueryBuilder.ts:473`, `PivotQueryBuilder.ts:659`

The `OTHER_GROUP_SENTINEL_VALUE` (`'$$_lightdash_other_$$'`) is interpolated directly into SQL template literals:
```typescript
`CASE WHEN gr.__group_rn <= ${maxGroups} THEN CAST(ss.${q}${col.reference}${q} AS TEXT) ELSE '${OTHER_GROUP_SENTINEL_VALUE}' END`
```

While the sentinel value is a hardcoded constant (not user input) so this isn't exploitable, it violates the project's general pattern of parameterized values and creates a maintenance risk — if the constant ever changes to include a quote character, it becomes a SQL injection. Consider using the warehouse's parameterization mechanism or at minimum adding a compile-time assertion that the sentinel contains no single quotes.

### H2. Hardcoded force-enabled feature flag on frontend will ship to production

**File**: `packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts:19`

```typescript
const FORCED_LOCAL_FEATURE_FLAGS = new Set<string>(['group-limit-enabled']);
```

This forces the `group-limit-enabled` flag to `true` in `import.meta.env.DEV` mode. However, the backend equivalent in `FeatureFlagModel.ts` uses the `LIGHTDASH_FORCED_FEATURE_FLAGS` env var, which is a clean approach. The frontend hardcoded set should be **empty by default** or driven by an env var, so the feature flag actually gates the feature in development unless explicitly opted in. As written, every developer running in dev mode sees this feature regardless of PostHog flag state, which undermines the purpose of feature flagging during development.

### H3. Dead code / incomplete refactor in `useEchartsCartesianConfig.ts`

**File**: `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.ts:2333-2346`

```typescript
const { rows: rawRows, rowKeyMap: rawRowKeyMap } = useMemo(() => { ... });
const rows = rawRows;
const rowKeyMap = rawRowKeyMap;
```

The rename-and-reassign pattern suggests an incomplete refactor — likely a group-limit transformation was intended here but removed. This is dead code that should be cleaned up (just keep the original `rows`/`rowKeyMap` destructuring).

## Medium Priority Findings

### M1. `getOtherAggregationForMetric` maps COUNT/COUNT_DISTINCT → SUM which is semantically incorrect for fast_other path

**File**: `packages/common/src/pivot/derivePivotConfigFromChart.ts:165-168`

```typescript
case MetricType.COUNT:
case MetricType.COUNT_DISTINCT:
    return VizAggregationOptions.SUM;
```

For the `fast_other` path, COUNT and COUNT_DISTINCT are mapped to SUM as the `otherAggregation`. This means pre-aggregated counts from `group_by_query` are re-summed. For COUNT this is correct (sum of counts = total count). For COUNT_DISTINCT this is **incorrect** — summing per-group distinct counts overcounts when entities appear in multiple groups. The `raw_other` path handles this correctly with `COUNT(DISTINCT ...)`, but the `fast_other` fallback will produce wrong results.

This is partially mitigated because `raw_other` mode is preferred when `pivotSource` is available (which it is for Explorer charts). However, if the raw_other path is unavailable (no pivotSource), the fast_other path will silently produce wrong numbers for COUNT_DISTINCT metrics.

### M2. `_options` parameter in `CartesianChartDataModel.getSpec()` is unused

**File**: `packages/common/src/visualizations/CartesianChartDataModel.ts:572`

```typescript
getSpec(
    display?: CartesianChartDisplay,
    colors?: Organization['chartColors'],
    _options?: { applyGroupLimit?: boolean },
)
```

The `_options` parameter is never read in the method body. This appears to be scaffolding for a future feature but adds confusion. Either implement it or remove it.

### M3. Filter compiler changes have broader impact than group limit feature

**File**: `packages/common/src/compiler/filtersCompiler.ts`

The changes to `renderDateFilterSql` and `renderBooleanFilterSql` expand EQUALS/NOT_EQUALS to support multi-value arrays (IN/NOT IN). While needed for "Other" drill-through, these changes affect **all** filter compilation globally. The test coverage (34 lines added) seems thin for such a fundamental change. Verify that existing filter behavior is preserved, particularly:
- Single-value EQUALS still works (no regression)
- Empty array returns `'true'` — is this the desired behavior? It means "no filter applied" which could inadvertently return all data.

### M4. Plan documents committed to repo root

**Files**: `plans/fix-count-distinct-other-aggregation.md`, `plans/group-limit-risk-test-plan.md`

These are development artifacts (~1,475 lines combined) that add noise to the repo. Consider whether these should live in the PR description or a separate documentation space rather than being committed.

## Low Priority Findings

### L1. Two near-identical GroupLimitConfig components

**Files**:
- `packages/frontend/src/components/DataViz/config/DataVizGroupLimitConfig.tsx` (SQL Runner)
- `packages/frontend/src/components/VisualizationConfigs/ChartConfigPanel/Series/GroupLimitConfig.tsx` (Explorer)

These components have nearly identical UI logic (switch + number input + helper text). The Explorer version is a pure presentational component while the DataViz version connects to Redux. Consider extracting the shared UI into a single component that accepts props.

### L2. Inconsistent null handling in `getPivotColumnValueKey`

**File**: `packages/backend/src/services/pivotColumnReference.ts:5`

```typescript
export const getPivotColumnValueKey = (value: AnyType): string =>
    value === null ? NULL_PIVOT_COLUMN_VALUE_KEY : String(value);
```

This handles `null` but not `undefined`. If an `undefined` value slips through, `String(undefined)` produces `"undefined"` which could collide with a real dimension value "undefined". Consider handling both null and undefined.

### L3. `maxGroups` validated with `Math.max(1, Math.floor(...))` but no upper bound

**File**: `PivotQueryBuilder.ts:1694`

The lower bound is enforced (`>= 1`) but there's no upper bound check. If a user sets maxGroups to an extremely large number (e.g., 999999), the ranking CTEs still execute but add overhead for no benefit since all groups would be "top N". Consider short-circuiting to `'none'` mode when `maxGroups >= totalGroups`.

## Positive Observations

1. **Three-tier grouping strategy** (raw_other, fast_other, drop) is well-designed — it correctly handles different metric types with appropriate SQL strategies and gracefully degrades when raw source data isn't available.

2. **Sentinel value approach** (`$$_lightdash_other_$$`) to prevent collision with real dimension values named "Other" is a good design decision.

3. **Null-safe joins** throughout the SQL generation prevent silent data loss when pivot columns contain NULL values.

4. **Feature flag gating** is properly implemented on both frontend and backend, with an environment variable override for development.

5. **Comprehensive test coverage** — ~1,600 lines of new tests across PivotQueryBuilder, MetricQueryBuilder, AsyncQueryService, filter compiler, and frontend hooks.

6. **Drill-through for "Other" groups** is correctly implemented using NOT_EQUALS filters against the top-N values, which is the right semantic approach.

7. **Database migration** is clean and reversible with proper nullable column.

## Final Recommendation

**Decision**: Request Changes

**Next Steps**:
1. **H2**: Remove `'group-limit-enabled'` from `FORCED_LOCAL_FEATURE_FLAGS` or make it env-var driven
2. **H3**: Clean up the dead code in `useEchartsCartesianConfig.ts`
3. **M1**: Consider whether fast_other path for COUNT_DISTINCT needs a warning or should fall through to `drop` mode
4. **M3**: Add more test coverage for multi-value filter compilation edge cases
5. **M4**: Remove plan documents from the PR or move to a docs folder
