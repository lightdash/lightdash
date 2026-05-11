# PROD-639 — Freeze columns in pivot tables

**Status:** Proposed
**Linear:** [PROD-639](https://linear.app/lightdash/issue/PROD-639)
**Branch:** `feature/prod-639`
**Project:** Improving pivot tables

## Goal

Allow users to freeze leftmost columns in a pivoted table chart so they stay visible while horizontally scrolling, mirroring the existing behavior of non-pivoted table charts.

Per ticket acceptance criteria:
- Row dimensions can always be frozen.
- Metric columns can be frozen when `metricsAsRows = false`.
- When `metricsAsRows = true`, no metric-column freeze option (there are no metric columns to freeze).

## Background

Non-pivoted table charts already support per-column freezing via `ColumnProperties.frozen` (`packages/common/src/types/savedCharts.ts:391-403`). Storage is a per-fieldId boolean inside `TableChart.columns`. Rendering uses CSS sticky positioning (`position: sticky; left: cumulativeLeft`) computed in `Table/TableProvider.tsx:85-113`.

The pivoted table is a separate component (`packages/frontend/src/components/common/PivotTable/index.tsx`, ~1300 lines) that currently does not read `frozen` or apply sticky positioning. It uses TanStack Table with a multi-row header derived from `PivotData.titleFields` and `PivotData.headerValues` (see `PivotTable/CLAUDE.md` for the data structure).

## Architecture

### Type changes

**None.** Reuses the existing `ColumnProperties.frozen?: boolean` field on `TableChart.columns`. No schema migration, no API change.

### Frontend — `PivotTable/index.tsx`

1. **Compute frozen columns**. In the `useMemo` that builds columns (around line 220), inspect `columnProperties[itemId]?.frozen` for each pivot column. Build two arrays:
    - `frozenColumns` (kept in original order)
    - `otherColumns`
2. **Compute cumulative left offsets** for frozen columns, mirroring `Table/TableProvider.tsx:85-113`. Each frozen column's style is `{ position: sticky, left: cumulativeLeft, zIndex: <higher than scrolling cells> }`.
3. **Apply sticky styles to all cell rows** for the frozen columns:
    - Body cells (`dataValues` rows)
    - Multi-row header cells (`titleFields` rows + `headerValues` rows) — each row gets the same sticky styles so the entire frozen column visually moves together.
    - Subtotal rows if applicable.
4. **CSS module** — extend `PivotTable.module.css` with `.sticky-column` / `.last-sticky-column` rules (drop shadow on the right edge of the last frozen column, opaque background to layer over scrolling content). Reuse the pattern from the non-pivoted Table module.
5. **Z-index ordering** — frozen body cells must layer over scrolling body cells; frozen header cells must layer over scrolling header cells AND non-frozen body cells.

### Frontend — `TableConfigPanel/ColumnConfiguration.tsx`

Already has a "Freeze column" toggle (line 73, `setFreezeTooltipVisible`) for the non-pivoted Table. Extend it for the pivoted-mode rendering:

- For each row dimension column → show the toggle (always allowed).
- For each metric column when `metricsAsRows === false` → show the toggle.
- When `metricsAsRows === true` → omit the freeze toggle entirely from metric rows (no toggle, no disabled+tooltip — cleaner UI).
- Row totals column → no toggle (row totals always sit on the right edge; freezing isn't meaningful).

The toggle writes to the same `TableChart.columns[fieldId].frozen` field that non-pivoted tables use. Save / load is automatic.

### Edge cases

- **Row totals**: stay on the right edge. Don't conflict with left-edge freeze.
- **Column totals**: render below the body. Sticky `left` applies the same way.
- **`metricsAsRows = true`**: only row dimensions exist on the left. The leftmost dimension column is the natural freeze target; freezing it works the same as any other dimension column. Acceptance criteria met by simply hiding the metric-row freeze toggle.
- **`hideRowNumbers = false`**: the row-number column is always leftmost. It implicitly behaves frozen today (see `Table/TableProvider.tsx:119-135` `stickyRowColumn`). Mirror that for the pivoted table — the row-number column should always be sticky, with frozen columns starting at its right edge.
- **No frozen columns selected**: zero overhead, layout unchanged.
- **Horizontal scroll container**: PivotTable's existing scroll wrapper handles the sticky positioning; verify the ancestor has the right `overflow-x` and no clipping that breaks `position: sticky`.

## Data flow

```
User opens TableConfigPanel → ColumnConfiguration row for dimension X
  → toggles "Freeze column"
  → writes TableChart.columns['dim_x'].frozen = true
  → chart config update propagates
  → PivotTable/index.tsx useMemo re-computes columns
  → frozen column gets sticky positioning + cumulative left
  → CSS sticky keeps it visible during horizontal scroll
```

## Backend

**No changes.** This is purely a rendering + config-panel change.

## Testing

- Manual: pivoted chart, freeze leftmost dim, scroll horizontally — column stays put.
- Manual: pivoted chart with `metricsAsRows = true` — confirm no freeze toggle on metric rows.
- Manual: pivoted chart with row totals enabled — confirm right-edge totals + left-edge freeze coexist.
- Manual: freeze multiple dimensions — verify cumulative left offsets line up correctly with no gaps.
- Visual regression: header alignment with multi-row pivot headers.

## Hidden gotchas

- **Multi-row header alignment**: each row of the header (`titleFields`, `headerValues`) needs the same `left` value applied or the column will visibly tear during scroll. Easy to miss with TanStack's per-row rendering.
- **Sticky parent containers**: `position: sticky` silently breaks if any ancestor has `overflow: hidden` or `overflow-x: hidden` set incorrectly. Verify the existing PivotTable scroll wrapper is compatible.
- **Z-index stacking**: frozen header cells need higher z-index than frozen body cells, which need higher z-index than scrolling cells. Use the existing pattern from `Table/ScrollableTable/TableBody.tsx:146`.
- **Dashboard tile rendering**: pivoted charts on dashboards use the same component — verify freeze behaves correctly inside dashboard tiles (smaller widths, more horizontal scroll).
- **Conditional formatting**: cells already iterate via `cell.column.columnDef.meta?.headerInfo` (`PivotTable/index.tsx:465-489`). Sticky positioning is a style concern only — doesn't disturb conditional formatting lookup.
- **Column resizing** (if present in pivoted tables): if widths change, cumulative left offsets need recomputing. Verify whether the existing `useColumnResize` hook is wired into the pivoted path or only the non-pivoted one.
