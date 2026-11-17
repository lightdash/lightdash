import { type ResultRow } from '@lightdash/common';

// One formatted value per line. Null cells become empty lines so the copied
// list stays row-aligned when pasted into a spreadsheet.
export const getColumnValuesText = (
    rows: ResultRow[],
    columnId: string,
): string =>
    rows
        .map((row) => {
            const value = row[columnId]?.value;
            if (value === undefined || value.raw === null) return '';
            return value.formatted;
        })
        .join('\n');
