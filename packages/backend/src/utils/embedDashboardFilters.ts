import {
    isFilterInteractivityEnabled,
    isFilterLockedOnTab,
    stripOverridesForLockedFiltersOnTab,
    type DashboardDAO,
    type DashboardFilterInteractivityOptions,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';

export const getEffectiveEmbedDashboardFilters = (
    dashboard: Pick<DashboardDAO, 'filters' | 'tiles' | 'tabs'>,
    tileUuid: string,
    interactivity: DashboardFilterInteractivityOptions | undefined,
    requestFilters: DashboardFilters | undefined,
) => {
    const savedFilters = dashboard.filters ?? {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    };
    const tileTabUuid =
        dashboard.tiles.find((tile) => tile.uuid === tileUuid)?.tabUuid ??
        undefined;
    if (!requestFilters || !isFilterInteractivityEnabled(interactivity)) {
        return { filters: savedFilters, droppedCount: 0, tileTabUuid };
    }

    const hasTabs = (dashboard.tabs?.length ?? 0) > 0;
    const { filters: safeOverrides, droppedCount } =
        stripOverridesForLockedFiltersOnTab(
            savedFilters,
            requestFilters,
            tileTabUuid,
            hasTabs,
        );
    const keepLockedRules = (rules: DashboardFilterRule[]) =>
        rules.filter((rule) => isFilterLockedOnTab(rule, tileTabUuid, hasTabs));

    return {
        filters: {
            dimensions: [
                ...keepLockedRules(savedFilters.dimensions),
                ...safeOverrides.dimensions,
            ],
            metrics: [
                ...keepLockedRules(savedFilters.metrics),
                ...safeOverrides.metrics,
            ],
            tableCalculations: [
                ...keepLockedRules(savedFilters.tableCalculations),
                ...safeOverrides.tableCalculations,
            ],
        },
        droppedCount,
        tileTabUuid,
    };
};
