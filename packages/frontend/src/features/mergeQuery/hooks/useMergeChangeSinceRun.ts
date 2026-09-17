import { useMemo } from 'react';
import { useMergeSafe } from '../context/useMerge';
import {
    getMergeChangeSinceRun,
    type MergeChangeSinceRun,
} from '../utils/getMergeChangeSinceRun';
import { useMergeSetup } from './useMergeSetup';

/**
 * How the merge on screen differs from the one its results came from.
 *
 * `sinceResults` is against the run that produced the current results, so
 * the surface can say the results are out of date. `sinceLastRun` is against
 * the last submission, refused or not, so an automatic re-run is asked once
 * per edit rather than again after every refusal.
 */
export const useMergeChangeSinceRun = (): {
    sinceResults: MergeChangeSinceRun;
    sinceLastRun: MergeChangeSinceRun;
} => {
    const merge = useMergeSafe();
    const { mergeQuery } = useMergeSetup();
    const ranMergeQuery = merge?.mergeResults?.mergeQuery ?? null;
    const lastRunMergeQuery = merge?.lastRunMergeQuery ?? null;
    return useMemo(
        () => ({
            sinceResults:
                mergeQuery && ranMergeQuery
                    ? getMergeChangeSinceRun(ranMergeQuery, mergeQuery)
                    : 'none',
            sinceLastRun:
                mergeQuery && lastRunMergeQuery
                    ? getMergeChangeSinceRun(lastRunMergeQuery, mergeQuery)
                    : 'none',
        }),
        [mergeQuery, ranMergeQuery, lastRunMergeQuery],
    );
};
