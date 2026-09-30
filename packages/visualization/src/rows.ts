import type { RowLimit } from '@lightdash/common';

/**
 * Applies a table's row limit to the rows already loaded: keeps (`show`) or
 * drops (`hide`) the first or last `count` rows. No limit returns the rows
 * as they are; a negative count counts as zero.
 */
export function sliceRows<T>(
    allRows: T[],
    rowLimit: RowLimit | undefined,
): T[] {
    if (!rowLimit) return allRows;
    const count = Math.max(0, rowLimit.count);
    if (rowLimit.mode === 'show') {
        if (rowLimit.direction === 'first') return allRows.slice(0, count);
        return allRows.slice(Math.max(0, allRows.length - count));
    }

    // hide mode: remove first/last N rows
    if (rowLimit.direction === 'first') return allRows.slice(count);
    return allRows.slice(0, Math.max(0, allRows.length - count));
}

/**
 * The row count to display once a row limit applies, from the total the
 * server reported rather than the rows loaded so far. `show` caps the total
 * at `count`; `hide` subtracts `count`, never going below zero.
 */
export function computeLimitedRowCount(
    serverTotal: number,
    rowLimit: RowLimit | undefined,
): number {
    if (!rowLimit) return serverTotal;
    const count = Math.min(Math.max(0, rowLimit.count), serverTotal);
    if (rowLimit.mode === 'show') return count;
    return serverTotal - count;
}
