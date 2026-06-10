import { describe, expect, it } from 'vitest';
import { normalizePivotValues, pivotValuesEqual } from './pivotSortIdentity';

describe('normalizePivotValues', () => {
    it('preserves strings as-is', () => {
        expect(
            normalizePivotValues([{ reference: 'status', value: 'completed' }]),
        ).toEqual([{ reference: 'status', value: 'completed' }]);
    });

    it('preserves numbers as-is', () => {
        expect(
            normalizePivotValues([{ reference: 'segment_id', value: 42 }]),
        ).toEqual([{ reference: 'segment_id', value: 42 }]);
    });

    it('preserves null as-is', () => {
        expect(
            normalizePivotValues([{ reference: 'channel', value: null }]),
        ).toEqual([{ reference: 'channel', value: null }]);
    });

    it('preserves native booleans (does not stringify)', () => {
        // Regression: BigQuery rejects BOOL = STRING. Booleans must reach the
        // backend as native booleans so the SQL emits TRUE/FALSE, not 'true'/'false'.
        expect(
            normalizePivotValues([
                { reference: 'is_completed', value: false },
                { reference: 'is_active', value: true },
            ]),
        ).toEqual([
            { reference: 'is_completed', value: false },
            { reference: 'is_active', value: true },
        ]);
    });

    it('falls back to String() for non-primitive types (Date, object)', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const [result] = normalizePivotValues([
            { reference: 'order_date', value: date },
        ]);
        expect(typeof result.value).toBe('string');
        expect(result.value).toBe(String(date));
    });
});

describe('pivotValuesEqual', () => {
    it('treats undefined and empty array as equal', () => {
        expect(pivotValuesEqual(undefined, [])).toBe(true);
        expect(pivotValuesEqual([], undefined)).toBe(true);
    });

    it('matches on same reference/value pairs regardless of order', () => {
        expect(
            pivotValuesEqual(
                [
                    { reference: 'a', value: 1 },
                    { reference: 'b', value: 'x' },
                ],
                [
                    { reference: 'b', value: 'x' },
                    { reference: 'a', value: 1 },
                ],
            ),
        ).toBe(true);
    });

    it('returns false when values differ', () => {
        expect(
            pivotValuesEqual(
                [{ reference: 'a', value: 1 }],
                [{ reference: 'a', value: 2 }],
            ),
        ).toBe(false);
    });

    it('returns false when sizes differ', () => {
        expect(
            pivotValuesEqual(
                [{ reference: 'a', value: 1 }],
                [
                    { reference: 'a', value: 1 },
                    { reference: 'b', value: 2 },
                ],
            ),
        ).toBe(false);
    });
});
