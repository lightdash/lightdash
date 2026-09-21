import {
    buildSavedMergeQuery,
    type MergeQuery,
    type SavedMergeQuery,
} from '@lightdash/common';
import { useMemo } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSetup } from './useMergeSetup';

/** The merge a chart saves: the chart's query by reference, the rest in full. */
export const toSavedMergeQuery = (
    mergeQuery: MergeQuery,
    chartSourceId: string,
): SavedMergeQuery => buildSavedMergeQuery(mergeQuery, chartSourceId);

/** Save using the same contract older servers accept. */
export const useSavedMerge = (): {
    merge: SavedMergeQuery | null;
    isValid: boolean;
} => {
    const { isMerging, canRun, mergeQuery, sourceNames } = useMergeSetup();
    const chartSourceId = sourceNames.nameByHandle[PRIMARY_SOURCE_ID];

    return useMemo(() => {
        if (!isMerging) return { merge: null, isValid: true };
        if (!canRun || !mergeQuery) return { merge: null, isValid: false };
        return {
            merge: toSavedMergeQuery(mergeQuery, chartSourceId),
            isValid: true,
        };
    }, [isMerging, canRun, mergeQuery, chartSourceId]);
};
