import { describe, expect, it } from 'vitest';

type RowLimit = {
    direction: 'first' | 'last';
    count: number;
};

function sliceRows<T>(
    allRows: T[],
    isShowHideRowsEnabled: boolean,
    rowLimit: RowLimit | undefined,
): T[] {
    if (!isShowHideRowsEnabled || !rowLimit) return allRows;
    const count = Math.max(0, rowLimit.count);
    if (rowLimit.direction === 'first') {
        return allRows.slice(0, count);
    }
    return allRows.slice(Math.max(0, allRows.length - count));
}

function computeTotalRowsCount(
    serverTotal: number,
    isShowHideRowsEnabled: boolean,
    rowLimit: RowLimit | undefined,
): number {
    if (!isShowHideRowsEnabled || !rowLimit) return serverTotal;
    return Math.min(Math.max(0, rowLimit.count), serverTotal);
}

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sliceRows', () => {
    const rows = makeRows(10); // [0,1,2,3,4,5,6,7,8,9]

    describe('first N rows', () => {
        it('returns first 5 rows', () => {
            expect(
                sliceRows(rows, true, { direction: 'first', count: 5 }),
            ).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns first 3 rows', () => {
            expect(
                sliceRows(rows, true, { direction: 'first', count: 3 }),
            ).toEqual([0, 1, 2]);
        });

        it('returns all rows when count exceeds length', () => {
            expect(
                sliceRows(rows, true, { direction: 'first', count: 100 }),
            ).toEqual(rows);
        });

        it('returns empty array when count is 0', () => {
            expect(
                sliceRows(rows, true, { direction: 'first', count: 0 }),
            ).toEqual([]);
        });

        it('clamps negative count to 0', () => {
            expect(
                sliceRows(rows, true, { direction: 'first', count: -5 }),
            ).toEqual([]);
        });
    });

    describe('last N rows', () => {
        it('returns last 5 rows', () => {
            expect(
                sliceRows(rows, true, { direction: 'last', count: 5 }),
            ).toEqual([5, 6, 7, 8, 9]);
        });

        it('returns last 3 rows', () => {
            expect(
                sliceRows(rows, true, { direction: 'last', count: 3 }),
            ).toEqual([7, 8, 9]);
        });

        it('returns all rows when count exceeds length', () => {
            expect(
                sliceRows(rows, true, { direction: 'last', count: 100 }),
            ).toEqual(rows);
        });

        it('returns empty array when count is 0', () => {
            expect(
                sliceRows(rows, true, { direction: 'last', count: 0 }),
            ).toEqual([]);
        });
    });

    describe('when flag is disabled', () => {
        it('returns all rows regardless of rowLimit', () => {
            expect(
                sliceRows(rows, false, { direction: 'first', count: 3 }),
            ).toBe(rows);
        });

        it('returns all rows when rowLimit is undefined', () => {
            expect(sliceRows(rows, false, undefined)).toBe(rows);
        });
    });

    describe('when rowLimit is undefined', () => {
        it('returns all rows even if flag is enabled', () => {
            expect(sliceRows(rows, true, undefined)).toBe(rows);
        });
    });
});

describe('computeTotalRowsCount', () => {
    const serverTotal = 5000;

    it('returns server total when flag is off', () => {
        expect(
            computeTotalRowsCount(serverTotal, false, {
                direction: 'first',
                count: 10,
            }),
        ).toBe(5000);
    });

    it('returns server total when rowLimit is undefined', () => {
        expect(computeTotalRowsCount(serverTotal, true, undefined)).toBe(5000);
    });

    it('returns count when within server total', () => {
        expect(
            computeTotalRowsCount(serverTotal, true, {
                direction: 'first',
                count: 10,
            }),
        ).toBe(10);
    });

    it('clamps to server total when count exceeds it', () => {
        expect(
            computeTotalRowsCount(serverTotal, true, {
                direction: 'first',
                count: 10000,
            }),
        ).toBe(5000);
    });

    it('works the same for last direction', () => {
        expect(
            computeTotalRowsCount(serverTotal, true, {
                direction: 'last',
                count: 10,
            }),
        ).toBe(10);
    });

    it('handles zero count', () => {
        expect(
            computeTotalRowsCount(serverTotal, true, {
                direction: 'first',
                count: 0,
            }),
        ).toBe(0);
    });
});
