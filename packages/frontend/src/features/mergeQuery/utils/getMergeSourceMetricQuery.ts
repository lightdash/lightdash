import { type MetricQuery } from '@lightdash/common';
import { type MergeEditorSource } from '../context/context';

export const getMergeSourceMetricQuery = (
    source: MergeEditorSource,
    limit: number,
): MetricQuery => ({
    exploreName: source.exploreName ?? '',
    dimensions: source.dimensions,
    metrics: source.metrics,
    filters: source.filters,
    sorts: [],
    limit,
    tableCalculations: source.tableCalculations ?? [],
    additionalMetrics: source.additionalMetrics,
    customDimensions: source.customDimensions,
    metricOverrides: source.metricOverrides,
    dimensionOverrides: source.dimensionOverrides,
    timezone: source.timezone,
});
