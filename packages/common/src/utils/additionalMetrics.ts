import { convertColumnMetric } from '../types/dbt';
import { type CompiledTable } from '../types/explore';
import { DimensionType, MetricType, type Metric } from '../types/field';
import {
    isPeriodOverPeriodAdditionalMetric,
    type AdditionalMetric,
} from '../types/metricQuery';

type ConvertAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    table: CompiledTable;
};

export const convertAdditionalMetric = ({
    additionalMetric,
    table,
}: ConvertAdditionalMetricArgs): Metric => {
    const metric = convertColumnMetric({
        modelName: table.name,
        dimensionSql: additionalMetric.sql,
        name: additionalMetric.name,
        metric: { ...additionalMetric, filters: undefined },
        tableLabel: table.label,
    });

    const popMetadata = isPeriodOverPeriodAdditionalMetric(additionalMetric)
        ? {
              generatedBy: 'periodOverPeriod' as const,
              baseMetricId: additionalMetric.baseMetricId,
          }
        : undefined;

    return {
        ...metric,
        ...(additionalMetric.filters && {
            filters: additionalMetric.filters,
        }),
        ...(additionalMetric.formatOptions && {
            formatOptions: additionalMetric.formatOptions,
        }),
        ...(popMetadata ?? {}),
    };
};

/**
 * Get the custom metric types for a given dimension type
 * @param type
 * @returns
 */
export const getCustomMetricType = (type: DimensionType): MetricType[] => {
    switch (type) {
        case DimensionType.STRING:
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
            return [
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
                MetricType.MIN,
                MetricType.MAX,
            ];
        case DimensionType.NUMBER:
            return [
                MetricType.MIN,
                MetricType.MAX,
                MetricType.SUM,
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
            ];
        case DimensionType.BOOLEAN:
            return [MetricType.COUNT_DISTINCT, MetricType.COUNT];
        default:
            return [];
    }
};
