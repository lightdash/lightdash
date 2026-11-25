import { describe, expect, it } from 'vitest';
import {
    formatResetsAt,
    formatUntil,
    formatUsed,
    getRateLimitStat,
} from './rateLimitFormat';

const CHECKED = '2026-11-23T14:00:00.000Z';
const at = (offsetMs: number) =>
    new Date(new Date(CHECKED).getTime() + offsetMs).toISOString();

describe('formatResetsAt', () => {
    it('counts seconds under a minute', () => {
        expect(formatResetsAt(at(42_000), CHECKED)).toBe('resets in 42s');
    });

    it('counts minutes under an hour', () => {
        expect(formatResetsAt(at(37 * 60_000), CHECKED)).toBe(
            'resets in 37 min',
        );
    });

    it('gives a time later today', () => {
        expect(formatResetsAt(at(3 * 3_600_000), CHECKED)).toMatch(
            /^resets at /,
        );
    });

    it('gives a date beyond today', () => {
        expect(formatResetsAt(at(30 * 3_600_000), CHECKED)).toMatch(
            /^resets .+, /,
        );
    });

    it('never counts below zero', () => {
        expect(formatResetsAt(at(-5_000), CHECKED)).toBe('resets in 0s');
    });
});

describe('formatUntil', () => {
    it('gives a time today and a date beyond', () => {
        expect(formatUntil(at(5 * 60_000), CHECKED)).toMatch(/^until \d/);
        expect(formatUntil(at(30 * 3_600_000), CHECKED)).toMatch(/^until .+, /);
    });
});

describe('formatUsed', () => {
    it('groups thousands', () => {
        expect(formatUsed(410, 10_000)).toBe('410 of 10,000');
    });
});

describe('getRateLimitStat', () => {
    const usage = {
        integrationLabel: 'GitHub',
        checkedAt: CHECKED,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 30,
                defaultCapacity: 30,
                used: 12,
                resetsAt: at(20_000),
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 5_000,
                defaultCapacity: 5_000,
                used: 410,
                resetsAt: at(24 * 60_000),
            },
        ],
        limitedUntil: null,
        adminRateLimits: null,
        defaultCallsPerSecond: null,
        defaultConcurrentCalls: 3,
        note: null,
        callsPerQuery: 1,
    };

    it('shows the longest declared limit', () => {
        expect(getRateLimitStat(usage)).toEqual({
            value: '410 of 5,000',
            detail: 'per hour',
            title: 'Resets in 24 min',
            limitReached: false,
        });
    });

    it('shows a full limit over the longest one', () => {
        const minuteFull = {
            ...usage,
            buckets: usage.buckets.map((bucket) =>
                bucket.id === 'minute' ? { ...bucket, used: 30 } : bucket,
            ),
        };
        expect(getRateLimitStat(minuteFull)).toEqual({
            value: '30 of 30',
            detail: 'per minute',
            title: 'Limit reached, resets in 20s',
            limitReached: true,
        });
    });

    it('shows a vendor pause over any limit', () => {
        expect(
            getRateLimitStat({ ...usage, limitedUntil: at(5 * 60_000) }),
        ).toMatchObject({
            value: 'Paused',
            detail: expect.stringMatching(/^until /),
            limitReached: true,
        });
    });

    it('shows a dash when nothing is declared', () => {
        expect(getRateLimitStat({ ...usage, buckets: [] }).value).toBe('—');
    });
});
