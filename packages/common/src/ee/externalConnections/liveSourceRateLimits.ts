/** The window an admin can limit on every integration, whether or not it declares one. */
export const LIVE_SOURCE_DAILY_RATE_LIMIT = {
    id: 'day',
    label: 'per day',
    windowMs: 24 * 60 * 60 * 1000,
} as const;

/** The largest limit that can be saved: calls are counted in 32-bit integers. */
export const LIVE_SOURCE_RATE_LIMIT_MAX = 2_147_483_647;

/**
 * The limits an admin set on one live data source. Each lowers the
 * integration's own limit; a window left out of `buckets`, or a null value,
 * keeps it.
 */
export type LiveSourceRateLimitSettings = {
    /** Calls allowed in a time window, by bucket id. */
    buckets: { [bucketId: string]: number };
    callsPerSecond: number | null;
    /** Calls in flight at once. */
    concurrentCalls: number | null;
};

export type ApiUpdateLiveSourceRateLimitsRequest = LiveSourceRateLimitSettings;
