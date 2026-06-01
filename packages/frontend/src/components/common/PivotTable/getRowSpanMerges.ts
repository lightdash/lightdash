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
