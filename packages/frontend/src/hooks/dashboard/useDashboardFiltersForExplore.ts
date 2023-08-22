import {
    DashboardFilterRule,
    DashboardFilters,
    Explore,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';

const useDashboardFiltersForExplore = (
    tileUuid: string | undefined,
    explore: Explore | undefined,
): DashboardFilters | undefined => {
    const { dashboardFilters, dashboardTemporaryFilters } =
        useDashboardContext();

    const tables = useMemo(
        () => (explore ? Object.keys(explore.tables) : []),
        [explore],
    );

    const overrideTileFilters = useCallback(
        (rules: DashboardFilterRule[]) =>
            !tileUuid
                ? undefined
                : rules
                      .filter((rule) => !rule.disabled)
                      .filter((f) => f.tileTargets?.[tileUuid ?? ''] ?? true)
                      .map((filter) => {
                          const { tileTargets, ...rest } = filter;
                          if (!tileTargets) return filter;

                          const tileConfig = tileTargets[tileUuid ?? ''];
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
                      .filter((f) => tables.includes(f.target.tableName)),
        [tables, tileUuid],
    );

    return useMemo(() => {
        if (!tileUuid) return undefined;

        return {
            dimensions:
                overrideTileFilters([
                    ...dashboardFilters.dimensions,
                    ...(dashboardTemporaryFilters?.dimensions ?? []),
                ]) ?? [], // TODO: check this
            metrics:
                overrideTileFilters([
                    ...dashboardFilters.metrics,
                    ...(dashboardTemporaryFilters?.metrics ?? []),
                ]) ?? [], // TODO: check this
        };
    }, [
        dashboardFilters.dimensions,
        dashboardFilters.metrics,
        dashboardTemporaryFilters?.dimensions,
        dashboardTemporaryFilters?.metrics,
        overrideTileFilters,
        tileUuid,
    ]);
};

export default useDashboardFiltersForExplore;
