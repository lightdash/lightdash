# PROD-7938 — `rowSpan`-merged dimension cells for `showRowGrouping`

**Status:** Approved (design)
**Date:** 2026-05-29
**Ticket:** PROD-7938 (follow-up to PROD-5901 / PR #23474)
**Author:** Yegor + Claude

## Problem

The `showRowGrouping` feature (shipped in PR #23474, behind the `PivotRowGrouping`
feature flag) visually deduplicates repeated row-index dimension values in pivot
tables without rendering subtotal rows. Today it reuses TanStack's grouping
machinery, which renders each grouped dimension value as a **separate group-header
row** above its data rows, leaving the dimension cell blank on the data rows
themselves.

This looks "a bit off": the group value sits on its own line taking vertical space
with everything else blank, data rows have an empty dimension cell, empty data cells
show `∅`/`-`, and row numbers are absent on group-header rows.

We want the real-spreadsheet-pivot look instead: the dimension value **vertically
merges** (`rowSpan`) across the block of rows it applies to.

### Current look (to replace)

```
┌────┬──────────────────┬───────────────────┬───────────────── express ──────────────────┐
│ #  │ Order date month │ Shipping Cost Tier │ Total order amount │ Total completed order…  │
├────┼──────────────────┼────────────────────┼────────────────────┼─────────────────────────┤
│    │ 2026-02          │                    │                    │                         │  ← group-header row
│ 2  │                  │ Premium ($30+)     │ $130.00            │ $74.00                  │
│ 3  │                  │ High ($20-$30)     │ -                  │ -                       │
│    │ 2026-01          │                    │                    │                         │  ← group-header row
│ 4  │                  │ Premium ($30+)     │ $63.50             │ $63.50                  │
└────┴──────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

### Target look

```
┌────┬──────────────────┬────────────────────┬────────────────────┬─────────────────────────┐
│ #  │ Order date month │ Shipping Cost Tier │ Total order amount │ Total completed order…  │
├────┼──────────────────┼────────────────────┼────────────────────┼─────────────────────────┤
│ 1  │ 2026-02          │ Premium ($30+)     │ $130.00            │ $74.00                  │  ┐ rowSpan=2
│ 2  │ (merged, top)    │ High ($20-$30)     │ (blank, not -)     │ (blank)                 │  ┘ top-aligned
│ 3  │ 2026-01          │ Premium ($30+)     │ $63.50             │ $63.50                  │
└────┴──────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

## Scope

**In scope** — the `metrics-as-columns` grouping-only path:
`showRowGrouping === true && showSubtotals === false`, gated by the existing
`PivotRowGrouping` flag.

**Out of scope (deferred / unchanged):**
- `showSubtotals === true` rendering — keeps current TanStack grouping + aggregate rows.
- `metricsAsRows` — the `showRowGrouping` toggle is currently disabled when
  `metricsAsRows` is on; re-enabling + covering it is a fast-follow, not this PR.
- The `metricsAsRows` `PERIOD_START` header rework mentioned in the original ticket.
- A new feature flag or per-chart config field. We replace the look wholesale under
  the existing `PivotRowGrouping` flag (feature is days old and still flag-gated, so
  the old look is not a relied-upon GA behavior).

## Design

All changes are in `packages/frontend/src/components/common/PivotTable/` plus one new
pure helper + unit test. No `@lightdash/common`, backend, or migration changes.

### 1. Activation

The `showRowGrouping` prop `PivotTable` receives is **already flag-gated** upstream in
`useTableConfig` (`showRowGrouping: isPivotRowGroupingEnabled && showRowGrouping`), so
inside `PivotTable` the merge mode is simply:

```
const isRowSpanMergeMode = showRowGrouping && !showSubtotals;
```

When `false`, every code path below falls back to today's behavior, so flag-off (prop
is `false`) and subtotals-on are untouched.

### 2. Row model — flat, no TanStack grouping (this mode only)

`index.tsx:957` `useEffect` currently sets `groupingActive = showSubtotals ||
showRowGrouping` and calls `table.setGrouping(...)`. Change it so grouping is set only
when it's genuinely needed for aggregate rows:

```
const groupingActive = showSubtotals || (showRowGrouping && !isRowSpanMergeMode);
```

In merge mode, grouping is **not** set, so `table.getRowModel()` returns the flat core
rows (data rows only, no group/aggregate/placeholder rows). This is the ticket's "no
TanStack grouping — keep the row model flat."

### 3. Span computation — nested run-length encoding (pure helper, unit-tested)

New file `getRowSpanMerges.ts` (alongside `getFrozenColumnLayout.ts`), with a pure
function:

```
// columnIds: grouped dim columns, outer→inner order
// rows: ordered flat rows; reader extracts the comparable value for (row, columnId)
getRowSpanMerges(rows, columnIds, getCellRawValue)
  => Map<columnId, Array<{ isBlockStart: boolean; rowSpan: number }>>  // indexed by row position
```

- **Grouped dim columns** = the same set the code groups on today: the index-dim
  columns (`data.indexValueTypes` mapped through `columnOrder`) **minus the last**
  (`.slice(0, -1)`). The leaf dim stays per-row, matching current behavior.
- For column *i*, a **block starts** when the **prefix tuple** `values[0..i]` differs
  from the previous row's; `rowSpan` = run length over which that prefix stays equal.
  Using the prefix (not just column *i*'s own value) yields correct **nested** spans:
  an outer dim spans wider than an inner dim, and an inner value repeating under two
  different outer values does not get wrongly merged.
- Absorbed rows get `{ isBlockStart: false, rowSpan: 0 }`.

This helper is the testable core. Unit tests cover: single grouped dim, two nested
dims, repeated inner value under different outer values, all-distinct, all-same,
single row.

### 4. Cell rendering

In the body cell renderer, for a **grouped dim column** in merge mode:
- `isBlockStart` → render the value with `rowSpan={span}`, **top-aligned**
  (vertical-align top).
- otherwise → return `null` so no `<td>` is emitted; the block-start cell's `rowSpan`
  visually covers the position (standard HTML rowSpan; works with the flat row model).

Leaf dim cells, the metric/data cells, and the row-number cell render per-row as
today. Row numbers are naturally sequential `1, 2, 3…` (no group-header rows to skip).

### 5. Empty data cells → blank

In merge mode, a data cell whose value is empty (`null`/missing raw value) renders
**fully blank** — no `∅`, no `-`, and no bar-display background. Scoped to merge mode
only; all other tables keep `∅`/`-`. (Implementation: intercept in the data-cell
branch of the renderer when the raw value is absent, before `getFormattedValueCell` /
bar-display would emit a placeholder.)

### 6. Virtualization — disabled in this mode

The body currently maps over `virtualRows` with `VirtualizedArea` padding rows
(`index.tsx:1466-1474`). In merge mode, iterate over all `rows` directly and skip the
padding rows, so `rowSpan`s are contiguous and correct (a block's first row is never
unmounted while its absorbed siblings are visible). Perf is acceptable for the
expected table sizes; a row-count cap can be added later only if real tables jank.

## Files touched

- `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.ts` — new pure helper
- `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.test.ts` — new unit tests
- `packages/frontend/src/components/common/PivotTable/index.tsx` — grouping `useEffect`,
  body row iteration (virtualization), cell renderer (rowSpan + top-align + blank empties)

## Testing

- **Unit:** `getRowSpanMerges` (the cases listed in §3).
- **Manual (browser):** a pivot with 2 row-index dims, metrics as columns,
  `showRowGrouping` on, `showSubtotals` off — verify merged top-aligned cells, blank
  empty data cells, sequential row numbers; verify flag-off and subtotals-on are
  unchanged.

## Risks

- Disabling virtualization in merge mode could be slow for very large grouped tables.
  Mitigation: validate during implementation; add a row cap fallback only if needed.
- Switching the grouping-only path off TanStack grouping must not affect column
  ordering, frozen/sticky columns, or conditional formatting. Verify these in the
  browser pass.
