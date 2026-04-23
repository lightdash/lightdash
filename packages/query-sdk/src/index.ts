// Query builder
export { query } from './query';

// Drill-down helper
export { drillDown } from './drillDown';

// Client
export { createClient, LightdashClient } from './client';

// React hook
export { useLightdash } from './useLightdash';

// Provider
export { LightdashProvider, useLightdashClient } from './LightdashProvider';

// Transports
export { createApiTransport, type FetchAdapter } from './apiTransport';
export { createPostMessageTransport } from './postMessageTransport';

// Types
export type {
    AdditionalMetric,
    Column,
    CustomDimension,
    Filter,
    FilterOperator,
    FilterValue,
    FormatFunction,
    LightdashClientConfig,
    LightdashUser,
    MetricType,
    QueryDefinition,
    QueryResult,
    Row,
    Sort,
    TableCalculation,
    Transport,
    UnitOfTime,
} from './types';

export type {
    SdkFetchRequest,
    SdkFetchResponse,
    SdkReadyMessage,
} from './postMessageTransport';
