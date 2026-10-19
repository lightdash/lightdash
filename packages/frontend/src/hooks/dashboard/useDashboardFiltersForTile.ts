import {
    getDashboardFiltersForTile,
    type DashboardFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectDashboardFilters,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../../features/dashboard/store';

const useDashboardFiltersForTile = (tileUuid: string): DashboardFilters => {
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const dashboardTemporaryFilters = useDashboardTemporaryFilters();

    return useMemo(
        () =>
            getDashboardFiltersForTile(
                tileUuid,
                dashboardFilters,
                dashboardTemporaryFilters,
            ),
        [tileUuid, dashboardFilters, dashboardTemporaryFilters],
    );
};

export default useDashboardFiltersForTile;
