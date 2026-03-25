import type { RowLimit } from '@lightdash/common';

export function sliceRows<T>(
    allRows: T[],
    isEnabled: boolean,
    rowLimit: RowLimit | undefined,
): T[] {
    if (!isEnabled || !rowLimit) return allRows;
    const count = Math.max(0, rowLimit.count);
    if (rowLimit.direction === 'first') return allRows.slice(0, count);
    return allRows.slice(Math.max(0, allRows.length - count));
}

export function computeLimitedRowCount(
    serverTotal: number,
    isEnabled: boolean,
    rowLimit: RowLimit | undefined,
): number {
    if (!isEnabled || !rowLimit) return serverTotal;
    return Math.min(Math.max(0, rowLimit.count), serverTotal);
}
