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
    {
        rateLimits = RATE_LIMITS,
        declared,
        runningCalls = 0,
    }: {
        rateLimits?: LiveRateLimits;
        declared?: LiveRateLimits;
        runningCalls?: number;
    } = {},
) =>
    toRateLimitUsage({
        integrationLabel: 'HubSpot',
        rateLimits,
        declared: declared ?? rateLimits,
        adminRateLimits: null,
        snapshot: { now: NOW, buckets, runningCalls },
    });

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('toRateLimitUsage', () => {
    it('never shows more calls running than the limit in force', () => {
        const rateLimits = { ...RATE_LIMITS, concurrentCalls: 2 };

        expect(usageOf([], { rateLimits, runningCalls: 1 }).runningCalls).toBe(
            1,
        );
        expect(usageOf([], { rateLimits, runningCalls: 4 }).runningCalls).toBe(
            2,
        );
    });

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
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: MINUTE,
                    capacity: 100,
                    defaultCapacity: 100,
                    used: 18,
                    resetsAt: '2026-11-23T14:00:42.000Z',
                },
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: HOUR,
                    capacity: 10_000,
                    defaultCapacity: 10_000,
                    used: 410,
                    resetsAt: '2026-11-23T14:37:00.000Z',
                },
            ],
            limitedUntil: null,
            adminRateLimits: null,
            defaultCallsPerSecond: 4,
            defaultConcurrentCalls: 5,
            runningCalls: 0,
            note: null,
        });
    });

    it('shows the limit in force beside the integration own limit', () => {
        const usage = usageOf([], {
            rateLimits: {
                ...RATE_LIMITS,
                buckets: [
                    {
                        id: 'hour',
                        label: 'per hour',
                        windowMs: HOUR,
                        capacity: 1_000,
                    },
                    {
                        id: 'day',
                        label: 'per day',
                        windowMs: 24 * HOUR,
                        capacity: 5_000,
                    },
                ],
            },
            declared: RATE_LIMITS,
        });

        expect(
            usage.buckets.map(({ id, capacity, defaultCapacity }) => ({
                id,
                capacity,
                defaultCapacity,
            })),
        ).toEqual([
            { id: 'hour', capacity: 1_000, defaultCapacity: 10_000 },
            { id: 'day', capacity: 5_000, defaultCapacity: null },
        ]);
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
            buckets: [],
        });
    });

    it("tells admins only what is written for them, not the integration's own note", () => {
        const rateLimits = {
            concurrentCalls: 2,
            callsPerSecond: null,
            buckets: [],
            note: 'Our own quota is shared by every customer.',
        };

        expect(usageOf([], { rateLimits }).note).toBeNull();
        expect(
            usageOf([], {
                rateLimits: { ...rateLimits, cardNote: 'Counts tokens.' },
            }).note,
        ).toBe('Counts tokens.');
    });
});
