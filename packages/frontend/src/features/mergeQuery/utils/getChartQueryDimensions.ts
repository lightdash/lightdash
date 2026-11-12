import {
    buildMergeQueryFromMergeDefinition,
    getMergedDimensionIds,
    isMetricSourcedMergeQuery,
    type MetricQuery,
    type SavedMergeDefinition,
} from '@lightdash/common';
import { type MergeResults } from '../context/context';

/** The dimensions a chart layout can reference: a merged chart names merged fields, from its run or its saved merge. */
export const getChartQueryDimensions = (
    metricQuery: MetricQuery | undefined,
    mergeResults: Pick<MergeResults, 'metricQuery'> | null,
    merge: SavedMergeDefinition | null,
): string[] => {
    if (mergeResults) return mergeResults.metricQuery.dimensions;
    if (!metricQuery) return [];
    if (merge) {
        const mergeQuery = buildMergeQueryFromMergeDefinition(
            metricQuery,
            merge,
        );
        if (isMetricSourcedMergeQuery(mergeQuery)) {
            return getMergedDimensionIds(mergeQuery);
        }
    }
    return metricQuery.dimensions;
};
