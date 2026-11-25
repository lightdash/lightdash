import { type ExternalConnectionRateLimitUsage } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getRateLimitHint,
    getRateLimitMeter,
    getRateLimitRows,
    getSavedValues,
    isValidLimit,
    toRateLimitSettings,
} from './rateLimitForm';

const HOUR_BUCKET = {
    id: 'hour',
    label: 'per hour',
    windowMs: 3_600_000,
    capacity: 1_000,
    defaultCapacity: 10_000,
    used: 410,
    resetsAt: null,
};

const usageWith = (
    overrides: Partial<ExternalConnectionRateLimitUsage> = {},
): ExternalConnectionRateLimitUsage => ({
    integrationLabel: 'HubSpot',
    checkedAt: '2026-11-23T14:00:00.000Z',
    buckets: [HOUR_BUCKET],
    limitedUntil: null,
    adminRateLimits: {
        buckets: { hour: 1_000 },
        callsPerSecond: 2,
        concurrentCalls: null,
    },
    defaultCallsPerSecond: 4,
    defaultConcurrentCalls: 5,
    runningCalls: 0,
    note: null,
    ...overrides,
});

const rowOf = (
    key: string,
    usage: ExternalConnectionRateLimitUsage = usageWith(),
) => {
    const row = getRateLimitRows(usage).find((item) => item.key === key);
    if (!row) {
        throw new Error(`No row ${key}`);
    }
    return row;
};

describe('getRateLimitRows', () => {
    it('orders limits from concurrency up to an unset daily one', () => {
        expect(
            getRateLimitRows(usageWith()).map(
                ({ label, defaultLimit, savedLimit }) => ({
                    label,
                    defaultLimit,
                    savedLimit,
                }),
            ),
        ).toEqual([
            {
                label: 'Concurrent requests',
                defaultLimit: 5,
                savedLimit: undefined,
            },
            { label: 'Per second', defaultLimit: 4, savedLimit: 2 },
            { label: 'Per hour', defaultLimit: 10_000, savedLimit: 1_000 },
            { label: 'Per day', defaultLimit: null, savedLimit: undefined },
        ]);
    });

    it('places an unset daily limit before a longer window', () => {
        const month = {
            ...HOUR_BUCKET,
            id: 'month',
            label: 'per month',
            windowMs: 2_592_000_000,
        };

        expect(
            getRateLimitRows(usageWith({ buckets: [HOUR_BUCKET, month] }))
                .slice(2)
                .map(({ label }) => label),
        ).toEqual(['Per hour', 'Per day', 'Per month']);
    });

    it('leaves out calls a second when the integration does not limit them', () => {
        const rows = getRateLimitRows(
            usageWith({ defaultCallsPerSecond: null }),
        );

        expect(rows.map(({ kind }) => kind)).not.toContain('callsPerSecond');
    });

    it('adds no second daily row when there is a daily window', () => {
        const rows = getRateLimitRows(
            usageWith({
                buckets: [
                    {
                        ...HOUR_BUCKET,
                        id: 'day',
                        label: 'per day',
                        windowMs: 86_400_000,
                    },
                ],
            }),
        );

        expect(rows.filter(({ label }) => label === 'Per day')).toHaveLength(1);
    });

    it('shows a saved limit above a since lowered default as the default', () => {
        const usage = usageWith({ defaultConcurrentCalls: 3 });

        expect(
            rowOf('concurrentCalls', {
                ...usage,
                adminRateLimits: {
                    buckets: {},
                    callsPerSecond: null,
                    concurrentCalls: 5,
                },
            }).savedLimit,
        ).toBe(3);
    });
});

describe('isValidLimit', () => {
    it.each([undefined, 1, 10_000])('accepts %s', (value) => {
        expect(isValidLimit(rowOf('window:hour'), value)).toBe(true);
    });

    it.each([0, 10_001, 1.5])('rejects %s', (value) => {
        expect(isValidLimit(rowOf('window:hour'), value)).toBe(false);
    });

    it('lets a daily limit the integration does not have be any size', () => {
        expect(isValidLimit(rowOf('window:day'), 1_000_000)).toBe(true);
    });
});

describe('toRateLimitSettings', () => {
    const rows = getRateLimitRows(usageWith());

    it('keeps what is filled in', () => {
        expect(
            toRateLimitSettings(rows, {
                ...getSavedValues(rows),
                'window:day': 500,
            }),
        ).toEqual({
            buckets: { hour: 1_000, day: 500 },
            callsPerSecond: 2,
            concurrentCalls: null,
        });
    });

    it('drops every cleared limit', () => {
        expect(toRateLimitSettings(rows, {})).toEqual({
            buckets: {},
            callsPerSecond: null,
            concurrentCalls: null,
        });
    });
});

describe('getRateLimitHint', () => {
    const { checkedAt } = usageWith();

    it('explains a window that is not counting', () => {
        expect(getRateLimitHint(rowOf('window:day'), checkedAt)).toBe(
            '24 hour window from the first request',
        );
    });

    it('says when a counting window resets', () => {
        const counting = usageWith({
            buckets: [{ ...HOUR_BUCKET, resetsAt: '2026-11-23T14:37:00.000Z' }],
        });

        expect(
            getRateLimitHint(rowOf('window:hour', counting), checkedAt),
        ).toBe('Resets in 37 min');
    });

    it('explains concurrency whatever is in flight', () => {
        expect(getRateLimitHint(rowOf('concurrentCalls'), checkedAt)).toBe(
            'Max in flight, extra requests wait for a slot',
        );
    });
});

describe('getRateLimitMeter', () => {
    it('fills a window by how much of it is used', () => {
        expect(getRateLimitMeter(rowOf('window:hour'), 0)).toEqual({
            text: '410 of 1,000',
            percent: 41,
            isCounted: true,
            isFull: false,
        });
    });

    it('shows no count for a daily limit that is not set', () => {
        expect(getRateLimitMeter(rowOf('window:day'), 0)).toEqual({
            text: null,
            percent: 0,
            isCounted: false,
            isFull: false,
        });
    });

    it('counts calls running against the limit in force', () => {
        const saved = usageWith({
            adminRateLimits: {
                buckets: {},
                callsPerSecond: null,
                concurrentCalls: 2,
            },
        });

        expect(
            getRateLimitMeter(rowOf('concurrentCalls', saved), 2),
        ).toMatchObject({ text: '2 of 2', percent: 100, isFull: true });
        expect(getRateLimitMeter(rowOf('concurrentCalls'), 1)).toMatchObject({
            text: '1 of 5',
            percent: 20,
        });
    });

    it('states the per-second limit without counting it', () => {
        expect(getRateLimitMeter(rowOf('callsPerSecond'), 0)).toMatchObject({
            text: 'Up to 2',
            percent: 0,
            isCounted: false,
        });
    });
});
