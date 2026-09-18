import {
    buildSavedPipeline,
    type MergeQuery,
    type SavedPipeline,
} from '@lightdash/common';
import { useMemo } from 'react';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSetup } from './useMergeSetup';

/** The pipeline a chart saves: the chart's query by reference, the rest in full. */
export const toSavedPipeline = (
    mergeQuery: MergeQuery,
    chartSourceId: string,
): SavedPipeline => buildSavedPipeline({ mergeQuery, chartSourceId });

/** Runtime and persistence consume the same validated merge definition. */
export const useSavedMerge = (): {
    pipeline: SavedPipeline | null;
    isValid: boolean;
} => {
    const { isMerging, canRun, mergeQuery, sourceNames } = useMergeSetup();
    const chartSourceId = sourceNames.nameByHandle[PRIMARY_SOURCE_ID];

    return useMemo(() => {
        if (!isMerging) return { pipeline: null, isValid: true };
        if (!canRun || !mergeQuery) return { pipeline: null, isValid: false };
        return {
            pipeline: toSavedPipeline(mergeQuery, chartSourceId),
            isValid: true,
        };
    }, [isMerging, canRun, mergeQuery, chartSourceId]);
};
