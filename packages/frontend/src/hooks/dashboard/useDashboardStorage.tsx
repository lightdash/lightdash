import { DashboardFilters, DashboardTile } from '@lightdash/common';
import { useCallback, useMemo } from 'react';

const useDashboardStorage = () => {
    const storeDashboard = useCallback(
        (
            dashboardTiles: DashboardTile[],
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
                JSON.stringify(dashboardTiles),
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

    return useMemo(() => {
        return {
            storeDashboard: storeDashboard,
        };
    }, [storeDashboard]);
};

export default useDashboardStorage;
