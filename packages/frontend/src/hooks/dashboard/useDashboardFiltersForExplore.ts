import {
    DashboardFilterRule,
    DashboardFilters,
    Explore,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

function useDashboardFiltersForExplore(
    tileUuid: string | undefined,
    explore: Explore | undefined,
    failSilently: boolean = false,
): DashboardFilters | undefined {
    const dashboardContext = useDashboardContext(failSilently);

    const tables = useMemo(
        () => (explore ? Object.keys(explore.tables) : []),
        [explore],
    );

    const overrideTileFilters = useCallback(
        (rules: DashboardFilterRule[]) => {
            if (!tileUuid) return [];

            return rules
                .filter((f) => f.tileTargets?.[tileUuid] ?? true)
                .map((filter) => {
                    const { tileTargets, ...rest } = filter;
                    if (!tileTargets) return filter;

                    const tileConfig = tileTargets[tileUuid];
                    if (!tileConfig) return null;

                    return {
                        ...rest,
                        target: {
                            fieldId: tileConfig.fieldId,
                            tableName: tileConfig.tableName,
                        },
                    };
                })
                .filter((f): f is DashboardFilterRule => f !== null)
                .filter((f) => tables.includes(f.target.tableName));
        },
        [tables, tileUuid],
    );

    return useMemo(() => {
        if (!dashboardContext) return undefined;

        return {
            dimensions: overrideTileFilters([
                ...dashboardContext.dashboardFilters.dimensions,
                ...(dashboardContext.dashboardTemporaryFilters.dimensions ??
                    []),
            ]),
            metrics: overrideTileFilters([
                ...dashboardContext.dashboardFilters.metrics,
                ...(dashboardContext.dashboardTemporaryFilters?.metrics ?? []),
            ]),
        };
    }, [dashboardContext, overrideTileFilters]);
}

export default useDashboardFiltersForExplore;
