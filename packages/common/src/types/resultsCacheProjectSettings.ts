import { type ApiSuccess } from './api/success';

export const MIN_RESULTS_CACHE_TTL_SECONDS = 60;
export const MAX_RESULTS_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MAX_RESULTS_CACHE_INVALIDATION_EXPLORES = 100;

export type ResultsCacheClearSchedule = {
    cron: string;
    enabled: boolean;
    nextRunAt: Date | null;
};

export type ResultsCacheProjectSettings = {
    projectUuid: string;
    cacheEnabled: boolean;
    /** True when the deprecated RESULTS_CACHE_ENABLED env var sets caching for every project. */
    cacheEnabledSetByInstance: boolean;
    cacheTtlSeconds: number | null;
    instanceDefaultTtlSeconds: number;
    lastInvalidatedAt: Date | null;
    clearSchedule: ResultsCacheClearSchedule | null;
    schedulerTimezone: string;
};

export type UpdateResultsCacheClearSchedule = {
    cron: string;
    enabled: boolean;
};

export type UpdateResultsCacheProjectSettings = {
    /** Omit to keep the current value. */
    cacheEnabled?: boolean;
    /** Omit to keep the current value. Pass null to use the instance default. */
    cacheTtlSeconds?: number | null;
};

export type ApiResultsCacheProjectSettingsResponse =
    ApiSuccess<ResultsCacheProjectSettings>;

export type ResultsCacheStatus = {
    enabled: boolean;
};

export type ApiResultsCacheStatusResponse = ApiSuccess<ResultsCacheStatus>;

export type ResultsCacheInvalidation = {
    projectUuid: string;
    invalidatedAt: Date;
};

export type ApiResultsCacheInvalidationResponse =
    ApiSuccess<ResultsCacheInvalidation>;

export type InvalidateExploresResultsCache = {
    exploreNames: string[];
    /**
     * Also invalidate every explore that reads the base table of a listed
     * explore, for example by joining it. Defaults to false.
     */
    includeJoinedExplores?: boolean;
};

export type ExploresResultsCacheInvalidation = ResultsCacheInvalidation & {
    exploreNames: string[];
};

export type ApiExploresResultsCacheInvalidationResponse =
    ApiSuccess<ExploresResultsCacheInvalidation>;
