import {
    getDashboardFiltersForTile,
    type DashboardFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

const useDashboardFiltersForTile = (tileUuid: string): DashboardFilters => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );

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
