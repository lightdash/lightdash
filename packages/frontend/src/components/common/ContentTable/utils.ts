import { type Column, type RowData } from '@tanstack/react-table';
import { type ContentTableColumnDef } from './types';

export const getLightdashColumnDef = <TData extends RowData>(
    column: Column<TData, unknown>,
) =>
    (
        column.columnDef.meta as
            | { lightdashColumnDef?: ContentTableColumnDef<TData> }
            | undefined
    )?.lightdashColumnDef;

// The runtime `columnDef.header` is always a render callback (see
// `toTanStackColumn`), so string labels must come from the preserved def.
export const getColumnHeaderLabel = <TData extends RowData>(
    column: Column<TData, unknown>,
): string => {
    const header = getLightdashColumnDef(column)?.header;
    return typeof header === 'string' ? header : column.id;
};
