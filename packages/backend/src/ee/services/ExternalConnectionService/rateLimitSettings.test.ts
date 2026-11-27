import {
    ParameterError,
    type LiveSourceRateLimitSettings,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type LiveRateLimits } from '../../../services/QuerySourceService/live/spec/types';
import {
    applyAdminRateLimits,
    assertValidRateLimitSettings,
    hasRateLimitSettings,
    startsDailyLimit,
} from './rateLimitSettings';

const HOUR = {
    id: 'hour',
    label: 'per hour',
    windowMs: 3_600_000,
    capacity: 10_000,
};
const DAY = {
    id: 'day',
    label: 'per day',
    windowMs: 86_400_000,
    capacity: 2_000,
};

const declared: LiveRateLimits = {
    concurrentCalls: 5,
    callsPerSecond: 4,
    buckets: [HOUR],
};

const settings = (
    overrides: Partial<LiveSourceRateLimitSettings> = {},
): LiveSourceRateLimitSettings => ({
    buckets: {},
    callsPerSecond: null,
    concurrentCalls: null,
    ...overrides,
});

const NOTHING_SET_BY_ADMIN = {
    bucketIds: [],
    callsPerSecond: false,
    concurrentCalls: false,
};

describe('applyAdminRateLimits', () => {
    it.each([null, settings()])(
        'keeps the integration limits when the admin set %s',
        (admin) => {
            expect(applyAdminRateLimits(declared, admin)).toEqual({
                rateLimits: declared,
                setByAdmin: NOTHING_SET_BY_ADMIN,
            });
        },
    );

    it('takes the lower value for every kind of limit and adds a daily one', () => {
        expect(
            applyAdminRateLimits(
                declared,
                settings({
                    buckets: { hour: 1_000, day: 5_000 },
                    callsPerSecond: 2,
                    concurrentCalls: 1,
                }),
            ),
        ).toEqual({
            rateLimits: {
                concurrentCalls: 1,
                callsPerSecond: 2,
                buckets: [
                    { ...HOUR, capacity: 1_000 },
                    { ...DAY, capacity: 5_000 },
                ],
            },
            setByAdmin: {
                bucketIds: ['hour', 'day'],
                callsPerSecond: true,
                concurrentCalls: true,
            },
        });
    });

    it('keeps the integration limit once it is no higher than the admin value', () => {
        const limits = applyAdminRateLimits(
            declared,
            settings({
                buckets: { hour: 20_000 },
                callsPerSecond: 4,
                concurrentCalls: 8,
            }),
        );

        expect(limits).toEqual({
            rateLimits: declared,
            setByAdmin: NOTHING_SET_BY_ADMIN,
        });
    });

    it('lowers a declared daily limit instead of adding a second one', () => {
        const { rateLimits } = applyAdminRateLimits(
            { ...declared, buckets: [{ ...DAY, id: 'daily' }] },
            settings({ buckets: { day: 100 } }),
        );

        expect(rateLimits.buckets).toEqual([
            { ...DAY, id: 'daily', capacity: 100 },
        ]);
    });

    it('ignores a window and a per-second limit the integration does not have', () => {
        const withoutPacing = { ...declared, callsPerSecond: null };

        expect(
            applyAdminRateLimits(
                withoutPacing,
                settings({ buckets: { minute: 1 }, callsPerSecond: 1 }),
            ),
        ).toEqual({
            rateLimits: withoutPacing,
            setByAdmin: NOTHING_SET_BY_ADMIN,
        });
    });
});

describe('assertValidRateLimitSettings', () => {
    const validate = (
        admin: LiveSourceRateLimitSettings,
        limits: LiveRateLimits = declared,
    ) =>
        assertValidRateLimitSettings({
            integrationLabel: 'HubSpot',
            declared: limits,
            settings: admin,
        });

    it.each([
        settings(),
        settings({
            buckets: { hour: 1, day: 1 },
            callsPerSecond: 1,
            concurrentCalls: 1,
        }),
        settings({
            buckets: { hour: 10_000, day: 2_147_483_647 },
            callsPerSecond: 4,
            concurrentCalls: 5,
        }),
    ])('accepts values from 1 to the integration limit: %j', (admin) => {
        expect(() => validate(admin)).not.toThrow();
    });

    it.each([
        settings({ buckets: { hour: 0 } }),
        settings({ buckets: { hour: 10_001 } }),
        settings({ buckets: { hour: 1.5 } }),
        settings({ buckets: { day: 0 } }),
        settings({ buckets: { day: 2_147_483_648 } }),
        settings({ buckets: { minute: 10 } }),
        settings({ callsPerSecond: 0 }),
        settings({ callsPerSecond: 5 }),
        settings({ concurrentCalls: 0 }),
        settings({ concurrentCalls: 6 }),
    ])('rejects %j', (admin) => {
        expect(() => validate(admin)).toThrow(ParameterError);
    });

    it('rejects a per-second limit when the integration has none', () => {
        expect(() =>
            validate(settings({ callsPerSecond: 1 }), {
                ...declared,
                callsPerSecond: null,
            }),
        ).toThrow('HubSpot has no per-second rate limit');
    });

    it('holds a declared daily limit to its own maximum', () => {
        expect(() =>
            validate(settings({ buckets: { day: 2_001 } }), {
                ...declared,
                buckets: [DAY],
            }),
        ).toThrow(
            'The HubSpot limit per day must be a whole number from 1 to 2,000',
        );
    });
});

describe('startsDailyLimit', () => {
    const daily = settings({ buckets: { day: 100 } });

    it('is true when an admin adds a daily limit', () => {
        expect(startsDailyLimit(declared, null, daily)).toBe(true);
    });

    it('is false when the daily limit only changes', () => {
        expect(
            startsDailyLimit(
                declared,
                daily,
                settings({ buckets: { day: 50 } }),
            ),
        ).toBe(false);
    });

    it('is false when the integration already counts calls by day', () => {
        expect(
            startsDailyLimit({ ...declared, buckets: [DAY] }, null, daily),
        ).toBe(false);
    });

    it('is false when the daily limit is removed', () => {
        expect(startsDailyLimit(declared, daily, settings())).toBe(false);
    });
});

describe('hasRateLimitSettings', () => {
    it('is false when every limit is left to the integration', () => {
        expect(hasRateLimitSettings(settings())).toBe(false);
    });

    it.each([
        settings({ buckets: { hour: 1 } }),
        settings({ callsPerSecond: 1 }),
        settings({ concurrentCalls: 1 }),
    ])('is true for %j', (admin) => {
        expect(hasRateLimitSettings(admin)).toBe(true);
    });
});
