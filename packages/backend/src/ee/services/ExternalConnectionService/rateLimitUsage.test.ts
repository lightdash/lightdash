import { describe, expect, it } from 'vitest';
import { type LiveRateLimits } from '../../../services/QuerySourceService/live/spec/types';
import { toRateLimitUsage } from './rateLimitUsage';

const NOW = new Date('2026-11-23T14:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const RATE_LIMITS: LiveRateLimits = {
    concurrentCalls: 5,
    callsPerSecond: 4,
    buckets: [
        { id: 'hour', label: 'per hour', windowMs: HOUR, capacity: 10_000 },
        { id: 'minute', label: 'per minute', windowMs: MINUTE, capacity: 100 },
    ],
};

const usageOf = (
    buckets: Parameters<typeof toRateLimitUsage>[0]['snapshot']['buckets'],
    { rateLimits = RATE_LIMITS } = {},
) =>
    toRateLimitUsage({
        integrationLabel: 'HubSpot',
        rateLimits,
        snapshot: { now: NOW, buckets },
    });

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('toRateLimitUsage', () => {
    it('shows each open window, shortest first, with when it resets', () => {
        const usage = usageOf([
            {
                bucketId: 'hour',
                used: 410,
                windowStartedAt: ago(23 * MINUTE),
                limitedUntil: null,
            },
            {
                bucketId: 'minute',
                used: 18,
                windowStartedAt: ago(18_000),
                limitedUntil: null,
            },
        ]);

        expect(usage).toEqual({
            integrationLabel: 'HubSpot',
            checkedAt: NOW.toISOString(),
            callsPerSecond: 4,
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: MINUTE,
                    capacity: 100,
                    used: 18,
                    resetsAt: '2026-11-23T14:00:42.000Z',
                },
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: HOUR,
                    capacity: 10_000,
                    used: 410,
                    resetsAt: '2026-11-23T14:37:00.000Z',
                },
            ],
            limitedUntil: null,
        });
    });

    it('shows full capacity for a window that has ended or never opened', () => {
        const usage = usageOf([
            {
                bucketId: 'minute',
                used: 100,
                windowStartedAt: ago(2 * MINUTE),
                limitedUntil: null,
            },
        ]);

        expect(
            usage.buckets.map(({ used, resetsAt }) => ({ used, resetsAt })),
        ).toEqual([
            { used: 0, resetsAt: null },
            { used: 0, resetsAt: null },
        ]);
    });

    it('reports the latest vendor hold still in force', () => {
        const usage = usageOf([
            {
                bucketId: 'minute',
                used: 3,
                windowStartedAt: ago(5_000),
                limitedUntil: new Date('2026-11-23T14:05:00.000Z'),
            },
            {
                bucketId: 'hour',
                used: 3,
                windowStartedAt: ago(5_000),
                limitedUntil: new Date('2026-11-23T14:02:00.000Z'),
            },
        ]);

        expect(usage.limitedUntil).toBe('2026-11-23T14:05:00.000Z');
    });

    it('ignores a hold that has passed', () => {
        const usage = usageOf([
            {
                bucketId: 'minute',
                used: 3,
                windowStartedAt: ago(5_000),
                limitedUntil: ago(1_000),
            },
        ]);

        expect(usage.limitedUntil).toBeNull();
    });

    it('ignores rows for buckets the integration no longer declares', () => {
        const usage = usageOf([
            {
                bucketId: 'day',
                used: 900,
                windowStartedAt: ago(MINUTE),
                limitedUntil: null,
            },
        ]);

        expect(usage.buckets.map(({ id }) => id)).toEqual(['minute', 'hour']);
    });

    it('returns no buckets when nothing is budgeted', () => {
        const usage = usageOf([], {
            rateLimits: {
                concurrentCalls: 2,
                callsPerSecond: null,
                buckets: [],
                note: 'Counts tokens, not calls.',
            },
        });

        expect(usage).toMatchObject({
            callsPerSecond: null,
            buckets: [],
        });
    });
});
