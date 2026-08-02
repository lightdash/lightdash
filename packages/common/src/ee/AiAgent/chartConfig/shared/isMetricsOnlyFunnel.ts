import { type MetricQuery } from '../../../../types/metricQuery';

// A funnel without dimensions takes its stages from the metric columns of a
// single-row result, so it needs at least two metrics to form a funnel.
export const isMetricsOnlyFunnel = (
    metricQuery: Pick<MetricQuery, 'dimensions' | 'metrics'>,
): boolean =>
    metricQuery.dimensions.length === 0 && metricQuery.metrics.length >= 2;
