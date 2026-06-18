import { convertColumnMetric } from '../types/dbt';
import { type CompiledTable } from '../types/explore';
import {
    DimensionType,
    getMinMaxBaseDimensionMetadata,
    MetricType,
    type Metric,
} from '../types/field';
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
        ? additionalMetric
        : undefined;

    // A MIN/MAX custom metric carries its base dimension's temporal type,
    // resolved from baseDimensionName (the UI builds `sql` from that dimension).
    const baseDimension = additionalMetric.baseDimensionName
        ? table.dimensions[additionalMetric.baseDimensionName]
        : undefined;
    const baseDimensionMetadata = getMinMaxBaseDimensionMetadata(
        additionalMetric.type,
        baseDimension && {
            type: baseDimension.type,
            timeInterval: baseDimension.timeInterval,
        },
    );

    return {
        ...metric,
        ...baseDimensionMetadata,
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
