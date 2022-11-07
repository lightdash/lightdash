import { DashboardFilters, Explore } from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

const useDashboardFiltersForExplore = (
    explore: Explore | undefined,
): DashboardFilters => {
    const { dashboardFilters, dashboardTemporaryFilters } =
        useDashboardContext();

    return useMemo(() => {
        const tables = explore ? Object.keys(explore.tables) : [];
        return {
            dimensions: [
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters.dimensions,
            ].filter((filter) => tables.includes(filter.target.tableName)),
            metrics: [
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters.metrics,
            ].filter((filter) => tables.includes(filter.target.tableName)),
        };
    }, [explore, dashboardFilters, dashboardTemporaryFilters]);
};

export default useDashboardFiltersForExplore;
