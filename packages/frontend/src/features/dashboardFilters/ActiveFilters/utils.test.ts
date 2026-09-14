import { FilterOperator } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getTruncatedValuesDisplay } from './utils';

const EMPTY = {
    displayedValues: [],
    additionalValues: [],
    hasMore: false,
};

describe('getTruncatedValuesDisplay', () => {
    it('should show no values for null operators that carry stale values', () => {
        expect(
            getTruncatedValuesDisplay(['42'], false, FilterOperator.NULL),
        ).toEqual(EMPTY);
        expect(
            getTruncatedValuesDisplay(
                ['completed', 'shipped'],
                false,
                FilterOperator.NOT_NULL,
            ),
        ).toEqual(EMPTY);
    });

    it('should show no values for date filters', () => {
        expect(
            getTruncatedValuesDisplay(
                ['2024-01-01'],
                true,
                FilterOperator.EQUALS,
            ),
        ).toEqual(EMPTY);
    });

    it('should show no values when the rule has none', () => {
        expect(
            getTruncatedValuesDisplay([], false, FilterOperator.EQUALS),
        ).toEqual(EMPTY);
        expect(
            getTruncatedValuesDisplay(undefined, false, FilterOperator.EQUALS),
        ).toEqual(EMPTY);
    });

    it('should show up to two values without a "+N" badge', () => {
        expect(
            getTruncatedValuesDisplay(['1', '2'], false, FilterOperator.EQUALS),
        ).toEqual({
            displayedValues: ['1', '2'],
            additionalValues: [],
            hasMore: false,
        });
    });

    it('should move values beyond the first two into additionalValues', () => {
        expect(
            getTruncatedValuesDisplay(
                ['1', '2', '3', '4'],
                false,
                FilterOperator.EQUALS,
            ),
        ).toEqual({
            displayedValues: ['1', '2'],
            additionalValues: ['3', '4'],
            hasMore: true,
        });
    });

    it('should make leading and trailing whitespace visible', () => {
        expect(
            getTruncatedValuesDisplay([' a '], false, FilterOperator.EQUALS)
                .displayedValues,
        ).toEqual(['␣a␣']);
    });
});
