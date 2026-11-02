import { useContext, useRef, useSyncExternalStore } from 'react';
import {
    DashboardStoreContext,
    getDashboardContextView,
    useDashboardSelector,
    type DashboardStoreState,
} from '../../features/dashboard/store';
import {
    FilterFieldsOverrideContext,
    type FilterFieldsOverride,
} from './filterFieldsOverride';
import { type DashboardContextType } from './types';

type Merged = {
    view: DashboardContextType;
    override: FilterFieldsOverride;
    merged: DashboardContextType;
};

/**
 * Reads one value of the dashboard context, which is a view of the dashboard
 * store. Re-renders only when the selected value changes. Prefer
 * `useDashboardSelector` with a selector from the store for new code.
 */
function useDashboardContext<Selected>(
    selector: (value: DashboardContextType) => Selected,
) {
    const storeContext = useContext(DashboardStoreContext);
    if (storeContext === null) {
        throw new Error(
            'useDashboardContext must be used within a DashboardProvider',
        );
    }
    const view = getDashboardContextView(storeContext.store);
    const override = useContext(FilterFieldsOverrideContext);
    // One merged object per (view, override) pair, so selections stay stable
    const lastMerged = useRef<Merged | null>(null);
    return useDashboardSelector((state: DashboardStoreState) => {
        const current = view(state);
        if (override === null) return selector(current);
        if (
            lastMerged.current?.view !== current ||
            lastMerged.current.override !== override
        ) {
            lastMerged.current = {
                view: current,
                override,
                merged: { ...current, ...override },
            };
        }
        return selector(lastMerged.current.merged);
    });
}

const subscribeToNothing = () => () => {};

/** Like `useDashboardContext`, but `undefined` outside a dashboard */
export const useOptionalDashboardContext = <Selected>(
    selector: (value: DashboardContextType) => Selected,
): Selected | undefined => {
    const store = useContext(DashboardStoreContext)?.store;
    return useSyncExternalStore(
        store ? store.subscribe : subscribeToNothing,
        () =>
            store
                ? selector(getDashboardContextView(store)(store.getState()))
                : undefined,
    );
};

export default useDashboardContext;
