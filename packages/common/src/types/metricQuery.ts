import { type AnyType } from './any';
import { type DateZoom } from './api/paginatedQuery';
import {
    BinType,
    friendlyName,
    isCustomBinDimension,
    isCustomDimension,
    isCustomSqlDimension,
    type CompactOrAlias,
    type CompiledCustomDimension,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTableCalculation,
    type CustomDimension,
    type CustomFormat,
    type FieldId,
    type Format,
    type Metric,
    type MetricType,
    type TableCalculation,
} from './field';
import { type Filters, type MetricFilterRule } from './filter';

export interface AdditionalMetric {
    label?: string;
    type: MetricType;
    description?: string;
    sql: string;
    hidden?: boolean;
    // @deprecated Use format expression instead
    round?: number;
    // @deprecated Use format expression instead
    compact?: CompactOrAlias;
    format?: Format | string; // // Format type is deprecated, use format expression(string) instead
    table: string;
    name: string;
    index?: number;
    filters?: MetricFilterRule[];
    baseDimensionName?: string;
    uuid?: string | null;
    percentile?: number;
    formatOptions?: CustomFormat;
}

export const isAdditionalMetric = (value: AnyType): value is AdditionalMetric =>
    value?.table &&
    value?.name &&
    !value?.fieldType &&
    !isCustomDimension(value);

export const hasFormatOptions = (
    value: AnyType,
): value is { formatOptions: CustomFormat } => !!value.formatOptions;

export const getCustomMetricDimensionId = (metric: AdditionalMetric) =>
    `${metric.table}_${metric.baseDimensionName}`;

export type MetricOverrides = { [key: string]: Pick<Metric, 'formatOptions'> }; // Don't use Record to avoid issues in TSOA

// Object used to query an explore. Queries only happen within a single explore
export type MetricQuery = {
    exploreName: string;
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: Filters;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    customDimensions?: CustomDimension[];
    metricOverrides?: MetricOverrides; // Override format options for fields in "metrics"
    timezone?: string; // Local timezone to use for the query
    metadata?: {
        hasADateDimension: Pick<CompiledDimension, 'label' | 'name' | 'table'>;
    };
};
export type CompiledMetricQuery = Omit<MetricQuery, 'customDimensions'> & {
    compiledTableCalculations: CompiledTableCalculation[];
    compiledAdditionalMetrics: CompiledMetric[];
    compiledCustomDimensions: CompiledCustomDimension[];
};
// Sort by
export type SortField = {
    fieldId: string; // Field must exist in the explore
    descending: boolean; // Direction of the sort
};

export const getAdditionalMetricLabel = (item: AdditionalMetric) =>
    `${friendlyName(item.table)} ${item.label}`;

type FilterGroupResponse =
    | {
          id: string;
          or: AnyType[];
      }
    | {
          id: string;
          and: AnyType[];
      };
export type FiltersResponse = {
    dimensions?: FilterGroupResponse;
    metrics?: FilterGroupResponse;
    tableCalculations?: FilterGroupResponse;
};
export type MetricQueryResponse = {
    exploreName: string;
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: FiltersResponse;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    customDimensions?: CustomDimension[];
    metadata?: {
        hasADateDimension: Pick<CompiledDimension, 'label' | 'name' | 'table'>;
    };
};

export const countCustomDimensionsInMetricQuery = (
    metricQuery: MetricQuery,
) => ({
    numFixedWidthBinCustomDimensions:
        metricQuery.customDimensions?.filter(
            (dimension) =>
                isCustomBinDimension(dimension) &&
                dimension.binType === BinType.FIXED_NUMBER,
        ).length || 0,
    numFixedBinsBinCustomDimensions:
        metricQuery.customDimensions?.filter(
            (dimension) =>
                isCustomBinDimension(dimension) &&
                dimension.binType === BinType.FIXED_WIDTH,
        ).length || 0,
    numCustomRangeBinCustomDimensions:
        metricQuery.customDimensions?.filter(
            (dimension) =>
                isCustomBinDimension(dimension) &&
                dimension.binType === BinType.CUSTOM_RANGE,
        ).length || 0,
    numCustomSqlDimensions:
        metricQuery.customDimensions?.filter((dimension) =>
            isCustomSqlDimension(dimension),
        ).length || 0,
});

export const hasCustomBinDimension = (metricQuery: MetricQuery | undefined) =>
    metricQuery?.customDimensions &&
    metricQuery.customDimensions.some((dimension) =>
        isCustomBinDimension(dimension),
    );

export type MetricQueryRequest = {
    // tsoa doesn't support complex types like MetricQuery, so we simplified it
    exploreName: string;
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: {
        dimensions?: AnyType;
        metrics?: AnyType;
        tableCalculations?: AnyType;
    };
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    csvLimit?: number;
    customDimensions?: CustomDimension[];
    dateZoom?: DateZoom;
    metadata?: MetricQuery['metadata'];
    timezone?: string;
    metricOverrides?: MetricOverrides;
};

export type QueryWarning = {
    message: string; // message, in markdown, to be shown to the user
    fields?: string[]; // fields that relate to this message
    tables?: string[]; // tables that relate to this message
};
