import { FieldType, type PivotData } from '@lightdash/common';
import { isCaptureRender } from '../../../hooks/resultsFirstPage';

export type RowSpanMerge = {
    isBlockStart: boolean;
    rowSpan: number;
    blockStartRow: number;
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
        indexValueTypes
            .filter((valueType) => valueType.type === FieldType.DIMENSION)
            .map((valueType) => valueType.fieldId),
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
                spans[row] = { isBlockStart: true, rowSpan: 1, blockStartRow };
            } else {
                spans[blockStartRow].rowSpan += 1;
                spans[row] = { isBlockStart: false, rowSpan: 0, blockStartRow };
            }
        }

        result.set(columnId, spans);
    });

    return result;
};

// Rows the table virtualizers render above and below the viewport.
export const ROW_OVERSCAN = 25;

/**
 * The rendered rows clip a merged cell only when the table has more rows than
 * the virtualizer renders around the viewport. In a smaller table every row is
 * always rendered, so a merged value can show in full, as before row
 * virtualization.
 *
 * An image export or a scheduled delivery takes its screenshot without a
 * scroll, so the rendered rows do not move and a merged value can show in
 * full there too. The image then has the whole value, as before.
 */
export const canRenderedRowsClipMergedCells = (rowCount: number) =>
    rowCount > ROW_OVERSCAN && !isCaptureRender();

// Table text is 13px at the theme's 1.4286 line height, 18.57px a line. Rounded
// up, so the line count below never shows a line too many.
export const TABLE_LINE_HEIGHT_PX = 18.6;

/**
 * The number of lines a merged value can show without making the rows it
 * covers taller than `rowHeight`. The rendered rows clip a merged cell, so the
 * rows it covers change as the table scrolls. A value taller than those rows
 * changes the table height, and the browser then moves the scroll position.
 *
 * @param rowSpan    rows the cell covers in the rendered rows
 * @param rowHeight  the smallest height of a row
 * @param paddingY   the vertical padding of a cell that covers more than one row
 */
export const getMergedValueLineClamp = (
    rowSpan: number,
    rowHeight: number,
    paddingY: number,
): number => {
    if (rowSpan <= 1) return 1;
    return Math.max(
        1,
        Math.floor((rowSpan * rowHeight - paddingY) / TABLE_LINE_HEIGHT_PX),
    );
};

/**
 * Clips a row's merge to the rendered (virtualized) rows `firstRow..lastRow`.
 * A block that starts above `firstRow` gets a new start cell on `firstRow`,
 * and no span reaches past `lastRow`, so every rendered row is covered by
 * exactly one cell per merged column.
 */
export const getWindowedRowSpanMerge = (
    spans: RowSpanMerge[] | undefined,
    rowIndex: number,
    firstRow: number,
    lastRow: number,
): RowSpanMerge | undefined => {
    const merge = spans?.[rowIndex];
    if (!spans || !merge) return merge;
    if (!merge.isBlockStart && rowIndex !== firstRow) return merge;

    const { blockStartRow } = merge;
    const blockEndRow = blockStartRow + spans[blockStartRow].rowSpan - 1;
    if (merge.isBlockStart && blockEndRow <= lastRow) return merge;

    return {
        isBlockStart: true,
        rowSpan: Math.max(1, Math.min(blockEndRow, lastRow) - rowIndex + 1),
        blockStartRow,
    };
};
