import {
    getUnaccountedDimensions,
    type MergePivot,
    type SavedMergeQuery,
} from '@lightdash/common';
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

        // Query A's pivot is derived at run time from whichever dimension the
        // join key leaves unaccounted for. Query B's cannot be — its query is
        // stored here, so the repair that made it joinable has to be stored
        // with it or the merge reloads refusing itself.
        const unaccountedB = getUnaccountedDimensions(
            {
                id: 'b',
                pivot: null,
                metricQuery: {
                    exploreName: queryB.exploreName,
                    dimensions: queryB.dimensions,
                    metrics: queryB.metrics,
                    filters: {},
                    sorts: [],
                    limit: metricQuery.limit,
                    tableCalculations: [],
                },
            },
            parts.map((part, index) => ({
                name: `k${index}`,
                fieldIdBySourceId: { b: part.fieldB },
            })),
        );
        const secondPivot: MergePivot | null =
            unaccountedB.length === 1 && pivotValues.b.length > 0
                ? {
                      fieldId: unaccountedB[0],
                      values: pivotValues.b,
                      includeNulls: false,
                  }
                : null;

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
                          values: pivotValues.a,
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
