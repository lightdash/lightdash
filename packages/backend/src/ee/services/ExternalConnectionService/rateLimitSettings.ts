import {
    LIVE_SOURCE_DAILY_RATE_LIMIT,
    LIVE_SOURCE_RATE_LIMIT_MAX,
    ParameterError,
    type LiveSourceRateLimitSettings,
} from '@lightdash/common';
import type {
    LiveRateLimitBucket,
    LiveRateLimits,
} from '../../../services/QuerySourceService/live/spec/types';

/** Which of the limits in force an admin set, so a refusal can say so. */
export type AdminSetLimits = {
    bucketIds: readonly string[];
    callsPerSecond: boolean;
    concurrentCalls: boolean;
};

const isDaily = ({ windowMs }: LiveRateLimitBucket) =>
    windowMs === LIVE_SOURCE_DAILY_RATE_LIMIT.windowMs;

/** The admin's value when it is the stricter one. */
const getStricter = (
    adminValue: number | null | undefined,
    declared: number,
): number | null =>
    typeof adminValue === 'number' && adminValue < declared ? adminValue : null;

/**
 * The limits Lightdash keeps a source's calls under: for each, the lower of
 * the integration's own and the admin's, plus a daily limit an admin added.
 */
export const applyAdminRateLimits = (
    declared: LiveRateLimits,
    settings: LiveSourceRateLimitSettings | null,
): { rateLimits: LiveRateLimits; setByAdmin: AdminSetLimits } => {
    const lowered = declared.buckets.map((bucket) => ({
        bucket,
        capacity: getStricter(
            settings?.buckets[bucket.id] ??
                (isDaily(bucket)
                    ? settings?.buckets[LIVE_SOURCE_DAILY_RATE_LIMIT.id]
                    : undefined),
            bucket.capacity,
        ),
    }));
    const dailyLimit = settings?.buckets[LIVE_SOURCE_DAILY_RATE_LIMIT.id];
    const added: LiveRateLimitBucket[] =
        dailyLimit === undefined || declared.buckets.some(isDaily)
            ? []
            : [{ ...LIVE_SOURCE_DAILY_RATE_LIMIT, capacity: dailyLimit }];
    // Nothing to space calls by when the integration has no per-second limit
    const callsPerSecond =
        declared.callsPerSecond === null
            ? null
            : getStricter(settings?.callsPerSecond, declared.callsPerSecond);
    const concurrentCalls = getStricter(
        settings?.concurrentCalls,
        declared.concurrentCalls,
    );
    return {
        rateLimits: {
            ...declared,
            buckets: [
                ...lowered.map(({ bucket, capacity }) =>
                    capacity === null ? bucket : { ...bucket, capacity },
                ),
                ...added,
            ],
            callsPerSecond: callsPerSecond ?? declared.callsPerSecond,
            concurrentCalls: concurrentCalls ?? declared.concurrentCalls,
        },
        setByAdmin: {
            bucketIds: [
                ...lowered
                    .filter(({ capacity }) => capacity !== null)
                    .map(({ bucket }) => bucket.id),
                ...added.map(({ id }) => id),
            ],
            callsPerSecond: callsPerSecond !== null,
            concurrentCalls: concurrentCalls !== null,
        },
    };
};

/** Whether saving `next` starts a daily limit that calls weren't counted against. */
export const startsDailyLimit = (
    declared: LiveRateLimits,
    previous: LiveSourceRateLimitSettings | null,
    next: LiveSourceRateLimitSettings,
): boolean => {
    const countsDaily = (settings: LiveSourceRateLimitSettings | null) =>
        applyAdminRateLimits(declared, settings).rateLimits.buckets.some(
            isDaily,
        );
    return !countsDaily(previous) && countsDaily(next);
};

export const hasRateLimitSettings = ({
    buckets,
    callsPerSecond,
    concurrentCalls,
}: LiveSourceRateLimitSettings): boolean =>
    Object.keys(buckets).length > 0 ||
    callsPerSecond !== null ||
    concurrentCalls !== null;

/** Throws a ParameterError naming the first limit an admin can't set. */
export const assertValidRateLimitSettings = ({
    integrationLabel,
    declared,
    settings,
}: {
    integrationLabel: string;
    declared: LiveRateLimits;
    settings: LiveSourceRateLimitSettings;
}): void => {
    const assertWithin = (name: string, value: number, max: number) => {
        if (!Number.isInteger(value) || value < 1 || value > max) {
            throw new ParameterError(
                `The ${integrationLabel} limit ${name} must be a whole number from 1 to ${max.toLocaleString('en-US')}`,
            );
        }
    };
    Object.entries(settings.buckets).forEach(([bucketId, value]) => {
        const bucket = declared.buckets.find(({ id }) => id === bucketId);
        if (bucket) {
            assertWithin(bucket.label, value, bucket.capacity);
            return;
        }
        if (
            bucketId !== LIVE_SOURCE_DAILY_RATE_LIMIT.id ||
            declared.buckets.some(isDaily)
        ) {
            throw new ParameterError(
                `${integrationLabel} has no "${bucketId}" rate limit`,
            );
        }
        assertWithin(
            LIVE_SOURCE_DAILY_RATE_LIMIT.label,
            value,
            LIVE_SOURCE_RATE_LIMIT_MAX,
        );
    });
    if (settings.callsPerSecond !== null) {
        if (declared.callsPerSecond === null) {
            throw new ParameterError(
                `${integrationLabel} has no per-second rate limit`,
            );
        }
        assertWithin(
            'per second',
            settings.callsPerSecond,
            declared.callsPerSecond,
        );
    }
    if (settings.concurrentCalls !== null) {
        assertWithin(
            'on concurrent requests',
            settings.concurrentCalls,
            declared.concurrentCalls,
        );
    }
};
