import { describe, expect, test } from 'vitest';
import { formatCacheEventTime } from './formatCacheEventTime';

const NOW = new Date('2026-11-05T12:00:00Z');

describe('formatCacheEventTime', () => {
    test.each([
        ['2026-11-05T18:00:00Z', 'Today at 18:00 UTC'],
        ['2026-11-06T06:00:00Z', 'Tomorrow at 06:00 UTC'],
        ['2026-11-04T06:00:00Z', 'Yesterday at 06:00 UTC'],
        ['2026-11-09T06:00:00Z', 'Mon 9 Nov at 06:00 UTC'],
        ['2025-03-02T06:00:00Z', 'Sun 2 Mar 2025 at 06:00 UTC'],
    ])('formats %s', (value, expected) => {
        expect(formatCacheEventTime(new Date(value), 'UTC', NOW)).toBe(
            expected,
        );
    });

    test('uses the day in the given time zone', () => {
        expect(
            formatCacheEventTime(
                new Date('2026-11-06T02:00:00Z'),
                'America/New_York',
                NOW,
            ),
        ).toBe('Today at 21:00 GMT-5');
    });
});
