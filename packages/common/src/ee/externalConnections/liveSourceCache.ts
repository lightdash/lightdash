import { ApiConnectorType } from '../../types/querySources';

/**
 * How long a live data source's result answers the same query for everyone
 * on the source, before the next query calls the integration again. Set to
 * how fast each integration's data changes and how tight its quota is.
 */
export const LIVE_SOURCE_DEFAULT_CACHE_TTL_SECONDS: Record<
    ApiConnectorType,
    number
> = {
    // Product analytics, read close to real time.
    [ApiConnectorType.POSTHOG]: 60,
    // Hourly processing and a token quota per property.
    [ApiConnectorType.GA4]: 600,
    // Data lands two to three days late.
    [ApiConnectorType.SEARCH_CONSOLE]: 3_600,
    [ApiConnectorType.META_ADS]: 900,
    [ApiConnectorType.GOOGLE_ADS]: 900,
    [ApiConnectorType.LINKEDIN_ADS]: 900,
    // Channel reports update daily.
    [ApiConnectorType.YOUTUBE_ANALYTICS]: 3_600,
    [ApiConnectorType.GITHUB]: 300,
    // Tickets change through the day; search allows about 120 calls a minute per workspace and a query can page several times.
    [ApiConnectorType.PYLON]: 300,
    // CRM records change through the day; queries with many filters or sorts use up its rate limit faster.
    [ApiConnectorType.ATTIO]: 300,
};

/** 0 makes every query call the integration. */
export const LIVE_SOURCE_CACHE_TTL_MIN_SECONDS = 0;
export const LIVE_SOURCE_CACHE_TTL_MAX_SECONDS = 24 * 60 * 60;

/** The source's own window when an admin set one, otherwise its integration's. */
export const getLiveSourceCacheTtlSeconds = (
    connector: ApiConnectorType,
    override: number | null | undefined,
): number => override ?? LIVE_SOURCE_DEFAULT_CACHE_TTL_SECONDS[connector];

export const isValidLiveSourceCacheTtlSeconds = (value: number): boolean =>
    Number.isInteger(value) &&
    value >= LIVE_SOURCE_CACHE_TTL_MIN_SECONDS &&
    value <= LIVE_SOURCE_CACHE_TTL_MAX_SECONDS;

/** Null puts the source back on its integration's default. */
export type ApiUpdateLiveSourceCacheRequest = {
    ttlSeconds: number | null;
};
