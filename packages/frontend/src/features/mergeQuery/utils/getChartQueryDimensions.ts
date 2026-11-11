import {
    buildMergeQueryFromMergeDefinition,
    getMergedDimensionIds,
    isMetricSourcedMergeQuery,
    normalizeSavedMergeDefinition,
    type MetricQuery,
    type SavedMergeDefinition,
    type SavedMergeQuery,
} from '@lightdash/common';
import { type MergeResults } from '../context/context';

/**
 * The dimensions a chart layout can reference. A merged chart names merged
 * fields, so checking its layout against the primary query's own dimensions
 * reports every one of them unused: the merged result's are the ones to use,
 * or, before a merge has run here, those its saved definition yields.
 */
export const getChartQueryDimensions = (
    metricQuery: MetricQuery | undefined,
    mergeResults: Pick<MergeResults, 'metricQuery'> | null,
    merge: SavedMergeDefinition | SavedMergeQuery | null,
): string[] => {
    if (mergeResults) return mergeResults.metricQuery.dimensions;
    if (!metricQuery) return [];
    const definition = merge
        ? normalizeSavedMergeDefinition(merge, metricQuery)
        : null;
    if (definition) {
        const mergeQuery = buildMergeQueryFromMergeDefinition(
            metricQuery,
            definition,
        );
        if (isMetricSourcedMergeQuery(mergeQuery)) {
            return getMergedDimensionIds(mergeQuery);
        }
    }
    return metricQuery.dimensions;
};
