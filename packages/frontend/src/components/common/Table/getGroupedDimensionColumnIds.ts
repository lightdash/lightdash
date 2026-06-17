import { isCustomDimension, isDimension } from '@lightdash/common';
import { type TableColumn, type TableHeader } from './types';

/**
 * Dimension column ids in display order, minus the leaf (last) dimension — the
 * columns whose repeated values get grouped/merged. The leaf dimension stays
 * per-row (grouping on it would produce one group per row).
 *
 * Shared between the subtotals grouping setup (TableHeader) and the rowSpan
 * row-grouping body so the two stay in sync.
 */
export const getGroupedDimensionColumnIds = (
    columns: Array<TableColumn | TableHeader>,
    columnOrder: string[],
): string[] => {
    const dimensionColumnIds = new Set(
        columns
            .filter((col) => {
                const item = col.meta?.item;
                return !!item && (isDimension(item) || isCustomDimension(item));
            })
            .map((col) => col.id)
            .filter((id): id is string => !!id),
    );

    return columnOrder
        .filter((columnId) => dimensionColumnIds.has(columnId))
        .slice(0, -1);
};
