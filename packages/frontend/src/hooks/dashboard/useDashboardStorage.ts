import {
    type CreateDashboardChartTile,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { useCallback, useSyncExternalStore } from 'react';
import {
    dashboardEditingActions,
    dashboardEditingStore,
} from '../../features/dashboard/store';

const getIsEditingDashboardChart = () => {
    const { dashboardName, dashboardUuid } =
        dashboardEditingStore.getState().dashboardEditing;
    return dashboardName !== null || dashboardUuid !== null;
};

const getIsEditingDashboardChartSnapshot = () => getIsEditingDashboardChart();

const useDashboardStorage = () => {
    const isEditingDashboardChart = useSyncExternalStore(
        dashboardEditingStore.subscribe,
        getIsEditingDashboardChartSnapshot,
    );

    const clearIsEditingDashboardChart = useCallback(() => {
        dashboardEditingStore.dispatch(
            dashboardEditingActions.clearChartInfo(),
        );
    }, []);

    const getEditingDashboardInfo = useCallback(() => {
        const { dashboardName, dashboardUuid, activeTabUuid } =
            dashboardEditingStore.getState().dashboardEditing;
        return {
            name: dashboardName,
            dashboardUuid,
            activeTabUuid,
        };
    }, []);

    const setDashboardChartInfo = useCallback(
        (dashboardData: { name: string; dashboardUuid: string }) => {
            dashboardEditingStore.dispatch(
                dashboardEditingActions.setChartInfo(dashboardData),
            );
        },
        [],
    );

    const getHasDashboardChanges = useCallback(() => {
        return dashboardEditingStore.getState().dashboardEditing.hasChanges;
    }, []);

    const getDashboardActiveTabUuid = useCallback(() => {
        return dashboardEditingStore.getState().dashboardEditing.activeTabUuid;
    }, []);

    const clearDashboardStorage = useCallback(() => {
        dashboardEditingStore.dispatch(dashboardEditingActions.clearAll());
    }, []);

    const storeDashboard = useCallback(
        (
            dashboardTiles: DashboardTile[] | undefined,
            dashboardFilters: DashboardFilters,
            haveTilesChanged: boolean,
            haveFiltersChanged: boolean,
            dashboardUuid?: string,
            dashboardName?: string,
            activeTabUuid?: string,
            dashboardTabs?: DashboardTab[],
        ) => {
            const hasFilters =
                dashboardFilters.dimensions.length > 0 ||
                dashboardFilters.metrics.length > 0;

            dashboardEditingStore.dispatch(
                dashboardEditingActions.storeDashboard({
                    dashboardName: dashboardName ?? '',
                    dashboardUuid: dashboardUuid ?? '',
                    unsavedTiles: dashboardTiles ?? [],
                    unsavedFilters: hasFilters ? dashboardFilters : null,
                    tabs:
                        dashboardTabs && dashboardTabs.length > 0
                            ? dashboardTabs
                            : null,
                    hasChanges: haveTilesChanged || haveFiltersChanged,
                    activeTabUuid: activeTabUuid ?? null,
                }),
            );
        },
        [],
    );

    const getUnsavedDashboardTiles = useCallback((): DashboardTile[] => {
        return (dashboardEditingStore.getState().dashboardEditing
            .unsavedTiles ?? []) as DashboardTile[];
    }, []);

    const setUnsavedDashboardTiles = useCallback(
        (
            unsavedDashboardTiles: DashboardTile[] | CreateDashboardChartTile[],
        ) => {
            dashboardEditingStore.dispatch(
                dashboardEditingActions.setUnsavedTiles(unsavedDashboardTiles),
            );
        },
        [],
    );

    const getUnsavedDashboardFilters =
        useCallback((): DashboardFilters | null => {
            return dashboardEditingStore.getState().dashboardEditing
                .unsavedFilters;
        }, []);

    const getUnsavedDashboardTabs = useCallback((): DashboardTab[] | null => {
        return dashboardEditingStore.getState().dashboardEditing.tabs;
    }, []);

    return {
        storeDashboard,
        clearDashboardStorage,
        isEditingDashboardChart,
        getIsEditingDashboardChart,
        getEditingDashboardInfo,
        setDashboardChartInfo,
        clearIsEditingDashboardChart,
        getHasDashboardChanges,
        getUnsavedDashboardTiles,
        setUnsavedDashboardTiles,
        getDashboardActiveTabUuid,
        getUnsavedDashboardFilters,
        getUnsavedDashboardTabs,
    };
};

export default useDashboardStorage;
