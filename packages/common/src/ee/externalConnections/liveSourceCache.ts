import { ApiConnectorType } from '../../types/querySources';

/** One hour for every integration until usage shows which need another window. */
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60;

/**
 * How long a live data source's result answers the same query for everyone
 * on the source, before the next query calls the integration again.
 */
export const LIVE_SOURCE_DEFAULT_CACHE_TTL_SECONDS: Record<
    ApiConnectorType,
    number
> = {
    [ApiConnectorType.POSTHOG]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.GA4]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.SEARCH_CONSOLE]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.META_ADS]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.GOOGLE_ADS]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.LINKEDIN_ADS]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.GITHUB]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.PYLON]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.ATTIO]: DEFAULT_CACHE_TTL_SECONDS,
    [ApiConnectorType.HUBSPOT]: DEFAULT_CACHE_TTL_SECONDS,
    // Calls count against the org's daily API limit, shared with its other apps
    [ApiConnectorType.SALESFORCE]: DEFAULT_CACHE_TTL_SECONDS,
    // Queries count against a cost budget per hour, shared with other clients
    [ApiConnectorType.AMPLITUDE]: DEFAULT_CACHE_TTL_SECONDS,
    // Queries count against 60 an hour per project, shared with other clients
    [ApiConnectorType.MIXPANEL]: DEFAULT_CACHE_TTL_SECONDS,
    // Calls count against 10,000 a minute shared by the workspace's private apps
    [ApiConnectorType.INTERCOM]: DEFAULT_CACHE_TTL_SECONDS,
    // Rows change as the app writes them; reads count against the project's compute
    [ApiConnectorType.SUPABASE]: DEFAULT_CACHE_TTL_SECONDS,
    // Like every other source, so cache tests see the default window
    [ApiConnectorType.HYDRA]: DEFAULT_CACHE_TTL_SECONDS,
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
