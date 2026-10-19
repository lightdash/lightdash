import {
    addFilterRule,
    type FilterableField,
    type Filters,
} from '@lightdash/common';
import { useCallback } from 'react';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectFilters,
    selectIsFiltersExpanded,
    useExplorerDispatch,
    useExplorerStore,
} from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeJoinPart } from '../context/context';
import { useMerge } from '../context/useMerge';
import {
    syncMergeJoinFilters,
    type FiltersBySourceId,
} from '../utils/syncMergeJoinFilters';

export const addMergeSourceFilter = ({
    sourceId,
    field,
    filtersBySourceId,
    joinParts,
}: {
    sourceId: string;
    field: FilterableField;
    filtersBySourceId: FiltersBySourceId;
    joinParts: MergeJoinPart[];
}): FiltersBySourceId => {
    const sourceFilters = filtersBySourceId[sourceId];
    if (!sourceFilters) return filtersBySourceId;

    return syncMergeJoinFilters({
        changedSourceId: sourceId,
        filtersBySourceId: {
            ...filtersBySourceId,
            [sourceId]: addFilterRule({
                filters: sourceFilters,
                field,
            }),
        },
        joinParts,
    });
};

export const useMergeSourceFilter = () => {
    const merge = useMerge();
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();

    return useCallback(
        (sourceId: string, field: FilterableField) => {
            const primaryFiltersBefore = selectFilters(store.getState());
            const filtersBySourceId: Record<string, Filters> =
                Object.fromEntries([
                    [PRIMARY_SOURCE_ID, primaryFiltersBefore],
                    ...merge.additionalSources.map((source) => [
                        source.id,
                        source.filters,
                    ]),
                ]);
            const nextFilters = addMergeSourceFilter({
                sourceId,
                field,
                filtersBySourceId,
                joinParts: merge.joinParts,
            });

            const nextPrimary = nextFilters[PRIMARY_SOURCE_ID];
            if (nextPrimary && nextPrimary !== primaryFiltersBefore) {
                dispatch(explorerActions.setFilters(nextPrimary));
            }
            merge.additionalSources.forEach((source) => {
                const nextSource = nextFilters[source.id];
                if (nextSource && nextSource !== source.filters) {
                    merge.setSourceFilters(source.id, nextSource);
                }
            });
            merge.setFocus({ kind: 'source', sourceId });

            if (!selectIsFiltersExpanded(store.getState())) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [dispatch, merge, store],
    );
};
