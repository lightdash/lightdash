# PROD-639 — Freeze columns in pivot tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to freeze leftmost columns in a pivoted table chart so they stay visible while scrolling horizontally. Reuse the existing `ColumnProperties.frozen` field; render via CSS sticky positioning.

**Architecture:**
A new pure helper `getFrozenColumnLayout` walks the pivot's `pivotColumnInfo` left-to-right, computes cumulative `left` offsets for columns whose freeze key is marked frozen in `columnProperties`, and returns a `Map<fieldId, { left, isLast }>`. `PivotTable/index.tsx` consults that map when rendering header rows + body cells, applying inline sticky styles + CSS classes. The freeze toggle in `TableConfigPanel/ColumnConfiguration.tsx` is unhidden for non-pivoted dimensions and (when `metricsAsRows === false`) for metrics.

**Tech Stack:** React 19, TanStack Table, Mantine v7 (existing PivotTable deps), CSS Modules, Vitest for unit tests, `renderWithProviders` from `testing/testUtils` for component tests.

**Spec:** [docs/superpowers/specs/2026-05-11-prod-639-pivot-frozen-columns-design.md](../specs/2026-05-11-prod-639-pivot-frozen-columns-design.md)

**Key constraints discovered while planning:**

- `PivotTable/index.tsx:349-351` already sets `columnPinning.left: [ROW_NUMBER_COLUMN_ID]` in TanStack state but PivotTable does NOT consume `getIsPinned()` — it manually renders header cells via iteration over `data.headerValues` / `data.titleFields`. So we cannot use TanStack's pinning machinery for visual rendering; we apply sticky styles manually.
- The existing non-pivoted Table reorders frozen columns to the left (`Table/TableProvider.tsx:115-141`). In pivot, column order is fixed by pivot semantics — we don't reorder. Sticky positioning is "best effort": frozen columns get a cumulative `left` offset based on their natural position. For dimension columns (which are naturally leftmost), this works perfectly. For pivoted metric columns, it's documented but not visually polished — see Task 6 caveat.
- The freeze "key" in `columnProperties` follows the same rules as width: `widthKey = (col.columnType === 'indexValue' || col.columnType === 'label') ? col.fieldId : (col.underlyingId || col.baseId)` (see `index.tsx:228-235`). Setting `frozen` on a metric fieldId freezes ALL its pivot slices (consistent with how width works).

---

### Task 1: Test scaffold for `getFrozenColumnLayout`

**Files:**
- Create: `packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.test.ts`

The helper takes `pivotColumnInfo` (the per-column metadata array from `PivotData.retrofitData.pivotColumnInfo`), a `columnProperties` map keyed by underlying field id, and a few sizing inputs. It returns a `Map<renderedFieldId, { left: number; isLast: boolean }>` — only the entries for columns that should be sticky.

- [ ] **Step 1: Write the failing test file**

```ts
// packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.test.ts
import { describe, expect, it } from 'vitest';
import type { PivotColumn } from '@lightdash/common';
import { getFrozenColumnLayout } from './getFrozenColumnLayout';

const indexCol = (fieldId: string): PivotColumn => ({
    fieldId,
    baseId: undefined,
    underlyingId: undefined,
    columnType: 'indexValue',
});

const dataCol = (fieldId: string, baseId: string): PivotColumn => ({
    fieldId,
    baseId,
    underlyingId: undefined,
    columnType: undefined,
});

describe('getFrozenColumnLayout', () => {
    it('returns an empty map when no columns are frozen', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: {},
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.size).toBe(0);
    });

    it('starts cumulative left at rowNumberWidth when row numbers are shown', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: { orders_category: { frozen: true } },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: true,
        });
    });

    it('starts cumulative left at 0 when row numbers are hidden', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: { orders_category: { frozen: true } },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 0,
            isLast: true,
        });
    });

    it('chains cumulative left across multiple frozen index columns', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
            ],
            columnProperties: {
                orders_category: { frozen: true, width: 120 },
                orders_region: { frozen: true, width: 80 },
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.get('orders_region')).toEqual({
            left: 170,
            isLast: true,
        });
    });

    it('uses defaultColumnWidth when a frozen column has no explicit width', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
            ],
            columnProperties: {
                orders_category: { frozen: true },
                orders_region: { frozen: true, width: 80 },
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.get('orders_region')).toEqual({
            left: 150,
            isLast: true,
        });
    });

    it('skips non-frozen columns but advances offset for frozen ones only', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
                indexCol('orders_segment'),
            ],
            columnProperties: {
                orders_category: { frozen: true, width: 120 },
                orders_segment: { frozen: true, width: 80 },
                // orders_region is NOT frozen — left offset for orders_segment
                // is computed from orders_category only.
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.has('orders_region')).toBe(false);
        expect(layout.get('orders_segment')).toEqual({
            left: 170,
            isLast: true,
        });
    });

    it('uses underlyingId/baseId as the freeze key for data columns', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                dataCol('total_count__pivot_0', 'total_count'),
                dataCol('total_count__pivot_1', 'total_count'),
            ],
            columnProperties: {
                total_count: { frozen: true, width: 90 },
            },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        // Both pivot slices of the same metric become sticky because the freeze
        // key resolves to the metric's baseId.
        expect(layout.get('total_count__pivot_0')).toEqual({
            left: 0,
            isLast: false,
        });
        expect(layout.get('total_count__pivot_1')).toEqual({
            left: 90,
            isLast: true,
        });
    });

    it('marks only the rightmost frozen entry as isLast', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
            ],
            columnProperties: {
                orders_category: { frozen: true },
                orders_region: { frozen: true },
            },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')?.isLast).toBe(false);
        expect(layout.get('orders_region')?.isLast).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm -F frontend exec vitest run src/components/common/PivotTable/getFrozenColumnLayout.test.ts
```

Expected: all 8 tests fail with module-not-found / import error for `./getFrozenColumnLayout`.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.test.ts
git commit -m "test(frontend): add tests for pivot frozen column layout helper"
```

---

### Task 2: Implement `getFrozenColumnLayout`

**Files:**
- Create: `packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.ts`

- [ ] **Step 1: Write the helper**

```ts
// packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.ts
import type { ColumnProperties, PivotColumn } from '@lightdash/common';

export type FrozenColumnEntry = {
    left: number;
    isLast: boolean;
};

type Args = {
    pivotColumnInfo: PivotColumn[];
    columnProperties: Record<string, ColumnProperties | undefined>;
    rowNumberWidth: number;
    defaultColumnWidth: number;
};

/**
 * Resolves the column-properties key used for a given pivot column.
 *
 * Mirrors the rule used for column widths in PivotTable/index.tsx:
 * - indexValue / label columns key on the column's own fieldId
 * - data columns key on the underlying metric (or last pivot dim) baseId
 *
 * Returns undefined for columns that have no usable freeze key (e.g.
 * the all-pivoted spacer).
 */
const getFreezeKey = (col: PivotColumn): string | undefined => {
    if (col.columnType === 'indexValue' || col.columnType === 'label') {
        return col.fieldId;
    }
    return col.underlyingId ?? col.baseId;
};

const getColumnWidth = (
    freezeKey: string,
    columnProperties: Record<string, ColumnProperties | undefined>,
    defaultColumnWidth: number,
): number => columnProperties[freezeKey]?.width ?? defaultColumnWidth;

/**
 * Walks the pivot column info left-to-right and computes cumulative `left`
 * offsets for columns marked frozen in columnProperties. Returns a map
 * keyed by the rendered fieldId (col.fieldId), so cell renderers can look
 * up sticky positioning by the same id used in their TanStack column.
 *
 * Non-frozen columns are skipped entirely — their offsets do NOT contribute
 * to the cumulative position of subsequent frozen columns. This matches the
 * "all sticky columns sit flush to the left edge" behaviour users expect.
 */
export const getFrozenColumnLayout = ({
    pivotColumnInfo,
    columnProperties,
    rowNumberWidth,
    defaultColumnWidth,
}: Args): Map<string, FrozenColumnEntry> => {
    const layout = new Map<string, FrozenColumnEntry>();
    let cumulativeLeft = rowNumberWidth;
    let lastFrozenFieldId: string | undefined;

    for (const col of pivotColumnInfo) {
        const freezeKey = getFreezeKey(col);
        if (!freezeKey) continue;

        const isFrozen = columnProperties[freezeKey]?.frozen === true;
        if (!isFrozen) continue;

        const width = getColumnWidth(
            freezeKey,
            columnProperties,
            defaultColumnWidth,
        );

        layout.set(col.fieldId, { left: cumulativeLeft, isLast: false });
        lastFrozenFieldId = col.fieldId;
        cumulativeLeft += width;
    }

    if (lastFrozenFieldId) {
        const lastEntry = layout.get(lastFrozenFieldId);
        if (lastEntry) {
            layout.set(lastFrozenFieldId, { ...lastEntry, isLast: true });
        }
    }

    return layout;
};
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
pnpm -F frontend exec vitest run src/components/common/PivotTable/getFrozenColumnLayout.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 3: Typecheck**

```bash
pnpm -F frontend typecheck
```

Expected: no errors related to the new file.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/getFrozenColumnLayout.ts
git commit -m "feat(frontend): add getFrozenColumnLayout helper for pivot tables"
```

---

### Task 3: Compute frozen layout in PivotTable and thread onto column meta

**Files:**
- Modify: `packages/frontend/src/components/common/Table/types.ts` (extend `meta`)
- Modify: `packages/frontend/src/components/common/PivotTable/index.tsx` (add import; add top-level `frozenLayout` useMemo; stash entry on column meta)

The layout must be reachable by both the `columns` useMemo (for column meta) and the JSX rendering header / body cells. So we compute it in its own top-level `useMemo` and consume it from both places.

We extend `TableColumn.meta` with a separate `frozenLayout` field rather than reusing the existing `frozen?: boolean` (which the non-pivoted Table uses for its column-pinning logic). Keeping pivot-only data under `frozenLayout` avoids ambiguity.

- [ ] **Step 1: Extend the meta type**

Open `packages/frontend/src/components/common/Table/types.ts` and find the line `frozen?: boolean;` (currently around line 48). Add a sibling field directly below:

```ts
        frozen?: boolean;
        frozenLayout?: { left: number; isLast: boolean };
```

- [ ] **Step 2: Add the import in PivotTable**

In `packages/frontend/src/components/common/PivotTable/index.tsx`, locate the import block. Find the line `import pivotStyles from './PivotTable.module.css';` (currently line 64). Add immediately below it:

```tsx
import {
    getFrozenColumnLayout,
    type FrozenColumnEntry,
} from './getFrozenColumnLayout';
```

- [ ] **Step 3: Add a top-level `frozenLayout` useMemo**

In `index.tsx`, find the existing `hasCustomWidths` useMemo (currently lines 169-175):

```tsx
    const hasCustomWidths = useMemo(
        () =>
            Object.values(columnProperties).some(
                (prop) => prop?.width !== undefined,
            ),
        [columnProperties],
    );
```

Insert the new useMemo immediately AFTER it:

```tsx
    const frozenLayout = useMemo(
        () =>
            getFrozenColumnLayout({
                pivotColumnInfo: data.retrofitData.pivotColumnInfo,
                columnProperties,
                rowNumberWidth: hideRowNumbers ? 0 : ROW_NUMBER_COL_WIDTH,
                defaultColumnWidth: 100,
            }),
        [
            data.retrofitData.pivotColumnInfo,
            columnProperties,
            hideRowNumbers,
        ],
    );
```

- [ ] **Step 4: Stash the frozen entry on each column's meta**

Inside the `columns` useMemo (currently starts at line 177 returning `{ columns, columnOrder, colWidths }`), find the meta object inside `.map((col, colIndex) => { ... })`. Currently lines 244-252:

```tsx
                        meta: {
                            item: item,
                            width: colWidth,
                            type: col.columnType,
                            headerInfo:
                                colIndex < finalHeaderInfoForColumns.length
                                    ? finalHeaderInfoForColumns[colIndex]
                                    : undefined,
                        },
```

Replace with:

```tsx
                        meta: {
                            item: item,
                            width: colWidth,
                            type: col.columnType,
                            headerInfo:
                                colIndex < finalHeaderInfoForColumns.length
                                    ? finalHeaderInfoForColumns[colIndex]
                                    : undefined,
                            frozenLayout: frozenLayout.get(col.fieldId),
                        },
```

- [ ] **Step 5: Add `frozenLayout` to the columns useMemo deps**

The `columns` useMemo currently ends with `}, [data, hideRowNumbers, getField, columnProperties]);` (line 332). Add `frozenLayout`:

```tsx
    }, [data, hideRowNumbers, getField, columnProperties, frozenLayout]);
```

- [ ] **Step 6: Typecheck**

```bash
pnpm -F frontend typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/index.tsx packages/frontend/src/components/common/Table/types.ts
git commit -m "feat(frontend): thread frozen column layout into pivot column meta"
```

---

### Task 4: Apply sticky styles to body cells

**Files:**
- Modify: `packages/frontend/src/components/common/PivotTable/PivotTable.module.css` (add sticky classes)
- Modify: `packages/frontend/src/components/common/PivotTable/index.tsx` (helper + body cell patch around line 1089)

- [ ] **Step 1: Add CSS classes**

Open `packages/frontend/src/components/common/PivotTable/PivotTable.module.css`. The current file has 9 lines (the `.fixedLayout` block). Append at the end:

```css
.stickyColumn {
    position: sticky;
    z-index: 1;
    background-color: var(--mantine-color-body, white);
}

.stickyHeaderColumn {
    z-index: 2;
}

.stickyColumnLast {
    box-shadow: 4px 0 4px -2px rgba(0, 0, 0, 0.1);
}
```

The background overrides default cell transparency so scrolling content doesn't bleed through. The shadow on the last sticky column gives visual separation when scrolling. `stickyHeaderColumn` raises the z-index for header cells so they layer above sticky body cells.

- [ ] **Step 2: Add the sticky-prop helpers near the top of PivotTable**

In `packages/frontend/src/components/common/PivotTable/index.tsx`, find the existing const declarations near the top of the file (around line 68-69):

```tsx
const ROW_NUMBER_COL_WIDTH = 50;
const MIN_AUTO_COL_WIDTH = 50;
```

Insert immediately AFTER the `MIN_AUTO_COL_WIDTH` line:

```tsx
const getStickyCellProps = (frozen: FrozenColumnEntry | undefined) => {
    if (!frozen) return {};
    return {
        className: `${pivotStyles.stickyColumn}${
            frozen.isLast ? ` ${pivotStyles.stickyColumnLast}` : ''
        }`,
        style: { left: frozen.left },
    };
};

const getStickyHeaderProps = (frozen: FrozenColumnEntry | undefined) => {
    if (!frozen) return {};
    return {
        className: `${pivotStyles.stickyColumn} ${pivotStyles.stickyHeaderColumn}${
            frozen.isLast ? ` ${pivotStyles.stickyColumnLast}` : ''
        }`,
        style: { left: frozen.left },
    };
};
```

- [ ] **Step 3: Apply sticky props to the body cell render**

In `index.tsx`, find the body cell render block. Currently lines 1089-1106 read:

```tsx
                                const cellWidth = meta?.width;

                                const TableCellComponent = isRowTotal
                                    ? Table.CellHead
                                    : Table.Cell;
                                return (
                                    <TableCellComponent
                                        key={`value-${rowIndex}-${colIndex}-${data.pivotConfig.metricsAsRows}`}
                                        isMinimal={isMinimal}
                                        withAlignRight={isNumericItem(item)}
                                        w={cellWidth}
                                        miw={cellWidth}
                                        maw={cellWidth}
                                        withColor={conditionalFormatting?.color}
                                        withBoldFont={meta?.type === 'label'}
                                        withBackground={
                                            conditionalFormatting?.backgroundColor
                                        }
```

Replace with (adds the `stickyCellProps` line and spreads `className` + `style` onto `TableCellComponent`):

```tsx
                                const cellWidth = meta?.width;

                                const stickyCellProps = getStickyCellProps(
                                    meta?.frozenLayout,
                                );

                                const TableCellComponent = isRowTotal
                                    ? Table.CellHead
                                    : Table.Cell;
                                return (
                                    <TableCellComponent
                                        key={`value-${rowIndex}-${colIndex}-${data.pivotConfig.metricsAsRows}`}
                                        className={stickyCellProps.className}
                                        style={stickyCellProps.style}
                                        isMinimal={isMinimal}
                                        withAlignRight={isNumericItem(item)}
                                        w={cellWidth}
                                        miw={cellWidth}
                                        maw={cellWidth}
                                        withColor={conditionalFormatting?.color}
                                        withBoldFont={meta?.type === 'label'}
                                        withBackground={
                                            conditionalFormatting?.backgroundColor
                                        }
```

`Table.Cell` and `Table.CellHead` accept `className` and `style` via the underlying Mantine `BoxProps` — confirmed in `LightTable/index.tsx:217` (`className={cx(classes.root, rest.className)}`). When `stickyCellProps` is empty (the column isn't frozen) `className` and `style` are both `undefined`, which is harmless.

- [ ] **Step 4: Typecheck**

```bash
pnpm -F frontend typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/index.tsx packages/frontend/src/components/common/PivotTable/PivotTable.module.css
git commit -m "feat(frontend): apply sticky positioning to frozen pivot body cells"
```

---

### Task 5: Apply sticky styles to header rows

**Files:**
- Modify: `packages/frontend/src/components/common/PivotTable/index.tsx` (title-field cells around line 753, header-value cells around line 845)

The header row rendering (currently lines 692-906) iterates `data.headerValues` and renders, per row: a row-number / placeholder cell, then `data.titleFields[headerRowIndex]` cells (title labels), then `headerValues.map(...)` cells (pivot dim values + label cells), then row-total cells. The leftmost columns (title fields and the first `numLabelCols` header values) correspond directly to the leftmost entries in `pivotColumnInfo` and may be frozen.

For each header cell whose corresponding pivot column is in `frozenLayout`, apply sticky positioning via `getStickyHeaderProps`.

- [ ] **Step 1: Apply sticky props to title-field header cells**

In `index.tsx`, find the title-field cell render. Currently lines 745-803 read approximately:

```tsx
                                return isEmpty ? (
                                    <Table.Cell
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        isMinimal={isMinimal}
                                        withMinimalWidth={
                                            !hasCustomWidths && !titleWidth
                                        }
                                    />
                                ) : (
                                    <Table.CellHead
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        withAlignRight={isHeaderTitle}
                                        isMinimal={isMinimal}
                                        withMinimalWidth={
                                            !hasCustomWidths &&
                                            (!isLastHeaderRow || !titleWidth)
                                        }
                                        withBoldFont
                                        withTooltip={
                                            isField(field)
                                                ? field.description
                                                : undefined
                                        }
                                        w={
```

Just before the `return isEmpty ? (` line, compute `titleStickyProps`. Insert:

```tsx
                                const titlePivotCol =
                                    data.retrofitData.pivotColumnInfo[
                                        titleFieldIndex
                                    ];
                                const titleStickyProps = titlePivotCol
                                    ? getStickyHeaderProps(
                                          frozenLayout.get(titlePivotCol.fieldId),
                                      )
                                    : {};
```

Then add `className={titleStickyProps.className}` and `style={titleStickyProps.style}` as the FIRST two props on BOTH the `<Table.Cell>` (empty title) and `<Table.CellHead>` (titled). Each render becomes:

```tsx
                                return isEmpty ? (
                                    <Table.Cell
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        className={titleStickyProps.className}
                                        style={titleStickyProps.style}
                                        isMinimal={isMinimal}
                                        withMinimalWidth={
                                            !hasCustomWidths && !titleWidth
                                        }
                                    />
                                ) : (
                                    <Table.CellHead
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        className={titleStickyProps.className}
                                        style={titleStickyProps.style}
                                        withAlignRight={isHeaderTitle}
                                        ...
                                    >
```

(Don't overwrite the `style` if a future change adds another `style` prop — this is fine for now since neither current branch has `style` already.)

- [ ] **Step 2: Apply sticky props to header-value cells**

Find the header-value render. Currently lines 807-873 begin:

```tsx
                        {/* renders the header values or labels */}
                        {headerValues.map((headerValue, headerColIndex) => {
                            const isLabel = headerValue.type === 'label';
                            const field = getField(headerValue.fieldId);

                            const description =
                                isLabel && isField(field)
                                    ? field.description
                                    : undefined;

                            const isLastHeaderRow =
                                headerRowIndex === data.headerValues.length - 1;

                            // Look up saved width for this data column
                            const colInfo =
                                data.retrofitData.pivotColumnInfo[
                                    numLabelCols + headerColIndex
                                ];
```

Note the existing `colInfo` lookup. Below the `colInfo = ...` line, insert:

```tsx
                            const headerValueStickyProps = colInfo
                                ? getStickyHeaderProps(
                                      frozenLayout.get(colInfo.fieldId),
                                  )
                                : {};
```

Then locate the `<Table.CellHead key={\`header-${headerRowIndex}-${headerColIndex}\`}` render (currently around line 844-872) and add `className={headerValueStickyProps.className}` and `style={headerValueStickyProps.style}` as the first two props:

```tsx
                            return isLabel || headerValue.colSpan > 0 ? (
                                <Table.CellHead
                                    key={`header-${headerRowIndex}-${headerColIndex}`}
                                    className={headerValueStickyProps.className}
                                    style={headerValueStickyProps.style}
                                    isMinimal={isMinimal}
                                    withBoldFont={isLabel}
                                    ...
                                >
```

- [ ] **Step 3: Make the row-number header cell stick when any column is frozen**

Find the row-number / placeholder cell at the start of each header row. Currently lines 703-718:

```tsx
                        {/* shows empty cell if row numbers are visible */}
                        {hideRowNumbers ? null : headerRowIndex <
                          data.headerValues.length - 1 ? (
                            <Table.Cell
                                isMinimal={isMinimal}
                                withMinimalWidth={!hasCustomWidths}
                            />
                        ) : (
                            <Table.CellHead
                                isMinimal={isMinimal}
                                withMinimalWidth={!hasCustomWidths}
                                withBoldFont
                            >
                                #
                            </Table.CellHead>
                        )}
```

Above the `data.titleFields[headerRowIndex].map(...)` block (just inside the `<Table.Row ...>`), the row-number cell is the very first child. To anchor the freeze chain we make this cell sticky at `left: 0` whenever any column is frozen.

First, just before the `{hideRowNumbers ? null :` line, add:

```tsx
                        const rowNumberSticky =
                            frozenLayout.size > 0
                                ? {
                                      className: `${pivotStyles.stickyColumn} ${pivotStyles.stickyHeaderColumn}`,
                                      style: { left: 0 },
                                  }
                                : ({} as { className?: string; style?: React.CSSProperties });
```

Then apply it to BOTH branches:

```tsx
                        {hideRowNumbers ? null : headerRowIndex <
                          data.headerValues.length - 1 ? (
                            <Table.Cell
                                className={rowNumberSticky.className}
                                style={rowNumberSticky.style}
                                isMinimal={isMinimal}
                                withMinimalWidth={!hasCustomWidths}
                            />
                        ) : (
                            <Table.CellHead
                                className={rowNumberSticky.className}
                                style={rowNumberSticky.style}
                                isMinimal={isMinimal}
                                withMinimalWidth={!hasCustomWidths}
                                withBoldFont
                            >
                                #
                            </Table.CellHead>
                        )}
```

- [ ] **Step 4: Body row-number cell — verify it's already pinned**

In `index.tsx`, search for where the row-number column is rendered in the body (it's the column with `id: ROW_NUMBER_COLUMN_ID` defined at line 79-83). The body iterates `row.getVisibleCells()` — this includes the row-number column whose cell function returns `props.row.index + 1`. Because `columnPinning.left: [ROW_NUMBER_COLUMN_ID]` is set in TanStack state at line 350-351 BUT the body render does not consult `getIsPinned()`, the row-number column scrolls horizontally today.

To make the body row-number cell sticky when any column is frozen, modify the body cell render to detect the row-number column and apply `rowNumberSticky` styles. Inside the `row.getVisibleCells().map((cell, colIndex) => {` block at line 929, add at the very top of the callback:

```tsx
                            if (cell.column.id === ROW_NUMBER_COLUMN_ID) {
                                const rowNumberStickyBody =
                                    frozenLayout.size > 0
                                        ? {
                                              className: pivotStyles.stickyColumn,
                                              style: { left: 0 },
                                          }
                                        : {};
                                return (
                                    <Table.Cell
                                        key={`row-number-${rowIndex}`}
                                        className={rowNumberStickyBody.className}
                                        style={rowNumberStickyBody.style}
                                        isMinimal={isMinimal}
                                    >
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext(),
                                        )}
                                    </Table.Cell>
                                );
                            }
```

Place this BEFORE the existing `const meta = cell.column.columnDef.meta;` line. The early return short-circuits the cell processing for the row-number column.

- [ ] **Step 5: Apply sticky props to footer (column totals) cells**

Column totals render in `Table.Footer` starting at line 1220. The footer iterates the leftmost label cells (`columnTotalFields`), then total values. The label cells correspond to the leftmost pivot columns and need sticky styling for alignment with the frozen body cells.

Find the footer block. Currently lines 1230-1255 read approximately:

```tsx
                                {/* shows empty cell if row numbers are visible */}
                                {hideRowNumbers ? null : <Table.Cell />}

                                {/* render the total label */}
                                {data.columnTotalFields?.[totalRowIndex].map(
                                    (totalLabel, totalColIndex) =>
                                        totalLabel ? (
                                            <Table.CellHead
                                                key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                                isMinimal={isMinimal}
                                                withAlignRight
                                                withBoldFont
                                            >
                                                {totalLabel.fieldId
                                                    ? `Total ${getFieldLabel(
                                                          totalLabel.fieldId,
                                                      )}`
                                                    : `Total`}
                                            </Table.CellHead>
                                        ) : (
                                            <Table.Cell
                                                key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                                isMinimal={isMinimal}
                                            />
                                        ),
                                )}
```

Replace the row-number placeholder + the label-cell map with sticky-aware versions. Above the `{hideRowNumbers ? null : <Table.Cell />}` line, add the row-number sticky helper (same shape as header):

```tsx
                                const footerRowNumberSticky =
                                    frozenLayout.size > 0
                                        ? {
                                              className: pivotStyles.stickyColumn,
                                              style: { left: 0 },
                                          }
                                        : ({} as { className?: string; style?: React.CSSProperties });
```

Update the row-number cell:

```tsx
                                {hideRowNumbers ? null : (
                                    <Table.Cell
                                        className={footerRowNumberSticky.className}
                                        style={footerRowNumberSticky.style}
                                    />
                                )}
```

Then for each totalLabel cell, look up the matching pivot column. The label cells correspond to the first `numLabelCols` slots of `pivotColumnInfo`:

```tsx
                                {data.columnTotalFields?.[totalRowIndex].map(
                                    (totalLabel, totalColIndex) => {
                                        const footerPivotCol =
                                            data.retrofitData.pivotColumnInfo[
                                                totalColIndex
                                            ];
                                        const footerStickyProps = footerPivotCol
                                            ? getStickyCellProps(
                                                  frozenLayout.get(
                                                      footerPivotCol.fieldId,
                                                  ),
                                              )
                                            : {};
                                        return totalLabel ? (
                                            <Table.CellHead
                                                key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                                className={footerStickyProps.className}
                                                style={footerStickyProps.style}
                                                isMinimal={isMinimal}
                                                withAlignRight
                                                withBoldFont
                                            >
                                                {totalLabel.fieldId
                                                    ? `Total ${getFieldLabel(
                                                          totalLabel.fieldId,
                                                      )}`
                                                    : `Total`}
                                            </Table.CellHead>
                                        ) : (
                                            <Table.Cell
                                                key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                                className={footerStickyProps.className}
                                                style={footerStickyProps.style}
                                                isMinimal={isMinimal}
                                            />
                                        );
                                    },
                                )}
```

Note the use of `getStickyCellProps` (not `getStickyHeaderProps`) — footer cells need z-index 1, not 2, because they're below the header.

Total VALUE cells (the data totals to the right of the label cells, lines 1257+) do NOT need sticky styles — they're in the data area, not the leftmost frozen region.

- [ ] **Step 6: Typecheck**

```bash
pnpm -F frontend typecheck
```

Expected: no errors.

- [ ] **Step 7: Run the existing PivotTable tests**

```bash
pnpm -F frontend exec vitest run src/components/common/PivotTable
```

Expected: all 8 `getFrozenColumnLayout` tests still pass.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/common/PivotTable/index.tsx
git commit -m "feat(frontend): apply sticky positioning to frozen pivot header and footer cells"
```

---

### Task 6: Show the freeze toggle in `ColumnConfiguration` for pivoted dimensions and metrics

**Files:**
- Modify: `packages/frontend/src/components/VisualizationConfigs/TableConfigPanel/ColumnConfiguration.tsx` (lines 1-220)

Today the freeze toggle is hidden entirely when `pivotDimensions` is set (line 153: `{!pivotDimensions ? (...) : null}`). We replace that gate with finer-grained logic:

- **Hide for pivoted dimensions** (the dim is being used as a column header, so freezing it makes no sense)
- **Hide for metrics when `metricsAsRows === true`** (per the ticket's acceptance criteria)
- **Show otherwise** (non-pivoted dimensions and, when `metricsAsRows === false`, metrics)

- [ ] **Step 1: Read `metricsAsRows` from chartConfig**

At the top of the `ColumnConfiguration` component (around line 75-83), expand the destructure to include `metricsAsRows` from chartConfig:

```tsx
    const {
        updateColumnProperty,
        isColumnVisible,
        isColumnFrozen,
        getField,
        columnProperties,
        metricsAsRows,
    } = visualizationConfig.chartConfig;
```

`metricsAsRows` is exposed on the chart config (see `useTableConfig.ts:423`).

- [ ] **Step 2: Compute whether to show the freeze toggle**

Below the existing computed values at `ColumnConfiguration.tsx:85-88`, add:

```tsx
    const isMetric = field && !isDimension(field);
    const shouldShowFreezeToggle = (() => {
        if (isPivotingDimension) return false;
        if (isMetric && metricsAsRows) return false;
        return true;
    })();
```

- [ ] **Step 3: Replace the existing visibility gate**

Find the existing block at `ColumnConfiguration.tsx:153-188`:

```tsx
            {!pivotDimensions ? (
                <Tooltip ...>
                    ...freeze toggle...
                </Tooltip>
            ) : null}
```

Replace `!pivotDimensions` with `shouldShowFreezeToggle`:

```tsx
            {shouldShowFreezeToggle ? (
                <Tooltip
                    position="top"
                    withinPortal
                    opened={isFreezeTooltipVisible}
                    label={
                        isColumnFrozen(fieldId)
                            ? 'Unfreeze column'
                            : 'Freeze column'
                    }
                >
                    {/* ...rest unchanged... */}
                </Tooltip>
            ) : null}
```

- [ ] **Step 4: Typecheck the panel**

```bash
pnpm -F frontend typecheck
```

Expected: no errors.

- [ ] **Step 5: Lint the changed file**

```bash
pnpm -F frontend lint --fix packages/frontend/src/components/VisualizationConfigs/TableConfigPanel/ColumnConfiguration.tsx
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/VisualizationConfigs/TableConfigPanel/ColumnConfiguration.tsx
git commit -m "feat(frontend): show freeze toggle for pivoted dimensions and metrics

Per PROD-639 acceptance criteria:
- Show freeze toggle for non-pivoted (row) dimensions
- Show for metrics when metricsAsRows = false
- Hide for pivoted dimensions and for metrics when metricsAsRows = true"
```

---

### Task 7: Manual smoke test in the browser

**Files:** None modified — verification only.

The dev server is assumed to be already running per `CLAUDE.md`.

- [ ] **Step 1: Open a pivoted chart in the Explorer**

In the browser, log in as `demo@lightdash.com` / `demo_password!`, open the demo project, and either find an existing pivoted table chart or create one quickly:
1. New chart → Explore → orders
2. Add dimension `Order date month`, dimension `Shipping method`, metric `Total order amount`
3. Switch chart type to Table
4. In the Configure panel, drag `Shipping method` to the Pivot section

- [ ] **Step 2: Verify dimension freezing works**

In the Configure panel → Columns tab, click the lock icon next to `Order date month`. The lock should turn solid.

In the chart panel, scroll horizontally. The `Order date month` column should stay visible on the left while the pivoted columns scroll past it.

If row totals are enabled (config panel → "Show row totals"), they remain on the right edge unaffected. ✅

- [ ] **Step 3: Verify the toggle is hidden for the pivoted dimension**

In Configure → Columns, the row for `Shipping method` (which is the pivoted dimension) should NOT show a lock icon. ✅

- [ ] **Step 4: Verify metrics-as-rows hides the metric freeze toggle**

In Configure → Display, toggle `Metrics as rows` to ON. Re-open Configure → Columns. The metric (`Total order amount`) row should NOT show a lock icon. The dimension rows (`Order date month`, `Shipping method`) should still behave per Steps 2-3. ✅

- [ ] **Step 5: Verify multi-row header alignment**

With a frozen dimension and pivoting active, the multi-row header (pivot dim values stacked above metric labels) should align correctly with its body column when scrolled. No horizontal tearing. ✅

- [ ] **Step 6: Verify column totals (footer) alignment**

Toggle "Show column totals" in Configure → Display. The footer row at the bottom should keep the leftmost label cells aligned with the frozen body cells while horizontally scrolling. ✅

- [ ] **Step 7: Verify dashboard tile rendering**

Add the chart to a dashboard, give the tile a narrow width that forces horizontal scroll, then horizontally scroll inside the tile. The frozen column should stay anchored. The dashboard tile re-uses the same PivotTable component, so this should work without further changes — the test confirms it. ✅

- [ ] **Step 8: Take a screenshot of the working freeze**

Use Chrome DevTools MCP to capture a screenshot showing the frozen column anchored on the left while the pivot columns are mid-scroll. Save it for the PR description.

- [ ] **Step 9: No commit needed for manual verification**

If the smoke test reveals an issue, fix it inline and commit per the standard pattern. If everything works, proceed to the next step.

---

### Task 8: Push the branch and open the PR

**Files:** None modified.

- [ ] **Step 1: Verify branch state**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: clean working tree; commits include the spec doc + `getFrozenColumnLayout` test/impl + PivotTable rendering changes + ColumnConfiguration changes.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/prod-639
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(frontend): freeze columns in pivot tables (PROD-639)" --body "$(cat <<'EOF'
## Summary
- Adds per-fieldId freeze support for pivoted table charts, reusing the existing `ColumnProperties.frozen` storage
- Renders sticky leftmost columns via CSS `position: sticky` with cumulative `left` offsets computed by a new `getFrozenColumnLayout` helper
- Lifts the existing pivot-mode hide on the freeze toggle in `ColumnConfiguration`, gated on dimension/metric type per PROD-639 acceptance criteria

## Spec
[docs/superpowers/specs/2026-05-11-prod-639-pivot-frozen-columns-design.md](../docs/superpowers/specs/2026-05-11-prod-639-pivot-frozen-columns-design.md)

## Test plan
- [ ] Unit tests pass (`pnpm -F frontend exec vitest run src/components/common/PivotTable/getFrozenColumnLayout.test.ts`)
- [ ] Typecheck passes (`pnpm -F frontend typecheck`)
- [ ] Lint passes (`pnpm -F frontend lint`)
- [ ] Manual: pivoted chart, freeze a row dimension, scroll horizontally — column stays anchored
- [ ] Manual: pivoted chart with `metricsAsRows = true` — no freeze toggle on metric rows
- [ ] Manual: pivoted chart with row totals enabled — totals remain on the right edge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Capture the PR URL for handoff**

Note the PR URL in your response so the user can review it.

---

## Caveat to flag in the PR description

Pivoted **metric** columns are not naturally leftmost — they live across the data area, often after several index dimensions. Setting `frozen = true` on a metric still applies sticky positioning to all of its pivot slices (consistent with how width works), but the visual result is best when the user only freezes leftmost columns (typically row dimensions). Freezing a metric in a heavily pivoted table works mechanically but may look odd because non-frozen columns sit between the index dims and the frozen metric slices. This is documented behaviour, not a bug — the spec's acceptance criteria treat metric freezing as supported when `metricsAsRows === false`, and we honour that.
