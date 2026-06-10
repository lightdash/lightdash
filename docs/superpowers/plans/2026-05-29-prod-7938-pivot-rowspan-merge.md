# Pivot `rowSpan`-Merged Dimension Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grouping-only `showRowGrouping` rendering in the pivot table (separate TanStack group-header rows) with top-aligned `rowSpan`-merged dimension cells, blank empty cells, and no virtualization in that mode.

**Architecture:** A new pure helper computes per-row/per-column `rowSpan` info from the flat row order (consecutive run-length encoding, nested-aware). `PivotTable` stops engaging TanStack grouping in grouping-only mode (`showRowGrouping && !showSubtotals`), renders the flat row model un-virtualized, and the cell renderer emits `rowSpan` on block-start cells / `null` on absorbed cells. Subtotals mode and the flag-off path are untouched.

**Tech Stack:** React 19, `@tanstack/react-table` v8, `@tanstack/react-virtual`, Vitest, CSS modules, `@lightdash/common` types.

**Spec:** `docs/superpowers/specs/2026-05-29-prod-7938-pivot-rowspan-merge-design.md`

---

## File Structure

- **Create** `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.ts`
  Pure helpers: `getGroupedDimColumnIds` (which index-dim columns merge) and `getRowSpanMerges` (per-row/per-column `{ isBlockStart, rowSpan }`). No React, fully unit-testable.
- **Create** `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.test.ts`
  Vitest unit tests for both helpers.
- **Modify** `packages/frontend/src/components/common/PivotTable/PivotTable.module.css`
  Add `.mergedDimCell { vertical-align: top; }`.
- **Modify** `packages/frontend/src/components/common/PivotTable/index.tsx`
  Use the helpers in the grouping `useEffect`, precompute spans, disable virtualization in merge mode, and emit `rowSpan` / blank cells in the body cell renderer.

No `@lightdash/common`, backend, API-generation, or migration changes.

---

## Task 1: Pure span helpers + unit tests

**Files:**
- Create: `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.ts`
- Test: `packages/frontend/src/components/common/PivotTable/getRowSpanMerges.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `getRowSpanMerges.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { getGroupedDimColumnIds, getRowSpanMerges } from './getRowSpanMerges';

// Builds a getRawValue reader over an array of plain row objects.
const reader =
    (rows: Record<string, unknown>[]) =>
    (rowIndex: number, columnId: string) =>
        rows[rowIndex]?.[columnId];

describe('getGroupedDimColumnIds', () => {
    it('returns index dims in column order minus the leaf dim', () => {
        const indexValueTypes = [
            { fieldId: 'month' },
            { fieldId: 'tier' },
        ] as never;
        const columnOrder = ['month', 'tier', 'metric_a', 'metric_b'];
        expect(getGroupedDimColumnIds(indexValueTypes, columnOrder)).toEqual([
            'month',
        ]);
    });

    it('returns empty when there is only a single index dim', () => {
        const indexValueTypes = [{ fieldId: 'month' }] as never;
        expect(
            getGroupedDimColumnIds(indexValueTypes, ['month', 'metric_a']),
        ).toEqual([]);
    });

    it('returns empty when there are no index dims', () => {
        expect(getGroupedDimColumnIds([] as never, ['metric_a'])).toEqual([]);
    });
});

describe('getRowSpanMerges', () => {
    it('merges consecutive equal values in a single column', () => {
        const rows = [
            { month: '2026-02' },
            { month: '2026-02' },
            { month: '2026-01' },
        ];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 2 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('does not merge non-adjacent equal values', () => {
        const rows = [{ month: 'A' }, { month: 'B' }, { month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('computes nested spans: outer dim spans wider than inner', () => {
        const rows = [
            { a: 'x', b: 'p' },
            { a: 'x', b: 'p' },
            { a: 'x', b: 'q' },
            { a: 'y', b: 'p' },
        ];
        const merges = getRowSpanMerges(rows.length, ['a', 'b'], reader(rows));
        expect(merges.get('a')).toEqual([
            { isBlockStart: true, rowSpan: 3 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 2 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('does not merge an inner value repeating under a different outer value', () => {
        const rows = [
            { a: 'x', b: 'p' },
            { a: 'y', b: 'p' },
        ];
        const merges = getRowSpanMerges(rows.length, ['a', 'b'], reader(rows));
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('handles a single row', () => {
        const rows = [{ month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([{ isBlockStart: true, rowSpan: 1 }]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -F frontend exec vitest run src/components/common/PivotTable/getRowSpanMerges.test.ts`
Expected: FAIL — cannot resolve `./getRowSpanMerges` (module not created yet).

- [ ] **Step 3: Write the helper implementation**

Create `getRowSpanMerges.ts`:

```typescript
import { type PivotData } from '@lightdash/common';

export type RowSpanMerge = {
    isBlockStart: boolean;
    rowSpan: number;
};

/**
 * The row-index dimension columns that get visually merged in grouping-only
 * mode: the index dimensions in column order, minus the last one. The leaf
 * dimension stays per-row, matching the existing showRowGrouping behaviour
 * (grouping on the leaf would produce one group per row). Shared with the
 * TanStack grouping setup so the two stay in sync.
 */
export const getGroupedDimColumnIds = (
    indexValueTypes: PivotData['indexValueTypes'],
    columnOrder: string[],
): string[] => {
    const indexDimIds = new Set(
        indexValueTypes.map((valueType) => valueType.fieldId),
    );
    return columnOrder
        .filter((columnId) => indexDimIds.has(columnId))
        .slice(0, -1);
};

/**
 * Computes per-row, per-column rowSpan-merge info over the FLAT row order using
 * consecutive run-length encoding. A block starts when the prefix tuple of
 * grouped values (outer..this column) changes from the previous row; the
 * block-start row carries the full rowSpan, absorbed rows carry rowSpan 0.
 *
 * Using the prefix (not just this column's own value) yields correct nested
 * spans: an outer-dimension change always starts a new block for inner
 * dimensions, and an inner value repeating under a different outer value is not
 * merged. This is consecutive-only by design — it preserves the existing row
 * order rather than globally regrouping (see the spec's "Ordering assumption").
 *
 * @param rowCount   total number of (flat) rows
 * @param columnIds  grouped dimension column ids, outer -> inner
 * @param getRawValue reads the comparable raw value for (rowIndex, columnId)
 */
export const getRowSpanMerges = (
    rowCount: number,
    columnIds: string[],
    getRawValue: (rowIndex: number, columnId: string) => unknown,
): Map<string, RowSpanMerge[]> => {
    const result = new Map<string, RowSpanMerge[]>();

    columnIds.forEach((columnId, columnIndex) => {
        const prefix = columnIds.slice(0, columnIndex + 1);
        const spans: RowSpanMerge[] = new Array<RowSpanMerge>(rowCount);
        let blockStartRow = 0;

        for (let row = 0; row < rowCount; row += 1) {
            const startsNewBlock =
                row === 0 ||
                prefix.some(
                    (id) => getRawValue(row, id) !== getRawValue(row - 1, id),
                );

            if (startsNewBlock) {
                blockStartRow = row;
                spans[row] = { isBlockStart: true, rowSpan: 1 };
            } else {
                spans[blockStartRow].rowSpan += 1;
                spans[row] = { isBlockStart: false, rowSpan: 0 };
            }
        }

        result.set(columnId, spans);
    });

    return result;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F frontend exec vitest run src/components/common/PivotTable/getRowSpanMerges.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Lint the new files**

Run: `pnpm -F frontend lint`
Expected: no errors. If `ResultValue` is reported unused, remove it from the import in `getRowSpanMerges.ts` and re-run.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/getRowSpanMerges.ts packages/frontend/src/components/common/PivotTable/getRowSpanMerges.test.ts
git commit -m "feat(pivot): add getRowSpanMerges helper for merged row grouping"
```

---

## Task 2: Add the top-align CSS class

**Files:**
- Modify: `packages/frontend/src/components/common/PivotTable/PivotTable.module.css`

- [ ] **Step 1: Inspect the file**

Run: `cat packages/frontend/src/components/common/PivotTable/PivotTable.module.css`
Confirm it contains the existing `.stickyColumn` / `.fixedLayout` classes referenced by `pivotStyles`.

- [ ] **Step 2: Append the merged-cell class**

Add at the end of the file:

```css
.mergedDimCell {
    vertical-align: top;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/PivotTable.module.css
git commit -m "feat(pivot): add mergedDimCell top-align style"
```

---

## Task 3: Wire merge rendering into `PivotTable`

All edits are in `packages/frontend/src/components/common/PivotTable/index.tsx`. Make every edit, then run the verification gate (Step 7) once before committing so the repo compiles at the commit boundary.

The merge mode is exactly the existing `groupingOnlyMode` constant (`showRowGrouping && !showSubtotals`, line 220). Because the `showRowGrouping` prop is already flag-gated upstream in `useTableConfig`, `groupingOnlyMode === true` ⇔ flag on + row grouping on + subtotals off ⇔ merge mode. Reuse it directly; do **not** add a new boolean.

**Files:**
- Modify: `packages/frontend/src/components/common/PivotTable/index.tsx`

- [ ] **Step 1: Import the helpers**

Find the existing import block for `./getFrozenColumnLayout` (around line 82-85):

```typescript
import {
    getFrozenColumnLayout,
    type FrozenColumnEntry,
} from './getFrozenColumnLayout';
```

Add immediately after it:

```typescript
import {
    getGroupedDimColumnIds,
    getRowSpanMerges,
} from './getRowSpanMerges';
```

- [ ] **Step 2: Refactor the grouping `useEffect` to use the shared helper and skip merge mode**

Replace the whole `useEffect` at lines 950-988 (the one that begins with the comment `// TODO: Remove code duplicated from non-pivot table version.`) with:

```typescript
    useEffect(() => {
        // Grouping is driven by subtotals only. Row-grouping without subtotals
        // (groupingOnlyMode) now renders a FLAT row model with merged rowSpan
        // cells (see getRowSpanMerges / the body renderer below), so it must
        // NOT engage the TanStack grouping machinery.
        const groupingActive =
            showSubtotals || (showRowGrouping && !groupingOnlyMode);
        if (groupingActive) {
            const sortedColumns = getGroupedDimColumnIds(
                data.indexValueTypes,
                table.getState().columnOrder,
            );

            if (!isEqual(sortedColumns, table.getState().grouping)) {
                table.setGrouping(sortedColumns);
            }
        } else if (table.getState().grouping.length > 0) {
            table.resetGrouping();
        }
    }, [
        showSubtotals,
        showRowGrouping,
        groupingOnlyMode,
        data.indexValueTypes,
        table,
        columnOrder,
    ]);
```

(This preserves the exact grouped-column set the old inline code produced —
`columnOrder.filter(isIndexDim).slice(0, -1)` — and only changes *when*
grouping is engaged.)

- [ ] **Step 3: Precompute the rowSpan merges**

Find `const virtualRows = rowVirtualizer.getVirtualItems();` (line 669). Add immediately after it:

```typescript

    // Grouping-only mode renders a flat row model and visually merges repeated
    // row-index dimension values with rowSpan instead of TanStack group rows.
    const rowSpanMergesByColumnId = useMemo(() => {
        if (!groupingOnlyMode) return null;
        const groupedColumnIds = getGroupedDimColumnIds(
            data.indexValueTypes,
            columnOrder,
        );
        if (groupedColumnIds.length === 0) return null;
        return getRowSpanMerges(rows.length, groupedColumnIds, (rowIndex, columnId) => {
            const cell = rows[rowIndex]?.getValue(columnId) as
                | { value?: ResultValue }
                | undefined;
            return cell?.value?.raw;
        });
    }, [groupingOnlyMode, data.indexValueTypes, columnOrder, rows]);

    // In merge mode, render every row (no virtualization) so rowSpans stay
    // contiguous — a block's first row must never be unmounted while its
    // absorbed siblings are visible.
    const renderedBodyRows = groupingOnlyMode
        ? rows.map((row, rowIndex) => ({ row, rowIndex }))
        : virtualRows.map((virtualRow) => ({
              row: rows[virtualRow.index],
              rowIndex: virtualRow.index,
          }));
```

(`useMemo`, `ResultValue`, `rows`, `columnOrder`, and `virtualRows` are all already in scope / imported.)

- [ ] **Step 4: Disable virtualization padding + iterate `renderedBodyRows` in the body**

In the `<Table.Body>` block (lines 1466-1485), change the top padding guard, the map source, and the per-row destructuring.

Replace:

```typescript
            <Table.Body>
                {paddingTop > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingTop}
                    />
                )}

                {virtualRows.map((virtualRow) => {
                    const rowIndex = virtualRow.index;
                    const row = rows[rowIndex];
                    if (!row) return null;

                    const toggleExpander = row.getToggleExpandedHandler();
```

with:

```typescript
            <Table.Body>
                {!groupingOnlyMode && paddingTop > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingTop}
                    />
                )}

                {renderedBodyRows.map(({ row, rowIndex }) => {
                    if (!row) return null;

                    const toggleExpander = row.getToggleExpandedHandler();
```

- [ ] **Step 5: Fix the first-row measure ref + bottom padding guard**

(a) Inside the row map, find the `measureRef` definition (lines 1490-1493):

```typescript
                                const measureRef =
                                    virtualRow.index === 0
                                        ? measureCellRef(cell.column.id)
                                        : undefined;
```

Replace `virtualRow.index === 0` with `rowIndex === 0`:

```typescript
                                const measureRef =
                                    rowIndex === 0
                                        ? measureCellRef(cell.column.id)
                                        : undefined;
```

(b) Find the bottom padding block (around line 1856):

```typescript
                {paddingBottom > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingBottom}
```

Change its guard to:

```typescript
                {!groupingOnlyMode && paddingBottom > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingBottom}
```

- [ ] **Step 6a: Skip absorbed cells in the cell renderer**

Find the start of the non-row-number cell logic — immediately after the `ROW_NUMBER_COLUMN_ID` branch closes (`}` at line 1538) and before `const meta = cell.column.columnDef.meta;` (line 1540). Insert:

```typescript

                                // Grouping-only mode: merge repeated row-index
                                // dimension values with rowSpan. The block's
                                // first row renders the value spanning the
                                // block; absorbed rows render no <td> so the
                                // span covers their position.
                                const rowSpanMerge =
                                    rowSpanMergesByColumnId?.get(cell.column.id)?.[
                                        rowIndex
                                    ];
                                if (rowSpanMerge && !rowSpanMerge.isBlockStart) {
                                    return null;
                                }
```

- [ ] **Step 6b: Emit `rowSpan` + top-align class on block-start cells**

Find the `<TableCellComponent` opening (line 1708-1713):

```typescript
                                return (
                                    <TableCellComponent
                                        key={`value-${rowIndex}-${colIndex}-${data.pivotConfig.metricsAsRows}`}
                                        ref={measureRef}
                                        className={stickyCellProps.className}
                                        style={stickyCellProps.style}
```

Replace the `className` line and add a `rowSpan` prop:

```typescript
                                return (
                                    <TableCellComponent
                                        key={`value-${rowIndex}-${colIndex}-${data.pivotConfig.metricsAsRows}`}
                                        ref={measureRef}
                                        rowSpan={rowSpanMerge?.rowSpan}
                                        className={
                                            rowSpanMerge
                                                ? `${pivotStyles.mergedDimCell}${
                                                      stickyCellProps.className
                                                          ? ` ${stickyCellProps.className}`
                                                          : ''
                                                  }`
                                                : stickyCellProps.className
                                        }
                                        style={stickyCellProps.style}
```

(`rowSpan` is `undefined` for non-merged cells, so it is not rendered. It passes through `LightTable.Cell`'s `...rest` onto the underlying `<td>`.)

- [ ] **Step 6c: Render empty data cells blank in merge mode**

Find the final content branch (lines 1843-1848):

```typescript
                                        ) : cell.getIsPlaceholder() ? null : (
                                            flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )
                                        )}
```

Replace with:

```typescript
                                        ) : cell.getIsPlaceholder() ? null : groupingOnlyMode &&
                                          isDataColumn &&
                                          value == null ? null : (
                                            flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )
                                        )}
```

(`isDataColumn` is defined at line 1542; `value` at line 1577. `value == null`
matches both `null` and `undefined`, i.e. an empty pivot cell. Returning `null`
suppresses both the `∅`/`-` placeholder and any bar-display background.)

- [ ] **Step 7: Verification gate — typecheck, lint, build, unit tests**

Run each and confirm clean before committing:

```bash
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F frontend exec vitest run src/components/common/PivotTable/getRowSpanMerges.test.ts
```

Expected: typecheck PASS, lint PASS (no unused `VirtualizedArea`/`virtualRows` — both are still used in the non-merge path), tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/index.tsx
git commit -m "feat(pivot): render merged rowSpan cells for row grouping (PROD-7938)"
```

---

## Task 4: Manual browser verification

No automated UI test exists for `PivotTable` rowSpan rendering; verify in the running app. The `PivotRowGrouping` feature flag must be enabled for the test user (it gates the "Group repeated row values" toggle).

**Files:** none (verification only).

- [ ] **Step 1: Confirm the feature flag is enabled**

The "Group repeated row values" toggle only appears when `PivotRowGrouping` is on for `demo@lightdash.com`. If the toggle is missing in Step 3, enable the flag for the demo user before continuing.

- [ ] **Step 2: Build a grouped pivot (metrics as columns)**

In the running app (login `demo@lightdash.com` / `demo_password!`):
1. Open an Explore / chart with at least **two dimensions** and **one pivot dimension** with a couple of distinct values (so metrics render as columns under each pivot value), plus 1-2 metrics.
2. Switch the visualization to **Table**, enable **pivot** on the pivot dimension, keep **"Show metrics as rows" OFF**.
3. Sort by the outer row dimension so its values are contiguous (the standard pivot ordering).

- [ ] **Step 3: Enable row grouping and verify the merged look**

Turn on **"Group repeated row values"** (subtotals OFF) and confirm against the target (spec screenshot 1 / "Target look"):
- The grouped (non-leaf) dimension value renders **once per run**, **top-aligned**, vertically spanning its block — **no separate group-header row**.
- The leaf dimension and metric cells render **per row**.
- Empty data cells are **blank** — no `∅`, no `-`, no bar background.
- Row numbers are **sequential** (`1, 2, 3 …`) with no blank-numbered rows.
- Frozen/sticky left columns still align (scroll horizontally to check).
- Scroll vertically through a long table — merged cells stay aligned (virtualization is off in this mode).

- [ ] **Step 4: Verify the untouched paths**

- Turn **"Group repeated row values" OFF** → table returns to the plain per-row rendering (values repeated, `∅`/`-` shown), virtualization active.
- Turn **subtotals ON** → subtotal/aggregate rows render exactly as before (TanStack grouping unchanged), `∅`/`-` shown.

- [ ] **Step 5: Record the result**

Confirm all checks pass. If anything is off (alignment, sticky columns, conditional-formatting colors on merged cells), note it and return to Task 3 to adjust — do not claim completion until the merged look matches the target and the untouched paths are verified.

---

## Self-Review (completed during planning)

- **Spec coverage:** activation via existing `groupingOnlyMode`/flag (Task 3 Steps 1-2), flat row model / no TanStack grouping (Step 2), nested consecutive span computation (Task 1), rowSpan + top-align rendering (Step 6a/6b + Task 2 CSS), blank empty cells (Step 6c), virtualization disabled (Steps 3-5), header rework explicitly out of scope (none needed), subtotals/flag-off untouched (Step 2 + Task 4 Step 4). All covered.
- **Placeholder scan:** none — every code step contains complete code.
- **Type/name consistency:** `getGroupedDimColumnIds`, `getRowSpanMerges`, `RowSpanMerge { isBlockStart, rowSpan }`, `rowSpanMergesByColumnId`, `renderedBodyRows`, `rowSpanMerge`, `groupingOnlyMode` used identically across tasks.
