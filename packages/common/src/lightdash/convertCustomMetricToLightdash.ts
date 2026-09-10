import { ParameterError } from '../types/errors';
import { FilterOperator } from '../types/filter';
import { type LightdashModelMetric } from '../types/lightdashModel';
import { type AdditionalMetric } from '../types/metricQuery';
import { convertCustomMetricToDbt } from '../utils/convertCustomMetricsToYaml';

export const convertCustomMetricToLightdash = (
    metric: AdditionalMetric,
): LightdashModelMetric => {
    if (
        metric.generationType ||
        !metric.baseDimensionName ||
        !metric.sql.trim()
    ) {
        throw new ParameterError(
            `Metric ${metric.name} cannot be written back to native YAML. Only metrics based on a native dimension are supported; generated period comparisons and metrics without a base dimension are not supported.`,
        );
    }
    for (const filter of metric.filters ?? []) {
        const noValues = [
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
        ].includes(filter.operator);
        const parts = filter.target.fieldRef.split('.');
        if (
            filter.includeNull ||
            (!noValues && !filter.values?.length) ||
            (!noValues &&
                filter.operator !== FilterOperator.EQUALS &&
                filter.values!.length !== 1) ||
            (parts.length > 1 &&
                (parts.length !== 2 || parts[0] !== metric.table))
        ) {
            throw new ParameterError(
                `Filter ${filter.id} on metric ${metric.name} cannot be represented in native YAML without changing its meaning.`,
            );
        }
    }
    return {
        ...convertCustomMetricToDbt(metric),
        sql: metric.sql,
        hidden: metric.hidden,
        distinct_keys: metric.distinctKeys,
    };
};
