import { describe, expect, it } from 'vitest';
import { computeLimitedRowCount, sliceRows } from '../../utils/sliceRows';

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sliceRows', () => {
    const rows = makeRows(10); // [0,1,2,3,4,5,6,7,8,9]

    describe('show first N rows', () => {
        it('returns first 5 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'first',
                    count: 5,
                }),
            ).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns first 3 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'first',
                    count: 3,
                }),
            ).toEqual([0, 1, 2]);
        });

        it('returns all rows when count exceeds length', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'first',
                    count: 100,
                }),
            ).toEqual(rows);
        });

        it('returns empty array when count is 0', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'first',
                    count: 0,
                }),
            ).toEqual([]);
        });

        it('clamps negative count to 0', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'first',
                    count: -5,
                }),
            ).toEqual([]);
        });
    });

    describe('show last N rows', () => {
        it('returns last 5 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'last',
                    count: 5,
                }),
            ).toEqual([5, 6, 7, 8, 9]);
        });

        it('returns last 3 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'last',
                    count: 3,
                }),
            ).toEqual([7, 8, 9]);
        });

        it('returns all rows when count exceeds length', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'last',
                    count: 100,
                }),
            ).toEqual(rows);
        });

        it('returns empty array when count is 0', () => {
            expect(
                sliceRows(rows, {
                    mode: 'show',
                    direction: 'last',
                    count: 0,
                }),
            ).toEqual([]);
        });
    });

    describe('hide first N rows', () => {
        it('hides first 3 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'first',
                    count: 3,
                }),
            ).toEqual([3, 4, 5, 6, 7, 8, 9]);
        });

        it('hides first 5 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'first',
                    count: 5,
                }),
            ).toEqual([5, 6, 7, 8, 9]);
        });

        it('returns empty array when hiding all rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'first',
                    count: 10,
                }),
            ).toEqual([]);
        });

        it('returns empty array when hiding more than all rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'first',
                    count: 100,
                }),
            ).toEqual([]);
        });

        it('returns all rows when hiding 0', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'first',
                    count: 0,
                }),
            ).toEqual(rows);
        });
    });

    describe('hide last N rows', () => {
        it('hides last 3 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'last',
                    count: 3,
                }),
            ).toEqual([0, 1, 2, 3, 4, 5, 6]);
        });

        it('hides last 5 rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'last',
                    count: 5,
                }),
            ).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns empty array when hiding all rows', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'last',
                    count: 10,
                }),
            ).toEqual([]);
        });

        it('returns all rows when hiding 0', () => {
            expect(
                sliceRows(rows, {
                    mode: 'hide',
                    direction: 'last',
                    count: 0,
                }),
            ).toEqual(rows);
        });
    });

    describe('when rowLimit is undefined', () => {
        it('returns all rows', () => {
            expect(sliceRows(rows, undefined)).toBe(rows);
        });
    });
});

describe('computeLimitedRowCount', () => {
    const serverTotal = 5000;

    it('returns server total when rowLimit is undefined', () => {
        expect(computeLimitedRowCount(serverTotal, undefined)).toBe(5000);
    });

    it('returns count when showing within server total', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'show',
                direction: 'first',
                count: 10,
            }),
        ).toBe(10);
    });

    it('clamps to server total when count exceeds it', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'show',
                direction: 'first',
                count: 10000,
            }),
        ).toBe(5000);
    });

    it('works the same for last direction in show mode', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'show',
                direction: 'last',
                count: 10,
            }),
        ).toBe(10);
    });

    it('returns remaining rows when hiding', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'hide',
                direction: 'first',
                count: 10,
            }),
        ).toBe(4990);
    });

    it('returns 0 when hiding all rows', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'hide',
                direction: 'first',
                count: 5000,
            }),
        ).toBe(0);
    });

    it('handles zero count', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'show',
                direction: 'first',
                count: 0,
            }),
        ).toBe(0);
    });

    it('returns server total when hiding 0 rows', () => {
        expect(
            computeLimitedRowCount(serverTotal, {
                mode: 'hide',
                direction: 'first',
                count: 0,
            }),
        ).toBe(5000);
    });
});
