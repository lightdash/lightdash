import {
    getCompatibleDashboardMetrics,
    getItemId,
    type AdditionalMetric,
} from '@lightdash/common';
import { useContext, useMemo, useSyncExternalStore } from 'react';
import {
    DashboardStoreContext,
    selectDashboardCustomMetrics,
} from '../../features/dashboard/store';
import { useExplore } from '../useExplore';

const NO_REGISTRY: AdditionalMetric[] = [];
const subscribeToNothing = () => () => {};

/**
 * Registry metrics compatible with the given Explore, ready to seed a chart
 * built inside the dashboard. Host-agnostic: reads the staged registry from
 * the dashboard store and knows nothing about who hosts the Explorer.
 * Hosts without a DashboardProvider (e.g. the AI thread editor) get no seed.
 */
export const useDashboardCustomMetricSeed = (
    exploreName: string | undefined,
) => {
    const store = useContext(DashboardStoreContext)?.store;
    const registry = useSyncExternalStore(
        store?.subscribe ?? subscribeToNothing,
        () =>
            store
                ? selectDashboardCustomMetrics(store.getState())
                : NO_REGISTRY,
    );
    const { data: explore, isInitialLoading } = useExplore(
        registry.length > 0 ? exploreName : undefined,
    );

    return useMemo(() => {
        const seededMetrics = getCompatibleDashboardMetrics(registry, explore);
        return {
            seededMetrics,
            dashboardMetricIds: new Set(seededMetrics.map(getItemId)),
            isLoading: registry.length > 0 && !!exploreName && isInitialLoading,
        };
    }, [registry, explore, exploreName, isInitialLoading]);
};
