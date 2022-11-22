import {
    DashboardFilterRule,
    DashboardFilters,
    Explore,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

const useDashboardFiltersForExplore = (
    tileUuid: string,
    explore: Explore | undefined,
): DashboardFilters => {
    const { dashboardFilters, dashboardTemporaryFilters } =
        useDashboardContext();

    const tables = explore ? Object.keys(explore.tables) : [];

    const aggregateFilters = (rules: DashboardFilterRule[]) =>
        rules
            .filter((f) => {
                return (
                    f.tileConfigs?.some((t) => t.tileUuid === tileUuid) ?? true
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
                        tableName: tileConfig.fieldId.split('_')[0],
                    },
                };
            })
            .filter((f) => tables.includes(f.target.tableName));

    return useMemo(() => {
        return {
            dimensions: aggregateFilters([
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters.dimensions,
            ]),
            metrics: aggregateFilters([
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters.metrics,
            ]),
        };
    }, [explore, dashboardFilters, dashboardTemporaryFilters]);
};

export default useDashboardFiltersForExplore;
