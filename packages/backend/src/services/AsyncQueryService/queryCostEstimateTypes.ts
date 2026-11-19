export const QUERY_COST_ESTIMATE_SOURCES = [
    'agent_limit',
    'explorer',
    'sql_runner',
] as const;
export type QueryCostEstimateSource =
    (typeof QUERY_COST_ESTIMATE_SOURCES)[number];

export const QUERY_COST_ESTIMATE_OUTCOMES = [
    'ok',
    'exceeded',
    'error',
    'unavailable',
] as const;
export type QueryCostEstimateOutcome =
    (typeof QUERY_COST_ESTIMATE_OUTCOMES)[number];

export const QUERY_COST_ESTIMATE_CACHE_RESULTS = [
    'hit',
    'miss',
    'none',
] as const;
export type QueryCostEstimateCacheResult =
    (typeof QUERY_COST_ESTIMATE_CACHE_RESULTS)[number];
