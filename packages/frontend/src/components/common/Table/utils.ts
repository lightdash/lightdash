import { type RawResultRow, type ResultRow } from '@lightdash/common';
import { type Cell, type Row } from '@tanstack/react-table';
import { type ResultsTableFeatures } from './features';

// v8 semantics for cell.getIsAggregated(): any non-grouping, non-placeholder
// cell on a row with sub rows. v9 additionally requires a registered
// aggregationFn, but our subtotal values come from the server via
// aggregatedCell, so the v8 predicate is the one our render paths need.
export const getIsAggregatedCell = (
    cell:
        | Cell<ResultsTableFeatures, ResultRow, unknown>
        | Cell<ResultsTableFeatures, RawResultRow, unknown>,
): boolean =>
    !cell.getIsGrouped() &&
    !cell.getIsPlaceholder() &&
    (cell.row.subRows?.length ?? 0) > 0;

export const countSubRows = (
    rowNode: Row<ResultsTableFeatures, ResultRow>,
): number => {
    if (rowNode.subRows?.length) {
        return rowNode.subRows.reduce((acc: number, nextRowNode) => {
            return acc + countSubRows(nextRowNode);
        }, 0);
    } else {
        return 1;
    }
};
