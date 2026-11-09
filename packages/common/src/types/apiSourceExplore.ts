import { type DimensionType, type FieldId } from './field';
import { type FilterOperator } from './filter';
import { type ApiConnectorType } from './querySources';
import { type TimeFrames } from './timeFrames';

/**
 * How a live data source answers a query feature: `native` compiles it into
 * the API call, `refused` rejects the query. `local` (computing it on the
 * returned rows) is reserved for later and no connector uses it yet.
 */
export type ApiSourcePushdown = 'native' | 'refused' | 'local';

/** A field's type for filter operators: a dimension type, or any metric. */
export type ApiSourceFilterFieldType = DimensionType | 'metric';

/**
 * Whether a metric's values can be summed when rows are re-grouped. A wrong
 * tag puts wrong numbers in saved charts, so tags follow the API's docs and
 * anything unlisted is `non_additive`.
 */
export type ApiSourceMetricAggregation =
    | { aggregation: 'additive' }
    /** Recomputed as sum(numerator) / sum(denominator); both are metric names. */
    | { aggregation: 'ratio'; numerator: string; denominator: string }
    | { aggregation: 'non_additive' };

/**
 * What a live data source connector can do with a metric query. Each
 * connector declares one; the shared check (`getApiSourceQueryIssues`) and
 * the Explore controls read it. Combination rules (GA4 scopes) and size
 * limits are per explore, not capabilities.
 */
export type ApiSourceCapabilities = {
    filters: {
        /** Operators per field type; a type without an entry can't be filtered. */
        operators: Partial<Record<ApiSourceFilterFieldType, FilterOperator[]>>;
        /** One filter can match any of several values (an IN list). */
        multipleValues: boolean;
        or: boolean;
        nestedGroups: boolean;
    };
    metricFilters: boolean;
    dates: {
        /** The API reads the date filter as one range, ANDed with the other filters. */
        rangeRequired: boolean;
        operators: FilterOperator[];
        /** Grains the API groups dates by natively, each a field of the explore. */
        grains: TimeFrames[];
        /** `fixed`: the API reports in its own time zone, whatever the query asks. */
        timezone: 'fixed' | 'configurable';
        maxLookbackDays?: number;
    };
    pushdown: {
        tableCalculations: ApiSourcePushdown;
        customDimensions: ApiSourcePushdown;
        customMetrics: ApiSourcePushdown;
        pivots: ApiSourcePushdown;
        periodOverPeriod: ApiSourcePushdown;
        /** Re-grouping the date at query time, which rewrites its SQL. */
        dateZoom: ApiSourcePushdown;
    };
    /** Keyed by semantic-layer field name (`sessions`), not field id. */
    metrics: Record<string, ApiSourceMetricAggregation>;
};

/** What the API can do with one field of a live data source explore. */
export type ApiSourceFieldRule = {
    /** The API's own name for the field, e.g. GA4 `sessionDefaultChannelGroup`. */
    apiName: string;
    /** Empty when the API can't filter on the field. */
    filterOperators: FilterOperator[];
};

/** Fields the API refuses to return in the same query. */
export type ApiSourceIncompatibility = {
    fields: FieldId[];
    with: FieldId[];
    reason: string;
};

/**
 * Present on every `ExploreType.API_SOURCE` explore: which live data source it
 * reads and the rules a metric query must follow to compile into one API call.
 */
export type ApiSourceExplore = {
    connectionUuid: string;
    integration: ApiConnectorType;
    /** Version of the integration's semantic layer that built the explore. */
    baseVersion: number;
    filterGroups: {
        or: boolean;
        nested: boolean;
    };
    maxDimensions: number | null;
    maxMetrics: number | null;
    /** The API needs a date range; queries without a filter on `fieldId` use the last `defaultDays`. */
    dateRange: {
        fieldId: FieldId;
        defaultDays: number;
    } | null;
    fields: Record<FieldId, ApiSourceFieldRule>;
    incompatible: ApiSourceIncompatibility[];
    /**
     * Absent on explores built before connectors declared capabilities;
     * read it with `getApiSourceCapabilities`, which fills the gap.
     */
    capabilities?: ApiSourceCapabilities;
};
