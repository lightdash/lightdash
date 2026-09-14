// Pins local-time semantics under a non-UTC timezone: on UTC CI the local/UTC
// distinction vanishes, so a regression to UTC-based parsing would pass every
// symmetric round-trip in mantineDateAdapter.test.ts.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'America/New_York';

import { afterAll, describe, expect, it } from 'vitest';
import {
    formatMantineDate,
    formatMantineDateTime,
    parseMantineDate,
    parseMantineDateTime,
} from './mantineDateAdapter';

afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
});

describe('mantineDateAdapter in a non-UTC timezone (America/New_York)', () => {
    it('applies the pinned timezone (sanity check)', () => {
        // EDT on this date is UTC-4; if this fails, the TZ pin is not working
        expect(new Date(2024, 5, 15).getTimezoneOffset()).toBe(240);
    });

    it('parses date strings as local midnight, not UTC midnight', () => {
        const parsed = parseMantineDate('2024-06-15');
        expect(parsed).toEqual(new Date(2024, 5, 15));
        expect(parsed?.getTime()).not.toBe(Date.parse('2024-06-15'));
    });

    it('formats from local components, not toISOString', () => {
        // UTC midnight is the previous local day in New York
        expect(formatMantineDate(new Date('2024-06-15T00:00:00Z'))).toBe(
            '2024-06-14',
        );
        expect(formatMantineDate(new Date(2024, 5, 15))).toBe('2024-06-15');
    });

    it('round-trips datetimes through local wall-clock components', () => {
        const value = new Date(2024, 5, 15, 23, 59, 58);
        const formatted = formatMantineDateTime(value);
        expect(formatted).toBe('2024-06-15 23:59:58');
        expect(parseMantineDateTime(formatted)).toEqual(value);
    });

    it('round-trips dates across DST transitions', () => {
        const springForward = new Date(2025, 2, 9);
        expect(parseMantineDate('2025-03-09')).toEqual(springForward);
        expect(formatMantineDate(springForward)).toBe('2025-03-09');

        const fallBack = new Date(2025, 10, 2);
        expect(parseMantineDate('2025-11-02')).toEqual(fallBack);
        expect(formatMantineDate(fallBack)).toBe('2025-11-02');
    });
});
