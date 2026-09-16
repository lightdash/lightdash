import { type MetricQuery } from '@lightdash/common';
import { type MergeResults } from '../context/context';

/**
 * The dimensions a chart layout can reference. A merged chart names merged
 * fields, so checking its layout against the primary query's own dimensions
 * reports every one of them unused; the merged result's are the ones to use.
 */
export const getChartQueryDimensions = (
    metricQuery: Pick<MetricQuery, 'dimensions'> | undefined,
    mergeResults: Pick<MergeResults, 'metricQuery'> | null,
): string[] =>
    mergeResults?.metricQuery.dimensions ?? metricQuery?.dimensions ?? [];
