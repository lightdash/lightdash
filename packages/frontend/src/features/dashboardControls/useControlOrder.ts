import { useCallback } from 'react';
import {
    dashboardEditActions,
    selectOrderedControls,
    useDashboardStore,
    type DashboardStoreState,
} from '../dashboard/store';
import { placeSectionChanges, toControlRefs } from './sections';

/**
 * After a write that may change sections, from the store state before it:
 * every section change is a reorder, written with the change
 */
export const useOrderSectionChanges = () => {
    const store = useDashboardStore();
    return useCallback(
        (before: DashboardStoreState) => {
            const previous = selectOrderedControls(before);
            const next = placeSectionChanges(
                previous,
                selectOrderedControls(store.getState()),
            );
            if (next !== previous)
                store.dispatch(
                    dashboardEditActions.arrangeControls(toControlRefs(next)),
                );
        },
        [store],
    );
};
