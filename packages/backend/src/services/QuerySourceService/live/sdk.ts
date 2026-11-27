/**
 * Everything an integration under `integrations/` may import from the
 * engine. An integration imports only this module, `@lightdash/common`,
 * zod and its own folder (Google sources also share `integrations/google`),
 * so the engine can change behind it.
 */

// The contract
export {
    ALL_PUSHDOWN_REFUSED,
    assertMaxRows,
    defineLiveIntegration,
    defineLiveModel,
    keepParsed,
    formatTestCount,
    jsonRequest,
    pickLiveFields,
    readRule,
    toLiveModelName,
    withFieldsOffByDefault,
} from './integration';
export type {
    LiveIntegrationSpec,
    LiveRateLimits,
    LiveUseCases,
} from './spec/types';
export type {
    LiveColumn,
    LiveConnection,
    LiveExtension,
    LiveExtraFields,
    LiveModel,
    LiveQuery,
    LiveHttpRequest,
    LiveHttpResponse,
    LiveLimits,
    LiveRunArgs,
    LiveRunResult,
    LiveRuntime,
    LiveTestSummary,
} from './types';

// Explores and fields
export {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    ratio,
} from './explores/declare';
export {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    getLiveExploreApiName,
    getLiveRequestLimit,
    toFieldCombinationIssue,
    toLiveQueryError,
    type LiveCompiledRequest,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
    type LivePeriodFormat,
} from './explores/definition';

// Compiling and running queries
export { parseRetryAfterSeconds } from './calls';
export {
    getIsoDateInTimeZone,
    getLiveDateRange,
    resolveAbsoluteDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
    type LiveDateBound,
} from './query/dateRange';
export { escapeRe2 } from './query/escapeRe2';
export { getGrainIssues, type LiveGrain } from './query/grain';
export { getFinestLevel, isFinerLevel } from './query/levels';
export { refuseLiveQuery } from './query/refuse';
export { readRowsWithinCap, tooManyRowsError } from './query/rows';
export type { LiveQueryResult } from './query/run';

// SQL integrations reuse the warehouse query builder
export { compileMetricQuery } from '../../../queryCompiler';
export { MetricQueryBuilder } from '../../../utils/QueryBuilder/MetricQueryBuilder';
