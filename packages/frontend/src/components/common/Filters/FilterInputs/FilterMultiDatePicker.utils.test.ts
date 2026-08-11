import { TimeFrames } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getCoarseDateTimeFrame,
    getStoredValueTimeFrame,
    startOfTimeFrame,
} from './FilterMultiDatePicker.utils';

describe('getCoarseDateTimeFrame', () => {
    it('maps calendar intervals to their grain', () => {
        expect(getCoarseDateTimeFrame(TimeFrames.WEEK)).toBe(TimeFrames.WEEK);
        expect(getCoarseDateTimeFrame(TimeFrames.MONTH)).toBe(TimeFrames.MONTH);
        expect(getCoarseDateTimeFrame(TimeFrames.QUARTER)).toBe(
            TimeFrames.QUARTER,
        );
        expect(getCoarseDateTimeFrame(TimeFrames.YEAR)).toBe(TimeFrames.YEAR);
    });

    it('accepts lowercase intervals', () => {
        expect(getCoarseDateTimeFrame('month' as unknown as TimeFrames)).toBe(
            TimeFrames.MONTH,
        );
    });

    it('returns null for intervals without a calendar picker', () => {
        expect(getCoarseDateTimeFrame(TimeFrames.DAY)).toBeNull();
        expect(getCoarseDateTimeFrame(TimeFrames.HOUR)).toBeNull();
        expect(getCoarseDateTimeFrame(TimeFrames.RAW)).toBeNull();
    });
});

describe('getStoredValueTimeFrame', () => {
    it('stores quarters as the first day of the quarter', () => {
        expect(getStoredValueTimeFrame(TimeFrames.QUARTER)).toBe(
            TimeFrames.DAY,
        );
    });

    it('stores every other grain in its own format', () => {
        expect(getStoredValueTimeFrame(TimeFrames.WEEK)).toBe(TimeFrames.WEEK);
        expect(getStoredValueTimeFrame(TimeFrames.MONTH)).toBe(
            TimeFrames.MONTH,
        );
        expect(getStoredValueTimeFrame(TimeFrames.YEAR)).toBe(TimeFrames.YEAR);
    });
});

describe('startOfTimeFrame', () => {
    const date = new Date(2024, 10, 7, 13, 45);

    it('snaps to the start of the period', () => {
        expect(startOfTimeFrame(date, TimeFrames.DAY, 1)).toEqual(
            new Date(2024, 10, 7),
        );
        // Monday of the week containing Thursday 7 November
        expect(startOfTimeFrame(date, TimeFrames.WEEK, 1)).toEqual(
            new Date(2024, 10, 4),
        );
        expect(startOfTimeFrame(date, TimeFrames.MONTH, 1)).toEqual(
            new Date(2024, 10, 1),
        );
        expect(startOfTimeFrame(date, TimeFrames.QUARTER, 1)).toEqual(
            new Date(2024, 9, 1),
        );
        expect(startOfTimeFrame(date, TimeFrames.YEAR, 1)).toEqual(
            new Date(2024, 0, 1),
        );
    });

    it('follows the first day of the week for weeks', () => {
        expect(startOfTimeFrame(date, TimeFrames.WEEK, 0)).toEqual(
            new Date(2024, 10, 3),
        );
    });
});
