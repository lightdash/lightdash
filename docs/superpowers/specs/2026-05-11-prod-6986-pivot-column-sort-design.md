# PROD-6986 — Sort by pivoted column slice

**Status:** Proposed
**Linear:** [PROD-6986](https://linear.app/lightdash/issue/PROD-6986)
**Branch:** `feature/prod-6986`
**Project:** Improving pivot tables

## Goal

Let users sort the rows of a pivoted table chart by clicking a pivoted column header. The sort key is "this metric's value at this specific pivot-column slice" (e.g. "sort rows by `Total count` at `Category=1`"), not just "this metric" (which today silently anchors to the first pivot slice).

Out of scope for this ticket — split into a follow-up issue:
- Sort by row totals
- Sort by column totals
- Multi-key sort

## Background

Lightdash pivots tables exclusively in SQL via `PivotQueryBuilder` (`packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts`). The frontend in-memory pivot path is dead code. The pivot pipeline tags rows with `row_index` / `column_index` via DENSE_RANK CTEs and the values are spread into `{field}_{agg}_{groupByValue}` columns downstream in `AsyncQueryService.runQueryAndTransformRows`.

`PivotQueryBuilder` already supports a sort by metric value, but the anchor is hard-coded to `col_idx = 1` — i.e. it sorts rows by the metric's value in the **first** pivot slice. That's invisible to users, who want to pick the slice explicitly.

In the Explorer, pivot sort is sourced from `metricQuery.sorts` via `getSortByForPivotConfiguration` in `packages/common/src/pivot/derivePivotConfigFromChart.ts:32-83`. SQL Runner builds `PivotConfiguration` directly and does not use `metricQuery.sorts`. Both surfaces share the downstream `PivotQueryBuilder`. **This ticket extends Explorer only.** The shared backend lift means SQL Runner could opt in later with its own UI work.

## Architecture

### Type changes

Extend `SortField` (the entry shape inside `metricQuery.sorts`) with an optional pivot-slice key:

```ts
// packages/common/src/types/field.ts
export type PivotSliceKey = Array<{
    referenceField: string;
    value: string | number | boolean | null;
}>;

export type SortField = {
    fieldId: string;
    descending: boolean;
    nullsFirst?: boolean;
    pivotValues?: PivotSliceKey; // NEW — only consumed by the pivot path
};
```

`pivotValues` is metadata that only the pivot path consumes. `MetricQueryBuilder` ignores it. The non-pivoted Results table ignores it. No DB migration — `pivotValues` is optional and existing pivoted charts keep their current behavior (anchor = first slice when no `pivotValues`).

Mirror the field on `PivotConfiguration.sortBy` entries (typed in `packages/common/src/types/sqlRunner.ts`) so the slice survives through to the SQL builder.

### Backend — `PivotQueryBuilder.ts`

Today: the `anchor_column` CTE picks the column where `col_idx = 1` to drive row-anchor metric values for sort.

Change: when a `sortBy` entry has `pivotValues`, the `anchor_column` CTE filters by the dim equalities from `pivotValues` instead of `col_idx = 1`. The downstream `row_anchor` / `row_ranking` chain is unchanged.

Concretely the change is localized to the methods that produce the `column_anchor` → `anchor_column` chain. No new CTE — just a different `WHERE` clause when slice info is present. Existing tests for `col_idx = 1` continue to pass; new tests cover slice-anchor cases per warehouse dialect (Postgres, BigQuery, Snowflake, Databricks). Databricks' precomputed-rankings path (`row_ranking` + `column_ranking` as self-contained CTEs) needs the same treatment — verify in `PivotQueryBuilder.test.ts`.

Cache key: `PivotConfiguration` is hashed into the query cache key; `pivotValues` is part of the structure so cache invalidation is automatic.

### Backend — `derivePivotConfigFromChart.ts`

In `getSortByForPivotConfiguration` (lines 32-83), preserve the new optional `pivotValues` field when mapping each `SortField` into the corresponding `PivotConfiguration.sortBy` entry. Single line addition alongside `reference`, `direction`, `nullsFirst`.

### Frontend — Explorer

1. **New component**: `PivotColumnHeaderMenu.tsx` next to `ValueCellMenu.tsx` / `TotalCellMenu.tsx` in `packages/frontend/src/components/common/PivotTable/`. Mantine Menu opened from the pivoted column header. Items: "Sort asc / Sort desc / Clear sort", with check icons indicating active state. Mirrors the structure of `ColumnHeaderSortMenuOptions.tsx`.

2. **Wire-up in `PivotTable/index.tsx`**: render the menu on header cells. The slice key is built from `column.columnDef.meta.headerInfo` (already populated, see `PivotTable/CLAUDE.md:347-369` for the structure — it's the per-column map of pivot-dimension fieldId → value).

3. **Dispatch**: clicking "Sort asc/desc" dispatches `explorerActions.setSortFields([newSort])` where `newSort` is a `SortField` with `pivotValues` populated from `headerInfo`. This **replaces** existing sorts (single-sort model, matching `ColumnHeaderSortMenuOptions.tsx:42`).

4. **Sort indicator**: small directional arrow on the pivoted column header when that header's `headerInfo` matches the active sort's `pivotValues`. Cheap, do it in this PR.

### Frontend — SQL Runner

No changes in this PR. SQL Runner pivot Visualization tab keeps its current behavior. The shared backend capability (`PivotConfiguration.sortBy` with optional `pivotValues`) is available for a future SQL Runner UI extension.

## Data flow

```
User clicks "Sort desc" on pivoted column "Total count / Category=1"
  → PivotColumnHeaderMenu builds SortField {
        fieldId: 'orders_total_count',
        descending: true,
        pivotValues: [{ referenceField: 'orders_category', value: '1' }]
    }
  → dispatch explorerActions.setSortFields([newSort])
  → metricQuery.sorts = [newSort]
  → next query execution
  → derivePivotConfigurationFromChart → getSortByForPivotConfiguration
  → PivotConfiguration.sortBy = [{ reference, direction, nullsFirst, pivotValues }]
  → PivotQueryBuilder.anchor_column CTE filters by dim equalities
  → row_anchor picks metric value at the chosen slice
  → row_ranking sorts rows by that anchor value
  → results stream back, pivoted table re-renders sorted
```

## Compatibility

- `pivotValues` is optional everywhere — existing saved charts deserialize unchanged.
- Pivoted charts with no `pivotValues` continue to anchor on the first slice (`col_idx = 1`). No behavior change for them.
- The Results panel keeps showing "Sorted by N fields" — the `pivotValues` metadata is invisible to it but harmless.
- TSOA: regenerate API spec since `SortField` shape changes.

## Testing

- `PivotQueryBuilder.test.ts` — new cases for slice-anchor SQL across Postgres, BigQuery, Snowflake, Databricks. Verify the `anchor_column` CTE filter and that downstream `row_ranking` is unchanged.
- `derivePivotConfigFromChart.test.ts` — verify `pivotValues` carries through `getSortByForPivotConfiguration`.
- Frontend unit test for `PivotColumnHeaderMenu` (active state, dispatch payload).
- Manual: open a pivoted chart in the Explorer, sort by a non-first slice, verify both the Chart panel order and the underlying SQL.

## Hidden gotchas

- **Coupled sort surface**: clicking a pivot column header writes to `metricQuery.sorts`, which is shared with the Results panel. Results panel will display "Sorted by `metric`" with no slice indicator. This matches today's coupling — not a regression — but worth flagging in the PR description.
- **Conditional formatting** depends on `headerInfo` per column (`PivotTable/index.tsx:465-489`). Since slice-sort is backend-driven and column ordering is unchanged, this is unaffected.
- **Subtotals** (`groupedSubtotals`) are a parallel API. Slice-sort doesn't change how they're requested or matched.
- **Row limit + sort interaction**: row count is enforced by `row_index <= limit`. Changing the anchor changes which rows survive — correct behavior, but visually different from non-slice sort.
- **Cache invalidation**: covered automatically since `pivotValues` lives inside `PivotConfiguration` which is hashed.

## Open follow-up

- New issue: "Sort by row total in pivot tables" — needs a separate code path (top-level `ORDER BY total_columns.row_total`) and a sentinel in `pivotValues` (or a dedicated boolean) to indicate "this is a row-total sort." Click-handler / menu plumbing built in this PR is reusable.
