# PROD-7975 — Warehouse-computed pivot subtotals (all metric types)

**Linear:** https://linear.app/lightdash/issue/PROD-7975
**Parent:** PROD-646 — totals in pivot tables for all metric types
**Date:** 2026-06-02

## Problem

Pivot-table subtotals are computed today through the legacy V1
`POST /api/v1/projects/{uuid}/calculate-subtotals` endpoint
(`useCalculateSubtotals` → `SubtotalsCalculator`). That endpoint already runs
grouped warehouse queries, so the values are correct — but it sits on the old
"re-compile the explore from a raw `MetricQuery`" path rather than the V2
query-history `calculate-total` pattern that column totals and row totals
(#23780) were just migrated to.

We want all pivot aggregates to ride one consistent mechanism: re-run the
**source query from history** (by `queryUuid`), transformed on the warehouse, no
in-memory summation. This ticket migrates subtotals onto that V2 path.

## What "subtotals" means here (scope)

The only subtotals that render today come from the row-grouping path:

```
canUseSubtotals = !metricsAsRows && numUnpivotedDimensions > 1
```

i.e. metrics-as-columns, 2+ dimensions left as rows, group the rows by an outer
dimension, and show a **summary row per group** that aggregates the inner rows
while keeping each pivot column separate. Two consumers render this, both using
the identical `groupedSubtotals` map:

1. **Pivot table** — `useTableConfig` → pivot worker → `PivotTable` /
   `getDataAndColumns` (subtotal row at each TanStack row-grouping depth).
2. **Treemap** — `useTreemapChartConfig` (fills parent node values per nesting
   level; no pivot dimensions).

### Kind naming

Matching the existing totals convention (`columnTotal` = the bottom total **row**
= "total of each column"; `rowTotal` = the right total **column**), a subtotal
**row** that aggregates a *subset* of the data rows is a partial `columnTotal` =
**`columnSubtotal`**.

- **`columnSubtotal`** — this IS today's subtotals, re-homed on V2. **In scope.**
- **`rowSubtotal`** — subtotal *columns* (partial `rowTotal`). Nothing renders
  it today. **Out of scope**, stays commented in `CalculateTotalKind`.

## Data shape (unchanged — the migration's key constraint)

The frontend `groupedSubtotals` map and its two consumers stay byte-for-byte
compatible; we only swap the data source.

```ts
groupedSubtotals: Record<string /* getSubtotalKey(dims) = dims.join(':') */,
                         Record<string /* fieldId */, number /* or dim raw */>[]>
```

Each record carries the grouping-dimension raw values, the pivot-dimension raw
values, and the metric values for one `(subtotal-group × pivot-value)`
combination. Consumers match a rendered cell to a record by comparing both the
grouping values and the pivot header values, then read the metric by `fieldId`.

## Backend

1. **`paginatedQuery.ts`** — uncomment `'columnSubtotal'` in `CalculateTotalKind`
   (leave `rowSubtotal` / `grandTotal` commented). Extend
   `ExecuteAsyncCalculateTotalRequestParams` with `subtotalDimensions: string[]`
   — the prefix of unpivoted/index dimensions this subtotal level groups by.

2. **`getTotalsQueryFromSource.ts`** — new `getColumnSubtotalQueryFromSource`:
   from the source `MetricQuery` + `PivotConfiguration`, produce a **flat**
   (`groupByColumns: []`, i.e. non-pivoted) query with
   `dimensions = subtotalDimensions ∪ pivotDimensions(groupByColumns refs)`,
   dropping PoP metrics / sorts / table calculations, reusing
   `assertNoBlockingFilters`. One flat row per `(subtotal-group × pivot-value)`,
   correct for every metric type. The treemap's no-pivot case
   (`groupByColumns` empty) falls out naturally — it just groups by
   `subtotalDimensions`. Validate that every requested dimension was present in
   the source query (mirror the `missing` guard in the existing transforms).

3. **`AsyncQueryService.executeAsyncCalculateTotalFromQueryHistory`** — add the
   `columnSubtotal` case to the switch, threading `subtotalDimensions` from the
   request into the transform.

4. **`QueryController.executeAsyncCalculateTotal`** — accept `subtotalDimensions`
   on the body type. Run `pnpm generate-api`.

5. **Deprecate (do not delete) V1** — add `@deprecated` JSDoc to the V1
   `/calculate-subtotals` route (`projectController`), the embed
   `/calculate-subtotals` routes (`embedController`),
   `AsyncQueryService.calculateSubtotalsFromQuery` /
   `calculateMetricQuerySubtotals`, `EmbedService` subtotals method, and
   `SubtotalsCalculator`. They remain functional for external API callers.

## Frontend

6. **New hook `useAsyncCalculateSubtotals`** (mirrors `useAsyncCalculateRowTotal`
   in `useAsyncCalculateTotal.ts`): given the source `queryUuid` and the list of
   nesting-prefix dimension groups (derived the same way
   `SubtotalsCalculator.prepareDimensionGroups` does — order by `columnOrder`,
   drop pivot dims, drop the last/most-detailed dim, build prefixes), fire **one
   V2 async `calculate-total` call per level in parallel** with
   `kind: 'columnSubtotal'` and that level's `subtotalDimensions`. Stream each
   result from S3, flatten rows to `Record<fieldId, raw|number>`, and assemble
   the `groupedSubtotals` map keyed by `getSubtotalKey(level)`.

7. **Swap consumers** — replace `useCalculateSubtotals` with
   `useAsyncCalculateSubtotals` in `useTableConfig` and `useTreemapChartConfig`.
   Because the output shape is identical, the worker, `PivotTable`,
   `getDataAndColumns`, and treemap aggregation are untouched.

8. **Delete** the now-unused `useCalculateSubtotals.ts` hook and the frontend
   `CalculateSubtotalsFromQuery` / `ApiCalculateSubtotalsResponse` usages
   (types stay in common for the deprecated endpoint).

## Known risks / things to verify during implementation

- **Date raw-value matching.** Cell↔record matching uses `===` on raw values.
  The row-totals migration found V2 `calculate-total` serializes datetimes with
  milliseconds (`…00.000Z`) where the main pivot query uses `…00Z`. Subtotal
  matching on date grouping/pivot dimensions may need the same normalization the
  row-total path added (`buildPivotRowTotalKey` / `normalizeRowTotalRaw`). Verify
  with a date pivot/grouping dimension.
- **Metric column names.** Flat (`groupByColumns: []`) output uses plain metric
  `fieldId`s (like row totals), not the `_any`-suffixed pivoted names. Confirm
  `getSubtotalValueFromGroup` lookups by `col.baseId ?? col.fieldId` still hit.
- **Embed.** Embed executes via V2 and exposes `resultsData.queryUuid`, so it
  rides the new path with no extra work; confirm in an embedded pivot.
- **Latency.** N parallel async queries (execute → poll → stream) replace one V1
  call. N = `numUnpivotedDimensions − 1` (typically 1–2), so acceptable.

## Testing

- **Backend unit** — extend `getTotalsQueryFromSource.test.ts` with
  `columnSubtotal`: pivoted source (group prefix + pivot dims, flat output),
  non-pivoted source (treemap-style), missing-dimension rejection, PoP/sort/
  table-calc stripping, blocking-filter rejection.
- **Frontend/common** — verify `groupedSubtotals` assembled by the new hook
  matches the shape `convertSqlPivotedRowsToPivotData` and the treemap expect
  (existing `pivotQueryResults` tests should still pass unchanged).
- **Manual** — pivot table with count_distinct / average / ratio metrics and 2–3
  row dimensions: subtotal rows show correct (non-summed) aggregates at each
  grouping level; treemap parent nodes match; embedded pivot works.
```
