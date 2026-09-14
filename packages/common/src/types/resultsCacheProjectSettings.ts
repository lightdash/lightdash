import { type ApiSuccess } from './api/success';

export const MIN_RESULTS_CACHE_TTL_SECONDS = 60;
export const MAX_RESULTS_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export type ResultsCacheProjectSettings = {
    projectUuid: string;
    cacheTtlSeconds: number | null;
    instanceDefaultTtlSeconds: number;
};

export type UpdateResultsCacheProjectSettings = {
    cacheTtlSeconds: number | null;
};

export type ApiResultsCacheProjectSettingsResponse =
    ApiSuccess<ResultsCacheProjectSettings>;
