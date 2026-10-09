import { describe, expect, it } from 'vitest';
import { resolveSqlErrorPosition } from './sqlErrorPosition';

describe('resolveSqlErrorPosition', () => {
    const sql = 'select customer_id\nfrom jaffle.nope\nlimit 10';

    it('keeps a position that already fits its line', () => {
        expect(
            resolveSqlErrorPosition(sql, { lineNumber: 2, charNumber: 6 }),
        ).toEqual({ line: 2, char: 6 });
        expect(
            resolveSqlErrorPosition(sql, { lineNumber: 1, charNumber: 8 }),
        ).toEqual({ line: 1, char: 8 });
    });

    it('maps a flattened line-1 offset back onto the right line', () => {
        expect(
            resolveSqlErrorPosition(sql, { lineNumber: 1, charNumber: 25 }),
        ).toEqual({ line: 2, char: 6 });
        expect(
            resolveSqlErrorPosition(sql, { lineNumber: 1, charNumber: 37 }),
        ).toEqual({ line: 3, char: 1 });
    });

    it('drops positions that are not numbers', () => {
        expect(
            resolveSqlErrorPosition(sql, {
                lineNumber: Number.NaN,
                charNumber: 3,
            }),
        ).toBeUndefined();
    });
});
