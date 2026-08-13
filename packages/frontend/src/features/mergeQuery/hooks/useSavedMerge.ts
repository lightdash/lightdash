import { type MergeQuery, type SavedMergeQuery } from '@lightdash/common';
import { useMemo } from 'react';
import { SOURCE_A, SOURCE_B } from '../constants';
import { useMergeSetup } from './useMergeSetup';

export const toSavedMerge = (mergeQuery: MergeQuery): SavedMergeQuery => {
    const secondQuery = mergeQuery.sources.find(
        (source) => source.id === SOURCE_B,
    );
    if (!secondQuery) {
        throw new Error('A saved merge requires Query B.');
    }

    return {
        secondQuery: { metricQuery: secondQuery.metricQuery },
        joinKey: mergeQuery.joinKey.map((part) => ({
            name: part.name,
            chartFieldId: part.fieldIdBySourceId[SOURCE_A],
            secondFieldId: part.fieldIdBySourceId[SOURCE_B],
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
