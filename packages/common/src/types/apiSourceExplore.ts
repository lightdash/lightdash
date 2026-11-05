import { type FieldId } from './field';
import { type FilterOperator } from './filter';
import { type ApiConnectorType } from './querySources';

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
};
