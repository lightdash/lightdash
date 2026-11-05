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

// Persisted in query_history.cache_miss_reason; values are a DB contract.
export enum ResultsCacheMissReason {
    BYPASSED = 'bypassed',
    CACHE_DISABLED = 'cache_disabled',
    ACCESS_RESTRICTED = 'access_restricted',
    EXPIRED = 'expired',
    CLEARED = 'cleared',
    NO_CACHED_RESULT = 'no_cached_result',
}

export enum ResultsCacheStatsMissReason {
    EXPIRED = 'expired',
    CLEARED = 'cleared',
    SCHEDULED_REFRESH = 'scheduledRefresh',
}

export enum ResultsCacheStatsContextGroup {
    DASHBOARDS = 'dashboards',
    CHARTS_AND_EXPLORE = 'chartsAndExplore',
    SCHEDULED = 'scheduled',
    OTHER = 'other',
}

export type ResultsCacheStatsDays = 7 | 30;

export type ResultsCacheStatsTotals = {
    runs: number;
    hits: number;
    misses: number;
    hitRate: number | null;
    warehouseTimeSavedMs: number;
    warehouseTimeOnMissesMs: number;
};

export type ResultsCacheStatsSummary = ResultsCacheStatsTotals & {
    avoidableMisses: number;
    avoidableWarehouseTimeMs: number;
};

export type ResultsCacheRecommendationTarget =
    | { kind: 'chart'; chartUuid: string; name: string }
    | { kind: 'sqlChart'; savedSqlUuid: string; slug: string; name: string }
    | { kind: 'explore'; exploreName: string; name: string };

export type ResultsCacheRecommendation = {
    reason: ResultsCacheStatsMissReason;
    target: ResultsCacheRecommendationTarget;
    misses: number;
    warehouseTimeMs: number;
};

export type ResultsCacheStats = {
    days: ResultsCacheStatsDays;
    summary: ResultsCacheStatsSummary;
    byContext: Array<
        { group: ResultsCacheStatsContextGroup } & ResultsCacheStatsTotals
    >;
    missReasons: Array<{
        reason: ResultsCacheStatsMissReason;
        misses: number;
        warehouseTimeMs: number;
    }>;
    recommendations: ResultsCacheRecommendation[];
};

export type ApiResultsCacheStatsResponse = ApiSuccess<ResultsCacheStats>;

export type ResultsCacheTtlProjection = {
    ttlSeconds: number;
    hits: number;
    hitRate: number | null;
    additionalHits: number;
    warehouseTimeSavedMs: number;
};

export type ResultsCacheTtlProjections =
    | {
          kind: 'projections';
          currentTtlSeconds: number;
          baseline: { runs: number; hits: number; hitRate: number | null };
          projections: ResultsCacheTtlProjection[];
      }
    | { kind: 'tooManyRuns' | 'noLongerTtl'; currentTtlSeconds: number };

export type ApiResultsCacheTtlProjectionsResponse =
    ApiSuccess<ResultsCacheTtlProjections>;
