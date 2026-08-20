import {
    isMergeMetricSource,
    type MergeQuery,
    type SavedMergeQuery,
} from '@lightdash/common';
import { useMemo } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSetup } from './useMergeSetup';

export const toSavedMerge = (mergeQuery: MergeQuery): SavedMergeQuery => {
    if (!mergeQuery.sources.some((source) => source.id === PRIMARY_SOURCE_ID)) {
        throw new Error('A saved merge requires the chart query.');
    }
    return {
        primarySourceId: PRIMARY_SOURCE_ID,
        sources: mergeQuery.sources.map((source) => {
            if (source.id === PRIMARY_SOURCE_ID) {
                return {
                    id: source.id,
                    kind: 'chart' as const,
                };
            }
            // Result sources reference ephemeral query results, which a
            // saved chart cannot re-run — the editor never produces them.
            if (!isMergeMetricSource(source)) {
                throw new Error(
                    'A merge over existing query results cannot be saved to a chart.',
                );
            }
            return {
                id: source.id,
                kind: 'query' as const,
                metricQuery: source.metricQuery,
            };
        }),
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
