import { DashboardFilters, DashboardTile } from '@lightdash/common';
import { useCallback } from 'react';

const useDashboardStorage = () => {
    const getIsEditingDashboardChart = useCallback(() => {
        return (
            !!sessionStorage.getItem('fromDashboard') ||
            !!sessionStorage.getItem('dashboardUuid')
        );
    }, []);

    const clearIsEditingDashboardChart = useCallback(() => {
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
    }, []);

    const getEditingDashboardInfo = useCallback(() => {
        return {
            name: sessionStorage.getItem('fromDashboard'),
            dashboardUuid: sessionStorage.getItem('dashboardUuid'),
        };
    }, []);

    const getHasDashboardChanges = useCallback(() => {
        return JSON.parse(
            sessionStorage.getItem('getHasDashboardChanges') ?? 'false',
        );
    }, []);

    const clearDashboardStorage = useCallback(() => {
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        sessionStorage.removeItem('unsavedDashboardTiles');
        sessionStorage.removeItem('unsavedDashboardFilters');
        sessionStorage.removeItem('hasDashboardChanges');
    }, []);

    const storeDashboard = useCallback(
        (
            dashboardTiles: DashboardTile[] | undefined,
            dashboardFilters: DashboardFilters,
            haveTilesChanged: boolean,
            haveFiltersChanged: boolean,
            dashboardUuid?: string,
            dashboardName?: string,
        ) => {
            sessionStorage.setItem('fromDashboard', dashboardName ?? '');
            sessionStorage.setItem('dashboardUuid', dashboardUuid ?? '');
            sessionStorage.setItem(
                'unsavedDashboardTiles',
                JSON.stringify(dashboardTiles ?? []),
            );
            if (
                dashboardFilters.dimensions.length > 0 ||
                dashboardFilters.metrics.length > 0
            ) {
                sessionStorage.setItem(
                    'unsavedDashboardFilters',
                    JSON.stringify(dashboardFilters),
                );
            }
            sessionStorage.setItem(
                'hasDashboardChanges',
                JSON.stringify(haveTilesChanged || haveFiltersChanged),
            );
        },
        [],
    );

    return {
        storeDashboard: storeDashboard,
        clearDashboardStorage: clearDashboardStorage,
        getEditingDashboardInfo: getEditingDashboardInfo,
        getIsEditingDashboardChart: getIsEditingDashboardChart,
        clearIsEditingDashboardChart: clearIsEditingDashboardChart,
        getHasDashboardChanges: getHasDashboardChanges,
    };
};

export default useDashboardStorage;
