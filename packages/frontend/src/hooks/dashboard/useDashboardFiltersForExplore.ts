import {
    DashboardFilters,
    Explore,
    getDashboardFilterRulesForTile,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

const useDashboardFiltersForExplore = (
    tileUuid: string,
    explore: Explore | undefined,
): DashboardFilters => {
    const { dashboardFilters, dashboardTemporaryFilters } =
        useDashboardContext();

    const tables = useMemo(
        () => (explore ? Object.keys(explore.tables) : []),
        [explore],
    );

    return useMemo(
        () => ({
            dimensions: getDashboardFilterRulesForTile(tileUuid, tables, [
                ...dashboardFilters.dimensions,
                ...(dashboardTemporaryFilters?.dimensions ?? []),
            ]),
            metrics: getDashboardFilterRulesForTile(tileUuid, tables, [
                ...dashboardFilters.metrics,
                ...(dashboardTemporaryFilters?.metrics ?? []),
            ]),
        }),
        [tileUuid, tables, dashboardFilters, dashboardTemporaryFilters],
    );
};

export default useDashboardFiltersForExplore;
