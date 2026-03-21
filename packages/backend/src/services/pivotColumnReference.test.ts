import { OTHER_GROUP_SENTINEL_VALUE } from '@lightdash/common';
import {
    getPivotColumnValueKey,
    getPivotColumnValueSuffix,
    NULL_PIVOT_COLUMN_VALUE_KEY,
} from './pivotColumnReference';

describe('pivotColumnReference', () => {
    describe('getPivotColumnValueKey', () => {
        it('maps null to __NULL__', () => {
            expect(getPivotColumnValueKey(null)).toBe(
                NULL_PIVOT_COLUMN_VALUE_KEY,
            );
        });

        it('maps string values through', () => {
            expect(getPivotColumnValueKey('hello')).toBe('hello');
        });

        it('maps numbers to string', () => {
            expect(getPivotColumnValueKey(42)).toBe('42');
        });

        it('maps sentinel value through', () => {
            expect(getPivotColumnValueKey(OTHER_GROUP_SENTINEL_VALUE)).toBe(
                OTHER_GROUP_SENTINEL_VALUE,
            );
        });

        it('maps boolean values to string', () => {
            expect(getPivotColumnValueKey(true)).toBe('true');
            expect(getPivotColumnValueKey(false)).toBe('false');
        });

        it('maps undefined to string', () => {
            expect(getPivotColumnValueKey(undefined)).toBe('undefined');
        });
    });

    describe('getPivotColumnValueSuffix', () => {
        it('joins multiple values with underscore', () => {
            expect(getPivotColumnValueSuffix(['a', 'b', 'c'])).toBe('a_b_c');
        });

        it('handles null values in array', () => {
            expect(getPivotColumnValueSuffix([null, 'a', 'b'])).toBe(
                '__NULL___a_b',
            );
        });

        it('returns empty string for empty array', () => {
            expect(getPivotColumnValueSuffix([])).toBe('');
        });

        it('handles mixed types', () => {
            expect(getPivotColumnValueSuffix([null, 42, 'text'])).toBe(
                '__NULL___42_text',
            );
        });
    });
});
