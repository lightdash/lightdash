import { useCallback } from 'react';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from './useMergeSetup';

/**
 * Join key edits that keep every source's filters as they run. A filter a
 * default join field took is derived, not stored, so it is stored before the
 * edit can take that default away; nothing moves between fields.
 */
export const useMergeJoinKeyActions = () => {
    const merge = useMergeSafe();
    const { filtersBySourceId } = useMergeSetup();

    const storeRunningFilters = useCallback(() => {
        merge?.additionalSources.forEach((source) => {
            const running = filtersBySourceId[source.id];
            if (running && running !== source.filters) {
                merge.setSourceFilters(source.id, running);
            }
        });
    }, [merge, filtersBySourceId]);

    const setJoinField = useCallback(
        (index: number, sourceId: string, fieldId: string | null) => {
            if (!merge) return;
            storeRunningFilters();
            merge.setJoinField(index, sourceId, fieldId);
        },
        [merge, storeRunningFilters],
    );

    const removeJoinPart = useCallback(
        (index: number) => {
            if (!merge) return;
            storeRunningFilters();
            merge.removeJoinPart(index);
        },
        [merge, storeRunningFilters],
    );

    return { setJoinField, removeJoinPart };
};
