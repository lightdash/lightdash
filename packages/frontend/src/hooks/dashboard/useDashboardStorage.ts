import {
    type CreateDashboardChartTile,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { useCallback, useEffect, useState } from 'react';

const tilesKey = (dashboardUuid: string) =>
    `unsavedDashboardTiles:${dashboardUuid}`;
const tabsKey = (dashboardUuid: string) => `dashboardTabs:${dashboardUuid}`;
const filtersKey = (dashboardUuid: string) =>
    `unsavedDashboardFilters:${dashboardUuid}`;
const activeTabKey = (dashboardUuid: string) =>
    `activeTabUuid:${dashboardUuid}`;
const hasChangesKey = (dashboardUuid: string) =>
    `hasDashboardChanges:${dashboardUuid}`;

const getIsEditingDashboardChart = () => {
    return (
        !!sessionStorage.getItem('fromDashboard') ||
        !!sessionStorage.getItem('dashboardUuid')
    );
};

const useDashboardStorage = () => {
    const [isEditingDashboardChart, setIsEditingDashboardChart] = useState(
        getIsEditingDashboardChart(),
    );

    // Update isEditingDashboardChart when storage changes, so that NavBar can update accordingly
    useEffect(() => {
        const handleStorage = () => {
            setIsEditingDashboardChart(getIsEditingDashboardChart());
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const clearIsEditingDashboardChart = useCallback(() => {
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        // Trigger storage event to update NavBar
        window.dispatchEvent(new Event('storage'));
    }, []);

    const getEditingDashboardInfo = useCallback(() => {
        const dashboardUuid = sessionStorage.getItem('dashboardUuid');
        return {
            name: sessionStorage.getItem('fromDashboard'),
            dashboardUuid,
            activeTabUuid: dashboardUuid
                ? sessionStorage.getItem(activeTabKey(dashboardUuid))
                : null,
        };
    }, []);

    const setDashboardChartInfo = useCallback(
        (dashboardData: { name: string; dashboardUuid: string }) => {
            sessionStorage.setItem('fromDashboard', dashboardData.name);
            sessionStorage.setItem(
                'dashboardUuid',
                dashboardData.dashboardUuid,
            );
            // Trigger storage event to update NavBar
            window.dispatchEvent(new Event('storage'));
        },
        [],
    );

    const getHasDashboardChanges = useCallback(() => {
        const dashboardUuid = sessionStorage.getItem('dashboardUuid');
        if (!dashboardUuid) return false;
        try {
            return JSON.parse(
                sessionStorage.getItem(hasChangesKey(dashboardUuid)) ?? 'false',
            );
        } catch {
            return false;
        }
    }, []);

    const getDashboardActiveTabUuid = useCallback((dashboardUuid: string) => {
        return sessionStorage.getItem(activeTabKey(dashboardUuid));
    }, []);

    const clearDashboardStorage = useCallback(() => {
        const dashboardUuid = sessionStorage.getItem('dashboardUuid');
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        if (dashboardUuid) {
            sessionStorage.removeItem(tilesKey(dashboardUuid));
            sessionStorage.removeItem(tabsKey(dashboardUuid));
            sessionStorage.removeItem(filtersKey(dashboardUuid));
            sessionStorage.removeItem(activeTabKey(dashboardUuid));
            sessionStorage.removeItem(hasChangesKey(dashboardUuid));
        }
        // Trigger storage event to update NavBar
        window.dispatchEvent(new Event('storage'));
    }, []);

    const storeDashboard = useCallback(
        (
            dashboardTiles: DashboardTile[] | undefined,
            dashboardFilters: DashboardFilters,
            haveTilesChanged: boolean,
            haveFiltersChanged: boolean,
            dashboardUuid: string | undefined,
            dashboardName: string | undefined,
            activeTabUuid?: string,
            dashboardTabs?: DashboardTab[],
        ) => {
            if (!dashboardUuid) return;
            sessionStorage.setItem('fromDashboard', dashboardName ?? '');
            sessionStorage.setItem('dashboardUuid', dashboardUuid);
            sessionStorage.setItem(
                tilesKey(dashboardUuid),
                JSON.stringify(dashboardTiles ?? []),
            );
            if (dashboardTabs && dashboardTabs.length > 0) {
                sessionStorage.setItem(
                    tabsKey(dashboardUuid),
                    JSON.stringify(dashboardTabs),
                );
            }
            if (
                dashboardFilters.dimensions.length > 0 ||
                dashboardFilters.metrics.length > 0
            ) {
                sessionStorage.setItem(
                    filtersKey(dashboardUuid),
                    JSON.stringify(dashboardFilters),
                );
            }
            sessionStorage.setItem(
                hasChangesKey(dashboardUuid),
                JSON.stringify(haveTilesChanged || haveFiltersChanged),
            );
            if (activeTabUuid) {
                sessionStorage.setItem(
                    activeTabKey(dashboardUuid),
                    activeTabUuid,
                );
            }
            // Trigger storage event to update NavBar
            window.dispatchEvent(new Event('storage'));
        },
        [],
    );

    const getUnsavedDashboardTiles = useCallback(
        (dashboardUuid: string): DashboardTile[] => {
            try {
                return JSON.parse(
                    sessionStorage.getItem(tilesKey(dashboardUuid)) ?? '[]',
                );
            } catch {
                return [];
            }
        },
        [],
    );

    const setUnsavedDashboardTiles = useCallback(
        (
            dashboardUuid: string,
            unsavedDashboardTiles: Array<
                DashboardTile | CreateDashboardChartTile
            >,
        ) => {
            sessionStorage.setItem(
                tilesKey(dashboardUuid),
                JSON.stringify(unsavedDashboardTiles),
            );
        },
        [],
    );

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
    };
};

export default useDashboardStorage;
