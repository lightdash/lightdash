import { describe, expect, it } from 'vitest';
import {
    AT_RISK_ACTIVITY_DAYS,
    getActivityBucket,
    getActivityBucketStarts,
    HEALTHY_ACTIVITY_DAYS,
} from './activityBuckets';

const NOW = new Date('2026-10-08T09:30:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const starts = getActivityBucketStarts(NOW);

describe('getActivityBucketStarts', () => {
    it('reaches back 30 and 90 whole days from one instant', () => {
        expect(HEALTHY_ACTIVITY_DAYS).toBe(30);
        expect(AT_RISK_ACTIVITY_DAYS).toBe(90);
        expect(starts).toEqual({
            healthySince: new Date('2026-09-08T09:30:00Z'),
            atRiskSince: new Date('2026-07-10T09:30:00Z'),
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
        expect(getActivityBucket(daysAgo(days), starts)).toBe(bucket);
    });
    it('places a person with no activity ever as lost', () => {
        expect(getActivityBucket(null, starts)).toBe('lost');
    });
    it('includes the instant each bucket starts at, and nothing a millisecond before it', () => {
        const before = (date: Date) => new Date(date.getTime() - 1);
        expect(getActivityBucket(starts.healthySince, starts)).toBe('healthy');
        expect(getActivityBucket(before(starts.healthySince), starts)).toBe(
            'atRisk',
        );
        expect(getActivityBucket(starts.atRiskSince, starts)).toBe('atRisk');
        expect(getActivityBucket(before(starts.atRiskSince), starts)).toBe(
            'lost',
        );
    });
});
