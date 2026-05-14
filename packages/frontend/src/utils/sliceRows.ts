import type { RowLimit } from '@lightdash/common';

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

export function computeLimitedRowCount(
    serverTotal: number,
    rowLimit: RowLimit | undefined,
): number {
    if (!rowLimit) return serverTotal;
    const count = Math.min(Math.max(0, rowLimit.count), serverTotal);
    if (rowLimit.mode === 'show') return count;
    return serverTotal - count;
}
