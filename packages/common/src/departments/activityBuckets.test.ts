import { describe, expect, it } from 'vitest';
import {
    AT_RISK_ACTIVITY_DAYS,
    getActivityBucket,
    getActivityWindows,
    HEALTHY_ACTIVITY_DAYS,
} from './activityBuckets';

const NOW = new Date('2026-10-08T09:30:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const windows = getActivityWindows(NOW);

describe('getActivityWindows', () => {
    it('reaches back 30 and 90 whole days from one instant', () => {
        expect(HEALTHY_ACTIVITY_DAYS).toBe(30);
        expect(AT_RISK_ACTIVITY_DAYS).toBe(90);
        expect(windows).toEqual({
            activeSince: new Date('2026-09-08T09:30:00Z'),
            lastActiveSince: new Date('2026-07-10T09:30:00Z'),
        });
    });
});

describe('getActivityBucket', () => {
    it.each([
        ['today', 0, 'healthy'],
        ['on day 30', 30, 'healthy'],
        ['on day 31', 31, 'atRisk'],
        ['on day 90', 90, 'atRisk'],
        ['on day 91', 91, 'lost'],
    ] as const)('places activity %s', (_, days, bucket) => {
        expect(getActivityBucket(daysAgo(days), windows)).toBe(bucket);
    });
    it('places a person with no activity ever as lost', () => {
        expect(getActivityBucket(null, windows)).toBe('lost');
    });
    it('includes the instant each bucket starts at, and nothing a millisecond before it', () => {
        const before = (date: Date) => new Date(date.getTime() - 1);
        expect(getActivityBucket(windows.activeSince, windows)).toBe('healthy');
        expect(getActivityBucket(before(windows.activeSince), windows)).toBe(
            'atRisk',
        );
        expect(getActivityBucket(windows.lastActiveSince, windows)).toBe(
            'atRisk',
        );
        expect(
            getActivityBucket(before(windows.lastActiveSince), windows),
        ).toBe('lost');
    });
});
