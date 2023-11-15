import {
    DashboardFilters,
    Explore,
    getDashboardFilterRulesForTileAndTables,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

const useDashboardFiltersForExplore = (
    tileUuid: string,
    explore: Explore | undefined,
): DashboardFilters => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );

    const tables = useMemo(
        () => (explore ? Object.keys(explore.tables) : []),
        [explore],
    );

    return useMemo(
        () => ({
            dimensions: getDashboardFilterRulesForTileAndTables(
                tileUuid,
                tables,
                [
                    ...dashboardFilters.dimensions,
                    ...(dashboardTemporaryFilters?.dimensions ?? []),
                ],
            ),
            metrics: getDashboardFilterRulesForTileAndTables(tileUuid, tables, [
                ...dashboardFilters.metrics,
                ...(dashboardTemporaryFilters?.metrics ?? []),
            ]),
        }),
        [tileUuid, tables, dashboardFilters, dashboardTemporaryFilters],
    );
};

export default useDashboardFiltersForExplore;
