import { type ResultRow } from '@lightdash/common';
import { type Row } from '@tanstack/react-table';

export const countSubRows = (rowNode: Row<ResultRow>): number => {
    if (rowNode.subRows?.length) {
        return rowNode.subRows.reduce((acc: number, nextRowNode) => {
            return acc + countSubRows(nextRowNode);
        }, 0);
    } else {
        return 1;
    }
};
