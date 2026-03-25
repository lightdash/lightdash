import { describe, expect, it } from 'vitest';
import { computeLimitedRowCount, sliceRows } from '../../utils/sliceRows';

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

describe('computeLimitedRowCount', () => {
    const serverTotal = 5000;

    it('returns server total when flag is off', () => {
        expect(
            computeLimitedRowCount(serverTotal, false, {
                direction: 'first',
                count: 10,
            }),
        ).toBe(5000);
    });

    it('returns server total when rowLimit is undefined', () => {
        expect(computeLimitedRowCount(serverTotal, true, undefined)).toBe(5000);
    });

    it('returns count when within server total', () => {
        expect(
            computeLimitedRowCount(serverTotal, true, {
                direction: 'first',
                count: 10,
            }),
        ).toBe(10);
    });

    it('clamps to server total when count exceeds it', () => {
        expect(
            computeLimitedRowCount(serverTotal, true, {
                direction: 'first',
                count: 10000,
            }),
        ).toBe(5000);
    });

    it('works the same for last direction', () => {
        expect(
            computeLimitedRowCount(serverTotal, true, {
                direction: 'last',
                count: 10,
            }),
        ).toBe(10);
    });

    it('handles zero count', () => {
        expect(
            computeLimitedRowCount(serverTotal, true, {
                direction: 'first',
                count: 0,
            }),
        ).toBe(0);
    });
});
