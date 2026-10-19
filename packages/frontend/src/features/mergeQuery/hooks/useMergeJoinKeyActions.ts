import { type Filters } from '@lightdash/common';
import { useCallback } from 'react';
import { explorerActions, useExplorerDispatch } from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { moveJoinFieldFilters } from '../utils/syncMergeJoinFilters';
import { useMergeSetup } from './useMergeSetup';

/**
 * Join key edits that keep the shared join-key filters in step, in the same
 * update as the key, so the merge never runs with a key and a stale filter.
 */
export const useMergeJoinKeyActions = () => {
    const merge = useMergeSafe();
    const dispatch = useExplorerDispatch();
    const { effectiveParts, filtersBySourceId } = useMergeSetup();

    const storeFilters = useCallback(
        (next: Record<string, Filters>) => {
            if (!merge) return;
            if (
                next[PRIMARY_SOURCE_ID] !== filtersBySourceId[PRIMARY_SOURCE_ID]
            ) {
                dispatch(explorerActions.setFilters(next[PRIMARY_SOURCE_ID]));
            }
            merge.additionalSources.forEach((source) => {
                if (next[source.id] && next[source.id] !== source.filters) {
                    merge.setSourceFilters(source.id, next[source.id]);
                }
            });
        },
        [dispatch, merge, filtersBySourceId],
    );

    const setJoinField = useCallback(
        (index: number, sourceId: string, fieldId: string | null) => {
            if (!merge) return;
            storeFilters(
                moveJoinFieldFilters({
                    filtersBySourceId,
                    effectiveParts,
                    index,
                    sourceId,
                    fieldId,
                }),
            );
            merge.setJoinField(index, sourceId, fieldId);
        },
        [storeFilters, filtersBySourceId, effectiveParts, merge],
    );

    // Filters a default gave stay with each source once the part is gone
    const removeJoinPart = useCallback(
        (index: number) => {
            if (!merge) return;
            storeFilters(filtersBySourceId);
            merge.removeJoinPart(index);
        },
        [storeFilters, filtersBySourceId, merge],
    );

    return { setJoinField, removeJoinPart };
};
