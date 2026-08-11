import { type MergePivot, type SavedMergeQuery } from '@lightdash/common';
import { useMemo } from 'react';
import { selectMetricQuery, useExplorerSelector } from '../../explorer/store';
import { useMerge } from '../context/useMerge';

/**
 * The chart's merge in the shape it is stored in, or null when the chart has
 * no merge or the one being built is not yet complete.
 *
 * Merge state lives outside the explorer store, so the save paths have to ask
 * for it rather than finding it on the chart version they already hold. A
 * half-built merge returns null: saving a relationship with a missing side
 * would produce a chart that cannot be run.
 */
export const useSavedMerge = (): SavedMergeQuery | null => {
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const {
        isMerging,
        queryB,
        joinParts,
        joinType,
        pivotValues,
        postPivotIndex,
    } = useMerge();

    return useMemo(() => {
        if (!isMerging || !queryB.exploreName || queryB.metrics.length === 0) {
            return null;
        }

        const parts = joinParts
            .map((part, index) => ({
                fieldA:
                    part.fieldA ??
                    (index === 0 ? (metricQuery.dimensions[0] ?? null) : null),
                fieldB:
                    part.fieldB ??
                    (index === 0 ? (queryB.dimensions[0] ?? null) : null),
            }))
            .filter(
                (part): part is { fieldA: string; fieldB: string } =>
                    !!part.fieldA && !!part.fieldB,
            );
        if (parts.length === 0) return null;

        // The chart's own pivot is derived at run time from whichever dimension
        // the join key leaves unaccounted for, so it is not stored here — only
        // the second query's is, because that one is chosen deliberately.
        const secondPivot: MergePivot | null = null;

        return {
            secondQuery: {
                metricQuery: {
                    exploreName: queryB.exploreName,
                    dimensions: queryB.dimensions,
                    metrics: queryB.metrics,
                    filters: {},
                    sorts: [],
                    limit: metricQuery.limit,
                    tableCalculations: [],
                },
                pivot: secondPivot,
            },
            joinKey: parts.map((part, index) => ({
                name: `k${index}`,
                chartFieldId: part.fieldA,
                secondFieldId: part.fieldB,
            })),
            joinType,
            postPivot:
                postPivotIndex !== null && parts[postPivotIndex]
                    ? {
                          keyName: `k${postPivotIndex}`,
                          values: pivotValues,
                          includeNulls: false,
                      }
                    : null,
            tableCalculations: [],
        };
    }, [
        isMerging,
        queryB,
        joinParts,
        joinType,
        pivotValues,
        postPivotIndex,
        metricQuery.dimensions,
        metricQuery.limit,
    ]);
};
