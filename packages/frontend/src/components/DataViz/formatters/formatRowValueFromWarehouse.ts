import { type RawResultRow } from '@lightdash/common';

/**
 * Formats a row value (from the warehouse) to be displayed in the UI.
 * @param value - The value to format.
 * @returns The formatted value.
 */
export const formatRowValueFromWarehouse = (value: RawResultRow[string]) => {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (value instanceof Date) return value.toISOString();
    return `${value}`;
};
