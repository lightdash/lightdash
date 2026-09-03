import {
    MERGE_ROW_PRESENT_COLUMN,
    MERGE_TRUNCATED_COLUMN,
    ParameterError,
    type WarehouseResults,
} from '@lightdash/common';

const isTrue = (value: unknown) =>
    value === true || value === 1 || value === 'true';

/**
 * Strips the row-cap guard the warehouse merge statement carries and refuses
 * when it tripped. Only the warehouse path emits the guard: its sources
 * compile without a limit, so counting past the cap is possible there. The
 * compose path runs its legs at the cap and refuses on their own row counts
 * instead (getMergeRowCapError), so this is a no-op for it.
 */
export const consumeMergeResultMetadata = (
    rows: WarehouseResults['rows'],
    fields: WarehouseResults['fields'],
): {
    rows: WarehouseResults['rows'];
    fields: WarehouseResults['fields'];
    removedRows: number;
} => {
    if (
        !(MERGE_TRUNCATED_COLUMN in fields) &&
        !rows.some((row) => MERGE_TRUNCATED_COLUMN in row)
    ) {
        return { rows, fields, removedRows: 0 };
    }

    if (rows.some((row) => isTrue(row[MERGE_TRUNCATED_COLUMN]))) {
        throw new ParameterError(
            'A merge source exceeded the query row limit. Narrow the source queries before merging them.',
        );
    }

    const dataRows = rows
        .filter((row) => isTrue(row[MERGE_ROW_PRESENT_COLUMN]))
        .map(
            ({
                [MERGE_ROW_PRESENT_COLUMN]: _,
                [MERGE_TRUNCATED_COLUMN]: __,
                ...row
            }) => row,
        );
    const {
        [MERGE_ROW_PRESENT_COLUMN]: _,
        [MERGE_TRUNCATED_COLUMN]: __,
        ...dataFields
    } = fields;

    return {
        rows: dataRows,
        fields: dataFields,
        removedRows: rows.length - dataRows.length,
    };
};
