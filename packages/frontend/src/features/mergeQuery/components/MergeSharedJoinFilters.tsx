import { useEffect, useRef, type FC } from 'react';
import {
    explorerActions,
    selectFilters,
    useExplorerDispatch,
    useExplorerStore,
} from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeJoinPart } from '../context/context';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { applySharedJoinFilters } from '../utils/syncMergeJoinFilters';

/**
 * Gives a source the shared join-key filters once its key field is set, by
 * the user or by default. Otherwise a source added after a key filter runs
 * unfiltered until the next filter edit.
 */
export const MergeSharedJoinFilters: FC = () => {
    const merge = useMergeSafe();
    const { effectiveParts } = useMergeSetup();
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();
    const previousParts = useRef<MergeJoinPart[] | null>(null);

    useEffect(() => {
        const previous = previousParts.current;
        previousParts.current = effectiveParts;
        if (!merge || merge.readOnly || !merge.isMerging || !previous) return;
        const primaryFilters = selectFilters(store.getState());
        const filtersBySourceId = {
            [PRIMARY_SOURCE_ID]: primaryFilters,
            ...Object.fromEntries(
                merge.additionalSources.map((source) => [
                    source.id,
                    source.filters,
                ]),
            ),
        };
        const next = applySharedJoinFilters({
            filtersBySourceId,
            previousParts: previous,
            joinParts: effectiveParts,
        });
        if (next === filtersBySourceId) return;
        if (next[PRIMARY_SOURCE_ID] !== primaryFilters) {
            dispatch(explorerActions.setFilters(next[PRIMARY_SOURCE_ID]));
        }
        merge.additionalSources.forEach((source) => {
            if (next[source.id] !== source.filters) {
                merge.setSourceFilters(source.id, next[source.id]);
            }
        });
    }, [effectiveParts, merge, dispatch, store]);

    return null;
};
