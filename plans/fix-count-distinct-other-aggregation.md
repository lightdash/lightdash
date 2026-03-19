# Fix DISTINCT "Other" Group Aggregation

## Problem

When grouping pivot/chart series into top-N + "Other", the current implementation re-aggregates already-aggregated metric values.

That is wrong for distinct-style metrics:

- `COUNT_DISTINCT`
- `SUM_DISTINCT`
- `AVERAGE_DISTINCT`

These metrics must be recomputed from the scoped raw rows for the final bucket, not merged with a second `SUM(...)` over per-group aggregates.

**Example:**

```text
Top N keeps regions A and B
All other regions are merged into "Other"

If customer 123 appears in both region C and region D:
- SUM(COUNT_DISTINCT(customer_id)) counts customer 123 twice
- COUNT(DISTINCT customer_id) over the merged "Other" bucket counts it once
```

`SUM_DISTINCT` and `AVERAGE_DISTINCT` have the same issue for the same reason: duplicates can span multiple groups that later collapse into `"Other"`.

## Root Cause

The current `"Other"` pipeline works on `original_query`, which is already aggregated:

```text
original_query
  -> pre_group_by
  -> __group_ranking
  -> group_by_query
```

That is fine for additive metrics like `SUM`, `COUNT`, `MIN`, `MAX`.

It is not fine for distinct-style metrics because once the source rows have already been aggregated per group, duplicates across groups are gone from the query input. At that point:

- `SUM(COUNT_DISTINCT(x))` is not equal to `COUNT_DISTINCT(x)` on the merged bucket
- `SUM(SUM_DISTINCT(x))` is not equal to `SUM_DISTINCT(x)` on the merged bucket
- averaging already-deduped group averages is not equal to `AVERAGE_DISTINCT(x)` on the merged bucket

The original plan proposed rebuilding the raw query from `FROM/JOIN/WHERE` fragments inside `PivotQueryBuilder`. That is not safe enough:

- aliases from `original_query` do not exist in raw SQL
- custom/bin dimension CTEs and helper joins can be lost
- metric-filter scope can change
- parameter replacement would need to be repeated on ad hoc fragments

## Solution

Add a reusable raw `pivot_source` relation to `MetricQueryBuilder`, and use that relation only when `"Other"` is enabled and at least one distinct-style metric is present.

### Evidence collected during investigation

- A live end-to-end reproduction on `customers_unique_customer_count` grouped by `orders_order_date_month` with `groupLimit.maxGroups = 2` returned:
  - pivoted result: `2025-01 = 40`, `2024-06 = 31`, `"Other" = 87`
  - true excluded-month union: `70`
  - overcount delta: `17`
  This proves the current `COUNT_DISTINCT` `"Other"` path is wrong in a real chart shape, not just in theory.
- A live end-to-end reproduction on `customers_total_order_amount_deduped` grouped by `payments_payment_method` with `groupLimit.maxGroups = 2` returned:
  - pivoted result: kept `credit_card = 2411.50`, `"Other" = 2969.36`
  - true deduped excluded-group sum over `orders.order_id`: `2650.41`
  - overcount delta: `318.95`
  This proves the same bug already exists for `SUM_DISTINCT` in real data.
- A forced live reproduction on `customers_avg_order_amount_deduped` grouped by `payments_payment_method` showed that if `AVERAGE_DISTINCT` is routed through the legacy fallback path:
  - pivoted result: kept `gift_card = 34.6769...`, `"Other" = 27.7228...`
  - true deduped excluded-group average over `orders.order_id`: `27.3429...`
  - delta: `0.3799...`
  This confirms `AVERAGE_DISTINCT` also needs bucket-aware dedup logic; re-aggregating per-group averages is not correct.
- A live `compileQuery` response for `customers_unique_customer_count` returned:
  - `compiledSql = COUNT(DISTINCT "customers".customer_id)`
  - `compiledValueSql = "customers".customer_id`
  This proves the simple `COUNT_DISTINCT` path already exposes a row-level input.
- The same live `compileQuery` call with pivoting enabled returned a `pivotQuery` that still does:
  - `pre_group_by AS (... sum("customers_unique_customer_count") ...)`
  - `group_by_query AS (... sum("customers_unique_customer_count") ...)`
  This ties the incorrect live `"Other" = 87` result directly to the current `SUM(...)` re-aggregation path.
- Matching live `pivotQuery` output for the other distinct-style metrics still uses the legacy aggregate-over-aggregate pattern:
  - `SUM_DISTINCT`: `pre_group_by AS (... sum("customers_total_order_amount_deduped") ...)`
  - `AVERAGE_DISTINCT`: `pre_group_by AS (... avg("customers_avg_order_amount_deduped") ...)`
  So the emitted SQL already matches the live divergences above.
- Current chart-to-pivot derivation still encodes the old fallback model:
  - `COUNT_DISTINCT` and `SUM_DISTINCT` map to `otherAggregation = SUM`
  - `AVERAGE_DISTINCT` maps to `otherAggregation = null`
  That means Step 2 is required to support `AVERAGE_DISTINCT` at all, and required to stop routing distinct metrics through the legacy fallback model.
- Separate live investigation found a general `groupLimit` null-ranking bug that is not specific to distinct metrics:
  - `__group_ranking` uses `ORDER BY __ranking_value DESC` without explicit null handling
  - `getGroupByQueryWithOtherSQL` and `getGroupByQueryWithDropSQL` join ranked groups back with plain equality instead of null-safe equality
  - result: a `NULL` group can consume a top-N slot, fail to match on join, and still collapse into `"Other"` or disappear
  This should be fixed independently or folded into the same change if the code paths are being touched together.
- Existing compiler mocks also include cases where `compiledValueSql` is already aggregate SQL such as:
  - `count(distinct ("events".user_id))`
  - `stddev(("events".amount))`
  - `sum(("events".amount)) / NULLIF((count(distinct ("events".user_id))), 0)`
  This disproves using `compiledValueSql` as a universal raw-row contract for every metric type.
- Existing `MetricQueryBuilder` tests for `SUM_DISTINCT` and `AVERAGE_DISTINCT` already prove the dedup strategy:
  - `ROW_NUMBER() OVER (...)`
  - `PARTITION BY <distinct keys>, <selected dimensions>`
  - float-cast division for `AVERAGE_DISTINCT`
- The current type comments for `compiledValueSql` / `compiledDistinctKeys` are narrower than the real compiler behavior:
  - comments still say `sum_distinct`
  - compiler populates distinct-key metadata for both `SUM_DISTINCT` and `AVERAGE_DISTINCT`
  This is another reason to introduce an explicit `pivotSource.metricInputs` contract instead of stretching the existing field comments into a public API.
- `MetricQueryBuilder` applies metric filters late enough in the compiled query flow that a raw re-aggregation path must be explicitly scoped back to `pre_group_by` output. `__pre_group_scope` is therefore required, not optional.

### Design goals

- Keep `original_query` as the source of truth for ranking and row scope
- Recompute distinct-style metrics from raw rows after bucket assignment
- Preserve the exact base query semantics:
  - base table
  - joins
  - dimension helper CTEs
  - dimension filters
  - parameter replacement
  - fanout-protection inputs
- Support mixed charts:
  - `COUNT_DISTINCT + SUM`
  - `SUM_DISTINCT + COUNT`
  - `AVERAGE_DISTINCT + SUM`

### New high-level pipeline

```text
1. original_query
   already aggregated
   still used for ranking and for determining which grouped rows survived filters

2. pre_group_by
   current pivot pre-aggregation over original_query

3. __group_totals / __group_ranking
   current top-N ranking logic

4. __pre_group_scope
   DISTINCT groupBy + index combinations from pre_group_by
   preserves metric-filtered row scope

5. pivot_source
   raw row relation built by MetricQueryBuilder
   includes:
   - dimension aliases needed by pivoting
   - _order columns for sorted bin dimensions
   - raw metric input columns
   - distinct key columns for SUM_DISTINCT / AVERAGE_DISTINCT

6. scoped_source
   pivot_source INNER JOIN __pre_group_scope
   keeps only raw rows that belong to grouped rows that survived original_query filters

7. bucketed_source
   CASE WHEN rank <= N THEN group ELSE 'Other'
   bucket assignment happens here, before distinct aggregation

8. metric aggregate CTEs
   - standard metrics aggregated from bucketed_source
   - COUNT_DISTINCT aggregated from bucketed_source
   - SUM_DISTINCT / AVERAGE_DISTINCT aggregated from bucketed_source via per-metric dedup CTEs

9. group_by_query
   joins the metric CTEs back into the normal pivot pipeline
```

## Key idea

Do not reconstruct raw SQL from pieces inside `PivotQueryBuilder`.

Instead, have `MetricQueryBuilder` emit a fully-formed raw `pivot_source` query that is built with the same compiler context as the main query. `PivotQueryBuilder` can then safely operate on stable aliases coming from `pivot_source`, just like it already does with `original_query`.

That avoids alias drift and keeps all the current query-building rules in one place.

Also: do not treat existing `CompiledMetric.compiledValueSql` as the universal API for this. The investigation showed it is reliable for some simple metrics, but not as a general raw-input contract. The plan should introduce an explicit compiler-owned raw re-aggregation contract instead.

---

## De-risking Principles

- Revert any previously committed backend changes for this feature before continuing implementation
- Treat current backend behavior as the baseline to preserve
- Use Strategy pattern to keep rollout logic separate from SQL assembly
- Keep existing functionality unchanged when the new rollout flag is off
- Ship the compiler contract before changing query behavior
- Fail closed:
  - if any required raw metric input is missing, force `drop`
  - never silently fall back to incorrect `SUM(...)`
- Narrow v1 scope to distinct-only value sets:
  - `COUNT_DISTINCT`
  - `SUM_DISTINCT`
  - `AVERAGE_DISTINCT`
- Keep mixed distinct + additive charts as `drop` until the raw path is proven in production-like tests
- Keep the separate null-group ranking/join bug out of the first implementation
- Add result-level differential tests, not only SQL snapshots

## De-risked Rollout

### Phase 0: Re-baseline current behavior

Before implementing the new raw distinct `"Other"` path:

- revert any backend changes that were previously committed specifically for this feature work
- re-establish the current backend behavior as the source-of-truth baseline
- add regression coverage for current flag-off behavior:
  - no group limit
  - existing `fast_other`
  - existing `drop`
- confirm the emitted SQL and results remain unchanged for the current paths before introducing the new strategy

This is important because the goal is to add a new opt-in backend capability, not to silently reshape existing functionality.

### Phase 1: Safe shippable fix

Implement only:

- `reAggregation` metadata
- `pivotSource` compiler contract
- service wiring for `pivotSource`
- raw `"Other"` recomputation for charts where **all** value columns are distinct-style metrics and every metric has the required raw contract

Keep as `drop` in phase 1:

- mixed distinct + additive charts
- unsupported/non-additive metrics
- any path missing `pivotSource`

This lands the correctness fix for the broken cases without taking on mixed-metric raw aggregation in the same release.

### Phase 2: Follow-up expansion

After phase 1 is stable, extend raw `"Other"` support to mixed charts where additive metrics also have explicit `pivotSource.metricInputs[metricId].strategy === 'standard'` coverage.

### Phase 3: Separate cleanup

Handle the null-ranking/null-join bug in its own PR unless implementation pressure makes that impossible. It is real, but it is not required to fix distinct-style `"Other"` correctness.

---

## Refactoring Approach

Use Refactoring.Guru's "replace conditional with polymorphism" here.

Instead of growing `PivotQueryBuilder` into a large branching tree, introduce a small planner / strategy layer that chooses one execution mode and explains why.

Also use Refactoring.Guru-style extraction refactors to preserve current behavior:

- Extract Class
  - move the existing `fast_other` path into `FastOtherStrategy`
  - move the existing `drop` path into `DropUnsupportedStrategy`
- Move Method
  - move SQL-assembly helpers into the owning strategy without rewriting their semantics

The rule is:

- extract existing behavior first
- verify it is unchanged
- then add the new `RawDistinctOtherStrategy`

Do not "clean up" or rewrite existing SQL generation while introducing the new strategy. The new work should be additive.

```typescript
type GroupLimitStrategyId =
    | 'none'
    | 'fast_other'
    | 'raw_distinct_other'
    | 'drop';

type GroupLimitFlags = {
    groupLimitEnabled: boolean;
    rawDistinctOtherEnabled: boolean;
};

type GroupLimitPlannerContext = {
    pivotConfiguration: PivotConfiguration;
    pivotSource?: CompiledQuery['pivotSource'];
    groupLimitFlags: GroupLimitFlags;
};

interface GroupLimitStrategy {
    id: GroupLimitStrategyId;
    supports(ctx: GroupLimitPlannerContext): boolean;
    build(args: BuildArgs): GroupLimitBuildResult;
}
```

Concrete strategies:

- `NoGroupLimitStrategy`
- `FastOtherStrategy`
  - the existing additive aggregate-over-aggregate path
- `RawDistinctOtherStrategy`
  - the new raw `pivot_source` path
  - phase 1 supports distinct-only value sets
- `DropUnsupportedStrategy`
  - explicit fail-closed fallback

And a factory/planner:

```typescript
class GroupLimitStrategyFactory {
    static select(ctx: GroupLimitPlannerContext): GroupLimitStrategySelection;
}
```

Where `GroupLimitStrategySelection` includes:

- the chosen strategy
- a reason string, for example:
  - `group_limit_disabled`
  - `missing_pivot_source`
  - `mixed_metrics_phase_1`
  - `unsupported_metric_type`
  - `raw_distinct_flag_disabled`

This keeps:

- feature-flag checks
- support detection
- fallback behavior

out of the low-level SQL assembly methods.

### Feature-flag relationship

Tie the backend rollout to the existing frontend group-limit flag.

- Shared parent flag:
  - `FeatureFlags.GroupLimitEnabled`
- New backend rollout flag:
  - `FeatureFlags.GroupLimitRawDistinctOther`
  - exact name can vary, but it should clearly scope the new raw distinct `"Other"` strategy

Selection rule:

- if `groupLimit.enabled` is false in the query config:
  - use `none`
- if `groupLimit.enabled` is true but `GroupLimitRawDistinctOther` is off:
  - never choose `raw_distinct_other`
- if `groupLimit.enabled` is true and `GroupLimitRawDistinctOther` is on:
  - `raw_distinct_other` is eligible only when `GroupLimitEnabled` is also on and the metric capabilities are complete

Important nuance:

- `GroupLimitEnabled` is the product-level parent gate already used by the frontend
- the backend must resolve that same flag server-side rather than trusting the client
- the new rollout flag is a child gate for the new strategy, not a replacement for the existing feature

Compatibility rule:

- when `GroupLimitRawDistinctOther` is off, backend behavior must remain equivalent to today's behavior
- the existing `fast_other` and `drop` paths should not change semantics as part of this project

Recommended frontend consistency cleanup:

- migrate group-limit UI checks from `useClientFeatureFlag(FeatureFlags.GroupLimitEnabled)` to `useServerFeatureFlag(FeatureFlags.GroupLimitEnabled)` where practical
- that keeps frontend visibility and backend strategy selection on the same server-resolved flag path

---

## Implementation Plan

### Step 0: Introduce strategy selection and feature-flag plumbing

**Files:**

- `packages/common/src/types/featureFlags.ts`
- `packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts`
- `packages/backend/src/services/ProjectService/ProjectService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
- `packages/backend/src/services/AsyncQueryService/PreAggregationDuckDbClient.ts`
- `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`

Add the new rollout flag:

```typescript
FeatureFlags.GroupLimitRawDistinctOther = 'group-limit-raw-distinct-other';
```

Resolve feature flags once in the service layer, not inside query-builder utilities.

Recommended resolution flow:

- `ProjectService` / `AsyncQueryService` resolve:
  - `FeatureFlags.GroupLimitEnabled`
  - `FeatureFlags.GroupLimitRawDistinctOther`
- `PreAggregationDuckDbClient` receives the resolved booleans as an argument
- `PivotQueryBuilder` receives a planner context or constructor arg carrying those flags

This keeps feature-flag evaluation:

- deterministic for a request
- easy to test
- independent from PostHog/network concerns inside SQL planning code

Implementation constraint:

- do not change the semantics of the current backend path in this step
- only introduce the planner, flags, and extraction points needed to preserve current behavior under the existing path

**Risk:** Low

---

### Step 1: Extend pivot value metadata

**File:** `packages/common/src/types/sqlRunner.ts`

Add re-aggregation metadata to `ValuesColumn` so the pivot layer knows how a metric can be recomputed when `"Other"` needs raw-row bucketing.

```typescript
export type ValueReAggregation =
    | {
          kind: 'standard';
          metricType: MetricType;
      }
    | {
          kind: 'count_distinct';
          metricType: MetricType.COUNT_DISTINCT;
      }
    | {
          kind: 'sum_distinct' | 'average_distinct';
          metricType: MetricType.SUM_DISTINCT | MetricType.AVERAGE_DISTINCT;
      };

export type ValuesColumn = {
    reference: string;
    aggregation: VizAggregationOptions;
    otherAggregation?: VizAggregationOptions | null;
    reAggregation?: ValueReAggregation;
};
```

Notes:

- `otherAggregation` stays for the existing fast path
- `reAggregation` is the new signal for raw `"Other"` support
- unsupported metrics still use `otherAggregation: null` and no `reAggregation`
- actual raw SQL and alias plumbing will live in `CompiledQuery.pivotSource.metricInputs`, not in `ValuesColumn`

**Risk:** Low

---

### Step 2: Derive re-aggregation metadata from compiled fields

**File:** `packages/common/src/pivot/derivePivotConfigFromChart.ts`

Attach `reAggregation` metadata when `groupLimit.enabled` is true.

Rules:

- `COUNT_DISTINCT`
  - supported
  - `reAggregation.kind = 'count_distinct'`
- `SUM_DISTINCT`
  - supported
  - `reAggregation.kind = 'sum_distinct'`
- `AVERAGE_DISTINCT`
  - supported
  - `reAggregation.kind = 'average_distinct'`
  - reuses the existing distinct dedup approach already proven in `MetricQueryBuilder`
- additive metrics used in mixed charts
  - supported only when the compiler can emit an explicit raw-input contract for them in `pivotSource.metricInputs`
  - do not infer this from `compiledValueSql` alone
- table calculations and unsupported metric types
  - keep current unsupported behavior

Also update grouping-mode support detection:

```typescript
const hasUnsupported = valuesColumns.some((col) => {
    if (col.reAggregation) return false;
    return col.otherAggregation === null;
});
```

This lets distinct metrics be treated as supported even when they do not use the old `SUM/MIN/MAX` fallback model.

**Important change:** `COUNT_DISTINCT`, `SUM_DISTINCT`, and `AVERAGE_DISTINCT` must no longer rely on `otherAggregation = SUM` as the correctness path.

**Important change:** `derivePivotConfigFromChart` should only decide *which re-aggregation strategy is needed*. It should not attempt to extract or trust raw SQL directly from compiled field metadata.

This frontend/common signal is necessary but not sufficient for the final `"Other"` vs `drop` decision.

The backend is the first place that knows whether every metric needed by the raw path actually has a `pivotSource.metricInputs[...]` contract. That means `PivotQueryBuilder.getGroupingMode()` (or its caller) cannot rely on `valuesColumns` alone once raw re-aggregation is introduced. It also needs to consider whether `pivotSource` covers every metric that would participate in the raw bucketed path.

**Risk:** Medium

---

### Step 3: Expose a fully-formed raw `pivot_source` from MetricQueryBuilder

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
    pivotSource?: {
        query: string;
        metricInputs: Record<
            string,
            | {
                  strategy: 'standard';
                  inputAlias: string;
                  aggregateAs:
                      | VizAggregationOptions.SUM
                      | VizAggregationOptions.MIN
                      | VizAggregationOptions.MAX
                      | 'COUNT_ALL'
                      | 'COUNT_NON_NULL';
              }
            | {
                  strategy: 'count_distinct';
                  inputAlias: string;
              }
            | {
                  strategy: 'sum_distinct' | 'average_distinct';
                  inputAlias: string;
                  distinctKeyAliases: string[];
              }
        >;
    };
};
```

`pivotSource.query` should be a complete SQL statement, not decomposed fragments.

It should be built with the same compiler context already used by `MetricQueryBuilder`:

- base table
- joins
- dimension helper joins
- dimension helper CTEs
- dimension filters
- parameter replacement

`pivot_source` should select:

- every dimension alias needed by pivoting
- every `_order` alias needed by sorted custom bins
- one explicit raw input alias per selected metric that can participate in raw re-aggregation
- distinct key aliases for `SUM_DISTINCT` / `AVERAGE_DISTINCT`

The important change is this:

- `pivotSource.metricInputs` becomes the supported compiler contract for raw `"Other"` re-aggregation
- it is allowed to reuse `compiledValueSql` internally where correct
- it must not expose unsupported metric shapes as if they were raw-row safe

Example shape:

```sql
SELECT
  <dimension expr> AS "orders_region",
  <index expr> AS "orders_created_month",
  <order expr> AS "orders_created_month_order",
  <raw value expr> AS "__metric_users_value",
  <raw value expr> AS "__metric_revenue_value",
  <distinct key expr> AS "__metric_avg_distinct_key_0"
FROM ...
JOIN ...
WHERE ...
```

This should be parameter-replaced inside `compileQuery()`, the same way `query` already is.

Additive mixed-metric support is limited to whatever strategies `MetricQueryBuilder` can explicitly emit here. Do not assume every metric with `compiledValueSql` can go through the raw path.

**Risk:** High

---

### Step 4: Thread `pivotSource` to PivotQueryBuilder

**Files:**

- `packages/backend/src/services/ProjectService/ProjectService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
- `packages/backend/src/services/AsyncQueryService/PreAggregationDuckDbClient.ts`
- `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`

Pass `compiledResult.pivotSource` into `PivotQueryBuilder` as a new optional constructor arg from every compiled-metric-query call site, not just the async warehouse path.

That includes:

- `ProjectService.compileQuery()` so `compileQuery` keeps returning an accurate `pivotQuery` for debugging and tests
- `AsyncQueryService` so normal async metric queries use the new path
- `PreAggregationDuckDbClient.resolve()` so pre-aggregated execution stays behaviorally aligned with warehouse execution

`ProjectService.pivotQueryWorkerTask()` is different because it starts from arbitrary SQL Runner SQL rather than a compiled metric query. That path cannot produce `pivotSource`, so it must safely fall back to `drop` when `valuesColumns` request a raw re-aggregation strategy.

At the same time, thread the resolved `GroupLimitFlags` into the strategy planner so the final grouping decision is based on:

- query config (`groupLimit.enabled`)
- shared/product flag state
- rollout flag state
- metric capabilities
- presence/completeness of `pivotSource`

If `"Other"` needs raw distinct re-aggregation and `pivotSource` is missing:

- do not silently fall back to wrong `SUM(...)`
- treat the grouping mode as unsupported and use `drop`

This is the correct fallback for SQL Runner and any future path that lacks `pivotSource`.

**Risk:** Low

---

### Step 5: Build a raw `"Other"` path in PivotQueryBuilder

**File:** `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`

Do this behind the new strategy layer, not by growing the existing inline `if/else` logic.

When `groupingMode === 'other'` and any `valuesColumn.reAggregation` is distinct-style:

- keep existing `original_query`
- keep existing `pre_group_by`
- keep existing `__group_totals`
- keep existing `__group_ranking`
- add the new raw-source CTEs below

#### 5a. Add `__pre_group_scope`

```sql
__pre_group_scope AS (
  SELECT DISTINCT <groupBy aliases>, <index aliases>
  FROM pre_group_by
)
```

Why:

- preserves the grouped rows that survived metric filters and table-calc filtering upstream
- prevents raw rows from excluded groups/indexes from reappearing inside `"Other"`

#### 5b. Add `pivot_source`

```sql
pivot_source AS (<compiledQuery.pivotSource.query>)
```

#### 5c. Add `scoped_source`

```sql
scoped_source AS (
  SELECT ps.*
  FROM pivot_source ps
  INNER JOIN __pre_group_scope s
    ON <null-safe equality across groupBy + index aliases>
)
```

Use null-safe equality, matching existing Lightdash join behavior for dimension equality.

#### 5d. Add `bucketed_source`

```sql
bucketed_source AS (
  SELECT
    CASE WHEN gr.__group_rn <= N THEN CAST(ss."group_col" AS TEXT) ELSE 'Other' END AS "group_col",
    ss."index_col",
    ss."sorted_bin_order_col",
    ss."__metric_users_value",
    ss."__metric_avg_distinct_key_0",
    ...
  FROM scoped_source ss
  LEFT JOIN __group_ranking gr
    ON <groupBy alias equality>
)
```

This is where bucket assignment moves from the aggregated query into the raw-row path.

#### 5e. Add `bucketed_keys`

Distinct-only charts still need a single driving relation for downstream joins and order columns.

```sql
bucketed_keys AS (
  SELECT
    <bucketed groupBy aliases>,
    <index aliases>,
    MIN(<order cols>) AS <order alias>
  FROM bucketed_source
  GROUP BY <bucketed groupBy aliases>, <index aliases>
)
```

This CTE is the anchor for `group_by_query` assembly.

#### 5f. Aggregate non-distinct metrics from `bucketed_source`

Phase 2 only.

In the de-risked phase-1 rollout, skip this path entirely and keep mixed charts on `drop`. Additive mixed-metric support should only be enabled after the distinct-only raw path has landed with strong result-level verification.

Create one aggregate CTE for standard metrics:

```sql
bucketed_standard_metrics AS (
  SELECT
    <bucketed groupBy aliases>,
    <index aliases>,
    MIN(<order cols>) AS <order alias>,
    SUM("__metric_revenue_value") AS "revenue_ANY",
    COUNT("__metric_orders_value") AS "orders_ANY",
    MIN("__metric_min_value") AS "min_metric_ANY",
    MAX("__metric_max_value") AS "max_metric_ANY"
  FROM bucketed_source
  GROUP BY <bucketed groupBy aliases>, <index aliases>
)
```

This is the mixed-metric path. If a chart has both `COUNT_DISTINCT` and `SUM`, both metrics are computed from the same bucketed raw rows.

Only metrics with an explicit `pivotSource.metricInputs[metricId].strategy === 'standard'` contract participate here.

#### 5g. Aggregate `COUNT_DISTINCT`

Per metric:

```sql
dd_count_distinct_<metric> AS (
  SELECT
    <bucketed groupBy aliases>,
    <index aliases>,
    COUNT(DISTINCT "__metric_<id>_value") AS "<metric_field_name>"
  FROM bucketed_source
  GROUP BY <bucketed groupBy aliases>, <index aliases>
)
```

#### 5h. Aggregate `SUM_DISTINCT` and `AVERAGE_DISTINCT`

Per metric, use a dedup subquery modeled on the existing distinct-metric CTE builder in `MetricQueryBuilder`.

Inner step:

```sql
SELECT
  <bucketed groupBy aliases>,
  <index aliases>,
  "__metric_<id>_value" AS __dd_val,
  ROW_NUMBER() OVER (
    PARTITION BY
      <bucketed groupBy aliases>,
      <index aliases>,
      <distinct key aliases>
    ORDER BY "__metric_<id>_value"
  ) AS __dd_rn
FROM bucketed_source
```

Outer step:

- `SUM_DISTINCT`
  - `SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END)`
- `AVERAGE_DISTINCT`
  - `SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) / COUNT(CASE WHEN __dd_rn = 1 THEN __dd_val END)`
  - keep the existing warehouse-specific float casting behavior

#### 5i. Assemble `group_by_query`

Build the final `group_by_query` by joining:

- `bucketed_keys`
- `bucketed_standard_metrics` when present
- one CTE per `COUNT_DISTINCT`
- one CTE per `SUM_DISTINCT`
- one CTE per `AVERAGE_DISTINCT`

Join on null-safe equality across:

- bucketed groupBy aliases
- index aliases

This keeps the rest of the pivot pipeline unchanged.

**Risk:** High

---

### Step 6: Fallback and support rules

Support matrix for `"Other"`:

Phase 1 support:

- `COUNT_DISTINCT`
  - supported via raw `bucketed_source`
- `SUM_DISTINCT`
  - supported via raw `bucketed_source` + dedup CTE
- `AVERAGE_DISTINCT`
  - supported via raw `bucketed_source` + dedup CTE
- charts where all value columns are one of the above and all required raw inputs are present
  - supported
- mixed distinct + additive charts
  - force `drop` in phase 1
- unsupported metrics
  - `MEDIAN`, `PERCENTILE`, post-aggregation table calcs, etc.
  - continue to force `drop`
- missing or incomplete `pivotSource`
  - force `drop`
  - never fall back to incorrect `SUM(...)`
- `GroupLimitRawDistinctOther` disabled
  - never choose `raw_distinct_other`
- `GroupLimitEnabled` disabled server-side
  - `raw_distinct_other` is not eligible, even if the request contains `groupLimit`

Phase 2 expansion:

- additive metrics in mixed charts
  - support only when `MetricQueryBuilder` emits a `pivotSource.metricInputs[metricId].strategy === 'standard'`

**Risk:** Low

---

### Step 7: Tests

**File:** `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts`

Add test cases for SQL generation:

1. `COUNT_DISTINCT` with `"Other"` uses raw distinct aggregation
2. `SUM_DISTINCT` with `"Other"` uses a dedup CTE, not `SUM(sum_distinct_metric)`
3. `AVERAGE_DISTINCT` with `"Other"` uses a dedup CTE and average formula, not average-of-averages
4. mixed `SUM + COUNT_DISTINCT` uses the raw bucketed path for both metrics
5. mixed `SUM + SUM_DISTINCT`
6. mixed `SUM + AVERAGE_DISTINCT`
7. metric filters are preserved by `__pre_group_scope`
8. custom/bin dimensions use aliased fields from `pivot_source`, not raw-table aliases
9. sorted bin `_order` fields are preserved through the raw path
10. distinct-only charts assemble `group_by_query` via `bucketed_keys`
11. missing `pivotSource` forces `drop`
12. all-additive metrics still use the existing fast path

If there are existing `MetricQueryBuilder` tests for distinct-metric CTE generation, add focused tests there too for the new `pivotSource` metadata and alias generation.

Also add/update tests for:

- baseline-preservation tests
  - existing `fast_other` SQL path remains unchanged when `GroupLimitRawDistinctOther` is off
  - existing `drop` behavior remains unchanged when `GroupLimitRawDistinctOther` is off
  - no-group-limit path remains unchanged
- strategy-selection tests
  - `none`
  - `fast_other`
  - `raw_distinct_other`
  - `drop`
  - reason strings for each fallback path
- feature-flag gating tests
  - `GroupLimitRawDistinctOther` off keeps current behavior
  - `GroupLimitRawDistinctOther` on + `GroupLimitEnabled` off does not enable raw strategy
  - `GroupLimitRawDistinctOther` on + `GroupLimitEnabled` on enables raw strategy only for supported charts
- `packages/common/src/pivot/derivePivotConfigFromChart.test.ts`
  - `COUNT_DISTINCT`, `SUM_DISTINCT`, and `AVERAGE_DISTINCT` get `reAggregation` metadata when `groupLimit.enabled`
  - unsupported metrics still force `drop`
- service-level wiring where the `PivotQueryBuilder` constructor signature changes
  - `ProjectService.compileQuery`
  - `AsyncQueryService`
  - `PreAggregationDuckDbClient`
- result-level differential tests on seeded data
  - compare pivoted `"Other"` results against a direct raw-row correctness query for `COUNT_DISTINCT`, `SUM_DISTINCT`, and `AVERAGE_DISTINCT`
  - assert phase-1 mixed charts still choose `drop`

---

## Files Changed Summary

| File | Change | Risk |
|------|--------|------|
| `packages/common/src/types/featureFlags.ts` | Add backend rollout flag for raw distinct `"Other"` strategy | Low |
| `packages/common/src/types/sqlRunner.ts` | Add `reAggregation` metadata to `ValuesColumn` | Low |
| `packages/common/src/pivot/derivePivotConfigFromChart.ts` | Attach raw re-aggregation metadata; update support detection | Medium |
| `packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts` | Resolve the new rollout flag under the existing `GroupLimitEnabled` parent gate | Medium |
| `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` | Expose fully-formed `pivotSource` query and metric input aliases | High |
| `packages/backend/src/services/ProjectService/ProjectService.ts` | Thread `pivotSource` into `PivotQueryBuilder` for `compileQuery` and keep SQL Runner on safe fallback behavior | Medium |
| `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts` | Pass `pivotSource` to `PivotQueryBuilder` | Low |
| `packages/backend/src/services/AsyncQueryService/PreAggregationDuckDbClient.ts` | Pass `pivotSource` to `PivotQueryBuilder` for DuckDB pre-aggregation execution | Medium |
| `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts` | Add raw `"Other"` path with scope, bucketing, standard metric aggregate CTE, and distinct metric CTEs | **High** |
| `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.test.ts` | Add coverage for distinct `"Other"` SQL generation | Medium |
| `packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts` and group-limit UI call sites | Optional consistency cleanup so frontend and backend read `GroupLimitEnabled` through the same server-resolved path | Low |

If `ValuesColumn` changes shape, regenerate the TSOA route schemas with `pnpm generate-api`. `PivotConfiguration` is request-validated through the generated route metadata, so shared type changes here are not purely internal.

## Edge Cases & Limitations

1. SQL Runner path
   If no `pivotSource` is available, distinct-style metrics with `"Other"` must use `drop`, not a wrong fallback.

2. Table calculations
   Pivot functions and post-aggregation calculations still operate after `group_by_query`. They should keep current unsupported/drop behavior when they cannot be meaningfully recomputed from raw rows.

3. Metric filters
   Raw re-aggregation must be scoped through `__pre_group_scope`, otherwise filtered-out grouped rows can leak back into `"Other"`. Investigation confirmed metric filters are applied late enough that this scoping is mandatory.

4. Custom/bin dimensions
   These must come from `pivot_source` aliases, not from raw SQL fragments reconstructed in `PivotQueryBuilder`.

5. Fanout protection
   `pivot_source` must be built from the same compiler context as the main query so that raw metric inputs remain valid under join inflation rules.

6. Warehouse-specific casting
   `AVERAGE_DISTINCT` should reuse the existing float-casting logic already used by `MetricQueryBuilder`.

7. Raw input contract
   The implementation should introduce an explicit compiler-owned raw-input contract for supported metrics rather than treating `compiledValueSql` as universally safe.

8. Future work
   If this pattern works well, other non-additive metrics could use the same scoped raw-bucketing architecture, but they are out of scope for this fix.
