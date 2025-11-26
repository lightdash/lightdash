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

    // Date strings in YYYY-MM-DD format are already properly formatted
    // They don't need conversion as they represent calendar dates without timezone
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    return `${value}`;
};
