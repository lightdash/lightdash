import { type MergeQuery, type SavedMergeQuery } from '@lightdash/common';
import { useMemo } from 'react';
import { SOURCE_A } from '../constants';
import { useMergeSetup } from './useMergeSetup';

export const toSavedMerge = (mergeQuery: MergeQuery): SavedMergeQuery => {
    if (!mergeQuery.sources.some((source) => source.id === SOURCE_A)) {
        throw new Error('A saved merge requires the chart query.');
    }
    return {
        primarySourceId: mergeQuery.sources[0].id,
        sources: mergeQuery.sources.map((source) =>
            source.id === SOURCE_A
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
