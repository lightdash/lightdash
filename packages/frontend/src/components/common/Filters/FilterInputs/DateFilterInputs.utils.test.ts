import { TimeFrames } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getInvalidDateFilterValue,
    parseFilterDateValue,
} from './DateFilterInputs.utils';

describe('DateFilterInputs utils', () => {
    describe('getInvalidDateFilterValue', () => {
        it('returns invalid persisted date values', () => {
            expect(getInvalidDateFilterValue(['NaT'])).toBe('NaT');
            expect(getInvalidDateFilterValue(['2026-13-01'])).toBe(
                '2026-13-01',
            );
            expect(getInvalidDateFilterValue(['Actual Vs Approved'])).toBe(
                'Actual Vs Approved',
            );
        });

        it('ignores empty and valid date values', () => {
            expect(getInvalidDateFilterValue(['2026-06-16'])).toBeUndefined();
            expect(getInvalidDateFilterValue([''])).toBeUndefined();
            expect(getInvalidDateFilterValue(undefined)).toBeUndefined();
        });
    });

    describe('parseFilterDateValue', () => {
        it('returns null for invalid values', () => {
            expect(parseFilterDateValue('NaT', TimeFrames.DAY)).toBeNull();
            expect(
                parseFilterDateValue('2026-13-01', TimeFrames.DAY),
            ).toBeNull();
            expect(
                parseFilterDateValue('Actual Vs Approved', TimeFrames.DAY),
            ).toBeNull();
        });

        it('parses valid values for the requested timeframe', () => {
            const day = parseFilterDateValue('2026-06-16', TimeFrames.DAY);
            expect(day?.getFullYear()).toBe(2026);
            expect(day?.getMonth()).toBe(5);
            expect(day?.getDate()).toBe(16);

            const month = parseFilterDateValue('2026-06-16', TimeFrames.MONTH);
            expect(month?.getFullYear()).toBe(2026);
            expect(month?.getMonth()).toBe(5);
            expect(month?.getDate()).toBe(1);
        });
    });
});
