# Investigation — PROD-8117: Duplicate `_distinct` metric in pivot/fanout SQL

> Internal working note. Not for commit (contains customer + Pylon references).

## TL;DR

When a `type: number` metric references a `sum_distinct` / `average_distinct` metric on a
**fanned-out** explore, the metric query builder emits that derived metric **twice under the
same SQL alias** — once correctly (from the outer `dd` SELECT, using the `dd_*` dedup CTE) and
once as a raw fallback aggregate inside the per-table fanout-protection CTE
(`cte_metrics_<table>`). Same alias twice = broken output.

- **Snowflake**: hard SQL error (duplicate output column).
- **BigQuery**: silently renames one column to `*_1` → viz layer gets unexpected columns / wrong values.
- **Postgres**: tolerates duplicate output aliases, so the SQL "runs" but the visualization breaks.

Fix = skip these derived (`nonAggReferencingDd`) metrics when building the fanout metrics CTE,
so they are only projected once, from the outer SELECT.

---

## Identifiers / cross-references

| System | Ref |
|---|---|
| Linear | **PROD-8117** — "[Pivot Table] Duplicate SQL field generated for _distinct measures when pivot is enabled" |
| GitHub issue | **#23861** (mirror of PROD-8117), filed by Tori Whaley, 2026-06-03. Labels: 🐛 bug, ⚙️ backend, 📓 table visualization |
| GitHub PR | **#24017** — "fix(pivot): duplicate distinct metric projection in pivot queries" (OPEN). `Closes #23861` |
| Slack (origin) | Customer thread led by Oliver Ramsay, 2026-06-02 (channel `C0ATLBUDDV0`) |
| Slack (DM) | DM with Tori Whaley re: the PR (Jun 8–9) |

### People
- **Kostas Spyrlidis** (+ Andreas Potel-Stüber) — customer who reported & self-diagnosed it (building a Looker-style P&L). Found the extra measure on line 36 of their generated SQL.
- **Oliver Ramsay** — Lightdash SE/CS on the call; turned on the pivot-improvements feature flag, asked for the explore YAML.
- **Tori Whaley** — filed #23861 / PROD-8117; gave the PR an informal 👍 over DM but flagged PoP.
- **Jess Hitchcock** (`@jess`, Analytics Engineering Advocate) — the go-to for fanout/PoP speccing; the person to verify PoP permutations with before merge.
- **Irakli Janiashvili** (me, `IrakliJani`) — author of PR #24017.

---

## The bug

### Symptom
Customer chart: pivot table with a `_distinct` metric (e.g. `count_distinct` / `sum_distinct`)
alongside ≥1 other measure produces SQL containing **two fields with the same alias** for the
distinct-derived measure — one respecting the distinct config, one ignoring it.

### Root cause (where it lives)
`packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` — the **fanout-protection** path
(NOT `PivotQueryBuilder.ts`; the pivot wrapper is downstream and unrelated to this duplication).

Two relevant CTE mechanisms in `MetricQueryBuilder`:
1. **`dd_*` CTEs** — deduplication for distinct metrics (`sum_distinct`/`average_distinct`),
   using `ROW_NUMBER() OVER (PARTITION BY <distinctKeys> ...)` then aggregating where `__dd_rn = 1`.
2. **Fanout-protection CTEs** — `cte_keys_<table>` (SELECT DISTINCT primary keys) +
   `cte_metrics_<table>` (aggregates joined 1:1 on those keys). Built when a **plain,
   fanout-prone aggregate** on the "one" side of a one-to-many join would be inflated.

The derived `type: number` metric (e.g. `total / NULLIF(distinct_metric, 0)`) was being added to
`cte_metrics_<table>`, where its `compiledSql` expands the distinct metric down to its **raw
fallback aggregate** (the `dd_*` alias isn't in scope there). It was *also* emitted correctly in
the outer `dd` SELECT. → duplicate alias.

Key precondition: the duplicate only appears when a `cte_metrics_<table>` CTE actually exists,
i.e. there is at least one genuinely fanout-protected plain aggregate (`SUM`/`AVG` over a
column on the "one" side). `count_distinct` and `MIN`/`MAX` are inflation-proof and do **not**
trigger it; a derived metric alone does **not** trigger it.

### Before / after SQL (from the PR diff comment)
Before (duplicate — note the same alias appears in `cte_metrics_customers` AND the final SELECT):
```diff
 WITH
   cte_metrics_customers AS (
     SELECT
-      (SUM("customers".lifetime_value)) / NULLIF((SUM("customers".lifetime_value)), 0) AS "customers_average_customer_value_deduped",
       SUM("customers".lifetime_value) AS "customers_total_customer_value"
     FROM cte_keys_customers
     LEFT JOIN customers AS "customers" ON cte_keys_customers."pk_customer_id" = "customers".customer_id
   ),
   dd_base AS (
     SELECT
       cte_unaffected.*,
-      cte_metrics_customers."customers_average_customer_value_deduped" AS "customers_average_customer_value_deduped",
       cte_metrics_customers."customers_total_customer_value" AS "customers_total_customer_value"
     FROM cte_unaffected
     CROSS JOIN cte_metrics_customers
   )
 SELECT
   dd_base.*,
   dd_customers_total_customer_value_deduped."customers_total_customer_value_deduped" AS "customers_total_customer_value_deduped",
   dd_base."customers_total_customer_value" / NULLIF(dd_customers_total_customer_value_deduped."customers_total_customer_value_deduped", 0) AS "customers_average_customer_value_deduped"
 FROM dd_base
 CROSS JOIN dd_customers_total_customer_value_deduped
```

---

## The fix (PR #24017)

### Code change — `MetricQueryBuilder.ts` (~line 2234)
Inside the loop that builds the fanout metrics CTE, skip non-aggregate metrics that reference a
distinct metric so they are only emitted from the outer `dd` SELECT:

```ts
// Non-aggregate metrics referencing sum_distinct/average_distinct
// must be emitted from the outer dd SELECT where dd_* aliases
// are available. Emitting compiledSql here expands the distinct
// metric to its raw fallback aggregate and can duplicate the
// outer alias.
if (nonAggReferencingDd.has(getItemId(metric))) {
    return;
}
```

### Files changed
- `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` — the guard above.
- `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.mock.ts` — extended
  `EXPLORE_WITH_FANOUT_AND_DD_REFERENCE` with metrics: `total_customer_value` (SUM),
  `total_customer_value_deduped` (SUM_DISTINCT), `average_customer_value_distinct`
  (AVERAGE_DISTINCT), `average_customer_value_deduped` (NUMBER → references the sum_distinct),
  `customer_value_vs_distinct_average` (NUMBER → references the average_distinct). Added two
  `CompiledMetricQuery` fixtures: `METRIC_QUERY_FANOUT_AND_SAME_TABLE_DD_REFERENCE` and
  `METRIC_QUERY_FANOUT_AND_SAME_TABLE_AVERAGE_DD_REFERENCE`.
- `packages/backend/src/utils/QueryBuilder/metricQueryBuilderSnapshots/fanoutQueries.test.ts`
  — two new tests.
- `packages/backend/src/utils/QueryBuilder/metricQueryBuilderSnapshots/__snapshots__/fanoutQueries.test.ts.snap`
  — new snapshots.

### Test approach (what the snapshot test uses)
- **Vitest** snapshot test (`toMatchSnapshot()`), no DB.
- `buildQuery()` helper (`metricQueryBuilderSnapshots/helpers.ts`) instantiates `MetricQueryBuilder`
  with `SNAPSHOT_DEFAULTS` (mock `warehouseClientMock`, UTC tz, intrinsic user attrs) and returns
  `formatSql(query)`.
- Inputs are the inline mocks from `MetricQueryBuilder.mock.ts`.
- Beyond the snapshot, each test pins the regression explicitly:
  - `expect(query).toContain('cte_metrics_customers')`
  - `expect(query).not.toContain('<raw fallback projection>')`
  - `expect(query.match(/AS "<alias>"/g)).toHaveLength(1)` — alias appears exactly once.

Run / update:
```bash
pnpm -F backend test:dev:nowatch         # runs tests for modified files
# or invoke vitest on fanoutQueries and pass -u to refresh snapshots
```

---

## Reproduction notes (gotchas)

To reproduce you need **all** of:
1. A fanned-out explore (one-to-many join).
2. A derived `type: number` metric referencing a `sum_distinct` / `average_distinct` metric.
3. **A plain fanout-prone aggregate** (`SUM`/`AVG` over a column on the "one" side) so that
   `cte_metrics_<table>` actually gets built. Without this, the derived metric is emitted only
   once and the bug does NOT appear (the SQL is correct).

### Jaffle shop availability
`examples/full-jaffle-shop-demo/dbt/models/customers.yml`:
- `total_order_amount_deduped` — **sum_distinct** (line 63), `distinct_keys: [orders.order_id]`.
- `avg_order_amount_deduped` — **average_distinct** (line 70). **Nothing references it.**
- `average_customer_lifetime_value` — **number** (line 84):
  `${total_order_amount_deduped} / NULLIF(${unique_customer_count}, 0)` → references the sum_distinct. ✅
- `orders.deduped_revenue_per_order` (orders.yml:103) — number → `${customers.total_order_amount_deduped} / NULLIF(...)` (cross-model sum_distinct). ✅

| PR test case | Existing jaffle metric? |
|---|---|
| number → **sum_distinct** | ✅ `average_customer_lifetime_value` |
| number → **average_distinct** | ❌ none (`avg_order_amount_deduped` is unreferenced) |

Catch: jaffle has **no ungated plain `SUM` over a customers column**. The only fanout-prone
customers aggregate is `customers_average_age`, and `age` is gated behind
`required_attributes: is_admin: "true"` (customers.yml:172). So in the live app you must either
run as a user with `is_admin=true`, or add a one-line metric:
```yaml
total_lifetime_value:
  type: sum
  sql: ${customer_lifetime_value}
```

### Metric query that reproduces (sum_distinct, customers explore)
```json
{
  "exploreName": "customers",
  "dimensions": [],
  "metrics": [
    "customers_average_customer_lifetime_value",
    "customers_average_age",
    "orders_total_order_amount"
  ],
  "filters": {},
  "sorts": [{ "fieldId": "customers_average_customer_lifetime_value", "descending": true }],
  "limit": 500,
  "tableCalculations": []
}
```
(Replace `customers_average_age` with `customers_total_lifetime_value` if you add the metric above,
to avoid the `is_admin` gate.)

The "did it reproduce?" tell: a `cte_metrics_customers` CTE appears, and pre-fix
`customers_average_customer_lifetime_value` appears **twice** (once inside `cte_metrics_customers`,
once in the final SELECT).

> Note: an earlier candidate query using `customers_total_order_amount_inflated` +
> `orders_total_order_amount` did NOT reproduce — both are orders-grain `SUM(orders.amount)`, so no
> `cte_metrics_customers` was built and the derived metric was correctly emitted once.

---

## Open items / review concerns
- **PoP permutations** — Tori flagged (DM) that this should be checked against period-over-period.
  To verify with **Jess Hitchcock**. Not yet done.
- There's a separate **"PoP fix" PR** that was "blindcoded" (mentioned to Tori) — unresolved / not pinned down.
- PR #24017 has **no formal GitHub review** yet (Tori's 👍 was DM-only).
- average_distinct case has **no jaffle coverage** outside the unit-test mock.

---

## Git / branch state (as of this investigation)

- **Branch**: `fix(pivot)/distinct-duplicate-metric` (checked out via `gh pr checkout 24017`).
- **Tracked in Graphite** with parent `main` (`gt track --parent main`).
- **Restacked** onto latest main via `gt sync` + `gt restack`.
  - main fast-forwarded to `1597a9a063` (release `0.3190.1`).
  - Restack was clean (no conflicts).
- Local branch vs main: **0 behind / 2 ahead**.
  - `9a49d4f6f0` fix(pivot): distinct duplicate metric
  - `2a90713a95` test(query-builder): cover average distinct fanout
- ⚠️ Local branch has **diverged from `origin/fix(pivot)/distinct-duplicate-metric`**
  (`ahead 462, behind 2`) because the rebase rewrote the two commits onto new main.
  Updating PR #24017 requires a **force-push** (`gt submit` or `git push --force-with-lease`).
  Not yet pushed.

Commands used:
```bash
gh pr checkout 24017
gt sync --no-interactive          # ff main, restacked tracked branches, deleted nothing
gt track --parent main            # PR branch was untracked (gh checkout)
gt restack                        # clean
```

---

## Related but SEPARATE issue — PROD-8338 (Trino stage-count blowup)

Not the same bug; same general area (pivot SQL). Tracked here only to avoid confusion.

- **Pylon #13802** (assignee: me) / **GitHub #24388** / **Linear PROD-8338**.
- Reporter: **Tony Orciuoli (Workday)**, self-hosted **Trino**. GH handle `agha4to`.
- Symptom: after upgrade `0.3004.1 → 0.3123.0`, pivot charts fail with
  *"Number of stages in the query (156) exceeds the allowed maximum (150)"* — specifically when
  **sorting** a pivoted column (sort adds metric-ranking CTEs).
- Root cause: `PivotQueryBuilder.ts` builds a CTE chain; Trino/Athena/Spark inline (don't
  materialize) CTEs, re-expanding the heavy base each reference; `pivot_query` referenced twice.
- Tony attached a Cursor-assisted 5-point refactor proposal for `PivotQueryBuilder.ts`
  (rankings from anchor CTEs not `group_by_query`; drop redundant DISTINCT; linearize final
  assembly so `pivot_query` referenced once; shared `getPivotBaseOutputColumnNames` helper;
  `_order` carry-through fixes). Engine-agnostic, neutral on materializing warehouses.
- Workaround floated internally: raise Trino `query.max-stage-count` (e.g. 300).
- Status: P2/High, no fix PR yet. Giorgi Bagdavadze tagged to look.
