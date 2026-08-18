import { type MergeQuery, type SavedMergeQuery } from '@lightdash/common';
import { useMemo } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSetup } from './useMergeSetup';

export const toSavedMerge = (
    mergeQuery: MergeQuery,
    // The source the saved chart's own metricQuery stands in for. The
    // explorer always uses its fixed primary id; AI merges name sources
    // freely, so they pass the id of the source they save as the chart.
    primarySourceId: string = PRIMARY_SOURCE_ID,
): SavedMergeQuery => {
    if (!mergeQuery.sources.some((source) => source.id === primarySourceId)) {
        throw new Error('A saved merge requires the chart query.');
    }
    return {
        primarySourceId,
        sources: mergeQuery.sources.map((source) =>
            source.id === primarySourceId
                ? {
                      id: source.id,
                      kind: 'chart' as const,
                  }
                : {
                      id: source.id,
                      kind: 'query' as const,
                      metricQuery: source.metricQuery,
                  },
        ),
        joinKey: mergeQuery.joinKey.map((part) => ({
            name: part.name,
            fieldIdBySourceId: part.fieldIdBySourceId,
        })),
        joinType: mergeQuery.joinType,
        tableCalculations: mergeQuery.tableCalculations,
    };
};

/** Runtime and persistence consume the same validated merge definition. */
export const useSavedMerge = (): {
    merge: SavedMergeQuery | null;
    isValid: boolean;
} => {
    const { isMerging, canRun, mergeQuery } = useMergeSetup();

    return useMemo(() => {
        if (!isMerging) return { merge: null, isValid: true };
        if (!canRun || !mergeQuery) return { merge: null, isValid: false };
        return { merge: toSavedMerge(mergeQuery), isValid: true };
    }, [isMerging, canRun, mergeQuery]);
};
