import { describe, expect, it } from 'vitest';
import {
    computeDisplayValues,
    computeHiddenCount,
    INLINE_RENDER_LIMIT,
    isValueSelected,
    mergeWithHiddenValues,
    MORE_VALUES_TOKEN,
    wasTokenRemoved,
} from './FilterStringAutoComplete.utils';

describe('FilterStringAutoComplete utils', () => {
    describe('computeHiddenCount', () => {
        it('returns 0 when values are below limit', () => {
            const values = Array.from({ length: 30 }, (_, i) => `value-${i}`);
            expect(computeHiddenCount(values)).toBe(0);
        });

        it('returns 0 when values are exactly at limit', () => {
            const values = Array.from(
                { length: INLINE_RENDER_LIMIT },
                (_, i) => `value-${i}`,
            );
            expect(computeHiddenCount(values)).toBe(0);
        });

        it('returns correct count when values exceed limit', () => {
            const values = Array.from({ length: 100 }, (_, i) => `value-${i}`);
            expect(computeHiddenCount(values)).toBe(50);
        });

        it('handles empty array', () => {
            expect(computeHiddenCount([])).toBe(0);
        });
    });

    describe('computeDisplayValues', () => {
        it('returns all values when below limit', () => {
            const values = ['a', 'b', 'c'];
            expect(computeDisplayValues(values)).toEqual(['a', 'b', 'c']);
        });

        it('returns all values for singleValue mode regardless of count', () => {
            const values = Array.from({ length: 100 }, (_, i) => `value-${i}`);
            expect(computeDisplayValues(values, true)).toEqual(values);
        });

        it('truncates and adds token when exceeding limit', () => {
            const values = Array.from({ length: 100 }, (_, i) => `value-${i}`);
            const result = computeDisplayValues(values);

            expect(result).toHaveLength(INLINE_RENDER_LIMIT + 1);
            expect(result[INLINE_RENDER_LIMIT]).toBe(MORE_VALUES_TOKEN);
            expect(result.slice(0, INLINE_RENDER_LIMIT)).toEqual(
                values.slice(0, INLINE_RENDER_LIMIT),
            );
        });

        it('returns all values when exactly at limit', () => {
            const values = Array.from(
                { length: INLINE_RENDER_LIMIT },
                (_, i) => `value-${i}`,
            );
            expect(computeDisplayValues(values)).toEqual(values);
        });
    });

    describe('mergeWithHiddenValues', () => {
        const createValues = (count: number) =>
            Array.from({ length: count }, (_, i) => `value-${i}`);

        it('returns cleaned values when not truncated', () => {
            const allValues = ['a', 'b', 'c'];
            const displayValues = ['a', 'b', 'c'];
            const updatedValues = ['a', 'c', 'd']; // removed b, added d

            expect(
                mergeWithHiddenValues(updatedValues, displayValues, allValues),
            ).toEqual(['a', 'c', 'd']);
        });

        it('preserves hidden values when adding a new value', () => {
            // 100 values total, display shows first 50 + token
            const allValues = createValues(100);
            const displayValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];
            // User adds 'new-value' to the displayed values
            const updatedValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
                'new-value',
            ];

            const result = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                allValues,
            );

            // Should have: first 50 + 'new-value' + hidden 50 = 101 values
            expect(result).toHaveLength(101);
            // First 50 should be preserved
            expect(result.slice(0, INLINE_RENDER_LIMIT)).toEqual(
                allValues.slice(0, INLINE_RENDER_LIMIT),
            );
            // new-value should be at position 50
            expect(result[INLINE_RENDER_LIMIT]).toBe('new-value');
            // Hidden values (50-99) should be preserved at the end
            expect(result.slice(INLINE_RENDER_LIMIT + 1)).toEqual(
                allValues.slice(INLINE_RENDER_LIMIT),
            );
        });

        it('preserves hidden values when removing a displayed value', () => {
            const allValues = createValues(100);
            const displayValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];
            // User removes value-0 from displayed values
            const updatedValues = [
                ...allValues.slice(1, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];

            const result = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                allValues,
            );

            // Should have: 49 displayed + 50 hidden = 99 values
            expect(result).toHaveLength(99);
            // value-0 should be gone
            expect(result).not.toContain('value-0');
            // Hidden values should be preserved
            expect(result.slice(INLINE_RENDER_LIMIT - 1)).toEqual(
                allValues.slice(INLINE_RENDER_LIMIT),
            );
        });

        it('filters out the MORE_VALUES_TOKEN from result', () => {
            const allValues = createValues(100);
            const displayValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];
            const updatedValues = [...displayValues];

            const result = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                allValues,
            );

            expect(result).not.toContain(MORE_VALUES_TOKEN);
        });

        it('handles removing multiple displayed values', () => {
            const allValues = createValues(100);
            const displayValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];
            // Remove first 5 values
            const updatedValues = [
                ...allValues.slice(5, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];

            const result = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                allValues,
            );

            // Should have: 45 displayed + 50 hidden = 95 values
            expect(result).toHaveLength(95);
            // First 5 should be gone
            expect(result).not.toContain('value-0');
            expect(result).not.toContain('value-4');
            // value-5 should be first
            expect(result[0]).toBe('value-5');
        });

        it('handles edge case with exactly INLINE_RENDER_LIMIT + 1 values', () => {
            const allValues = createValues(INLINE_RENDER_LIMIT + 1);
            const displayValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
            ];
            const updatedValues = [
                ...allValues.slice(0, INLINE_RENDER_LIMIT),
                MORE_VALUES_TOKEN,
                'new-value',
            ];

            const result = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                allValues,
            );

            // First 50 + new-value + 1 hidden = 52 values
            expect(result).toHaveLength(INLINE_RENDER_LIMIT + 2);
            expect(result).toContain('new-value');
            expect(result).toContain(`value-${INLINE_RENDER_LIMIT}`);
        });
    });

    describe('isValueSelected', () => {
        it('returns true for values in the array', () => {
            const values = ['a', 'b', 'c'];
            expect(isValueSelected('b', values)).toBe(true);
        });

        it('returns false for values not in the array', () => {
            const values = ['a', 'b', 'c'];
            expect(isValueSelected('d', values)).toBe(false);
        });

        it('returns false for MORE_VALUES_TOKEN', () => {
            const values = [MORE_VALUES_TOKEN, 'a', 'b'];
            expect(isValueSelected(MORE_VALUES_TOKEN, values)).toBe(false);
        });

        it('returns true for hidden values (beyond display limit)', () => {
            const values = Array.from({ length: 100 }, (_, i) => `value-${i}`);
            // value-75 is in the hidden portion
            expect(isValueSelected('value-75', values)).toBe(true);
        });
    });

    describe('wasTokenRemoved', () => {
        it('returns true when token was removed and there are hidden values', () => {
            const displayValues = ['a', 'b', MORE_VALUES_TOKEN];
            const updatedValues = ['a', 'b'];
            expect(wasTokenRemoved(displayValues, updatedValues, 10)).toBe(
                true,
            );
        });

        it('returns false when token is still present', () => {
            const displayValues = ['a', 'b', MORE_VALUES_TOKEN];
            const updatedValues = ['a', 'b', MORE_VALUES_TOKEN, 'c'];
            expect(wasTokenRemoved(displayValues, updatedValues, 10)).toBe(
                false,
            );
        });

        it('returns false when there were no hidden values', () => {
            const displayValues = ['a', 'b', MORE_VALUES_TOKEN];
            const updatedValues = ['a', 'b'];
            expect(wasTokenRemoved(displayValues, updatedValues, 0)).toBe(
                false,
            );
        });

        it('returns false when token was never present', () => {
            const displayValues = ['a', 'b'];
            const updatedValues = ['a'];
            expect(wasTokenRemoved(displayValues, updatedValues, 10)).toBe(
                false,
            );
        });
    });
});
