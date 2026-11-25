import { type ExternalConnectionRateLimitUsage } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getRateLimitRows,
    getSavedValues,
    isBelowQueryCalls,
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
    note: null,
    callsPerQuery: 5,
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
    it('lists each window, an unset daily one, calls a second and calls at once', () => {
        expect(
            getRateLimitRows(usageWith()).map(
                ({ label, defaultLimit, savedLimit }) => ({
                    label,
                    defaultLimit,
                    savedLimit,
                }),
            ),
        ).toEqual([
            { label: 'Per hour', defaultLimit: 10_000, savedLimit: 1_000 },
            { label: 'Per day', defaultLimit: null, savedLimit: undefined },
            { label: 'Per second', defaultLimit: 4, savedLimit: 2 },
            { label: 'Calls at once', defaultLimit: 5, savedLimit: undefined },
        ]);
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

describe('isBelowQueryCalls', () => {
    it('warns for a window below the calls one query can make', () => {
        expect(isBelowQueryCalls(rowOf('window:hour'), 4, 5)).toBe(true);
        expect(isBelowQueryCalls(rowOf('window:hour'), 5, 5)).toBe(false);
    });

    it('does not warn about calls at once', () => {
        expect(isBelowQueryCalls(rowOf('concurrentCalls'), 1, 5)).toBe(false);
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
