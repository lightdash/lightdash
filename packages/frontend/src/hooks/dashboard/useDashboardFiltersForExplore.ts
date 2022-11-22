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
                .filter((f) => {
                    return (
                        f.tileConfigs?.some((t) => t.tileUuid === tileUuid) ??
                        true
                    );
                })
                .map((f) => {
                    const tileConfig = f.tileConfigs?.find(
                        (t) => t.tileUuid === tileUuid,
                    );
                    if (!tileConfig) return f;

                    return {
                        ...f,
                        target: {
                            fieldId: tileConfig.fieldId,
                            tableName: tileConfig.fieldId.split('_')[0], // TODO: use a better way to get a table name
                        },
                    };
                })
                .filter((f) => tables.includes(f.target.tableName)),
        [tables, tileUuid],
    );

    return useMemo(() => {
        return {
            dimensions: overrideTileFilters([
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters.dimensions,
            ]),
            metrics: overrideTileFilters([
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters.metrics,
            ]),
        };
    }, [dashboardFilters, dashboardTemporaryFilters, overrideTileFilters]);
};

export default useDashboardFiltersForExplore;
