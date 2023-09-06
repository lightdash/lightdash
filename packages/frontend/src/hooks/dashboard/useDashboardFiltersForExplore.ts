import {
    DashboardFilterRule,
    DashboardFilters,
    Explore,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
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

    const overrideTileFilters = useCallback(
        (rules: DashboardFilterRule[]) =>
            rules
                .filter((rule) => !rule.disabled)
                .map((filter) => {
                    // If the tile isn't in the tileTarget overrides,
                    // we return the filter and don't treat this tile
                    // differently.
                    if (!filter.tileTargets?.[tileUuid]) {
                        return filter;
                    }

                    const tileConfig = filter.tileTargets[tileUuid];

                    return {
                        ...filter,
                        target: {
                            fieldId: tileConfig.fieldId,
                            tableName: tileConfig.tableName,
                        },
                    };
                })
                .filter((f): f is DashboardFilterRule => f !== null)
                .filter((f) => tables.includes(f.target.tableName)),
        [tables, tileUuid],
    );

    return useMemo(() => {
        return {
            dimensions: overrideTileFilters([
                ...dashboardFilters.dimensions,
                ...(dashboardTemporaryFilters?.dimensions ?? []),
            ]),
            metrics: overrideTileFilters([
                ...dashboardFilters.metrics,
                ...(dashboardTemporaryFilters?.metrics ?? []),
            ]),
        };
    }, [dashboardFilters, dashboardTemporaryFilters, overrideTileFilters]);
};

export default useDashboardFiltersForExplore;
