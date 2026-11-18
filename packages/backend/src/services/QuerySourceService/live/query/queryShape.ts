import {
    flattenFilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';

const MAX_FIELD_IDS = 10;
const MAX_FIELD_ID_LENGTH = 80;

/**
 * What a live data source query asked for, without anything a customer typed:
 * field ids, filter operators and counts. Filter values and custom SQL stay
 * out, so it is safe to send to analytics.
 */
export type LiveQueryShape = {
    dimensions: string[];
    metrics: string[];
    filters: { fieldId: string; operator: string; valueCount: number }[];
    sorts: number;
    limit: number;
    customMetrics: number;
    customDimensions: number;
    tableCalculations: number;
    pivot: boolean;
    dateZoom: string | null;
};

const fieldIds = (ids: string[]) =>
    ids.slice(0, MAX_FIELD_IDS).map((id) => id.slice(0, MAX_FIELD_ID_LENGTH));

export const getLiveQueryShape = (
    metricQuery: MetricQuery,
    options: { isPivoted: boolean; dateZoomGranularity?: string | null },
): LiveQueryShape => {
    const rules: FilterRule[] = [
        metricQuery.filters.dimensions,
        metricQuery.filters.metrics,
    ].flatMap((group) => (group ? flattenFilterGroup(group) : []));
    return {
        dimensions: fieldIds(metricQuery.dimensions),
        metrics: fieldIds(metricQuery.metrics),
        filters: rules.slice(0, MAX_FIELD_IDS).map((rule) => ({
            fieldId: rule.target.fieldId.slice(0, MAX_FIELD_ID_LENGTH),
            operator: rule.operator,
            valueCount: rule.values?.length ?? 0,
        })),
        sorts: metricQuery.sorts.length,
        limit: metricQuery.limit,
        customMetrics: metricQuery.additionalMetrics?.length ?? 0,
        customDimensions: metricQuery.customDimensions?.length ?? 0,
        tableCalculations: metricQuery.tableCalculations.length,
        pivot: options.isPivoted,
        dateZoom: options.dateZoomGranularity ?? null,
    };
};
