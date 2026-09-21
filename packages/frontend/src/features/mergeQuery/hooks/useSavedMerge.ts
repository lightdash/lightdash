import {
    buildSavedMergeDefinition,
    type MergeQuery,
    type SavedMergeDefinition,
} from '@lightdash/common';
import { useMemo } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSetup } from './useMergeSetup';

/** The merge a chart saves: the chart's query by reference, the rest in full. */
export const toSavedMergeDefinition = (
    mergeQuery: MergeQuery,
    chartSourceId: string,
): SavedMergeDefinition =>
    buildSavedMergeDefinition({ mergeQuery, chartSourceId });

/** Runtime and persistence consume the same validated merge definition. */
export const useSavedMerge = (): {
    merge: SavedMergeDefinition | null;
    isValid: boolean;
} => {
    const { isMerging, canRun, mergeQuery, sourceNames } = useMergeSetup();
    const chartSourceId = sourceNames.nameByHandle[PRIMARY_SOURCE_ID];

    return useMemo(() => {
        if (!isMerging) return { merge: null, isValid: true };
        if (!canRun || !mergeQuery) return { merge: null, isValid: false };
        return {
            merge: toSavedMergeDefinition(mergeQuery, chartSourceId),
            isValid: true,
        };
    }, [isMerging, canRun, mergeQuery, chartSourceId]);
};
