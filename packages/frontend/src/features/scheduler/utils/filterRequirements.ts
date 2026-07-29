import {
    applyDimensionOverrides,
    getUnmetFilterRequirements,
    type DashboardFilterRule,
    type DashboardFilters,
    type UnmetFilterRequirement,
} from '@lightdash/common';

export type SchedulerFilterRequirements = {
    unmetRequirements: UnmetFilterRequirement[];
    filtersWithUnmetRequirements: DashboardFilterRule[];
};

/**
 * Filter requirements that block a delivery. Evaluates what the delivery will
 * actually run with — the saved dashboard rules overlaid with the scheduler
 * overrides — so an unmet any-of group blocks like an unmet required filter,
 * and dropping a rule from the overrides can't skip the check.
 */
export const getSchedulerFilterRequirements = (
    savedDashboardFilters: DashboardFilters | undefined,
    schedulerFilters: DashboardFilterRule[] | undefined,
): SchedulerFilterRequirements => {
    if (!savedDashboardFilters) {
        return { unmetRequirements: [], filtersWithUnmetRequirements: [] };
    }

    const effectiveFilters: DashboardFilters = {
        ...savedDashboardFilters,
        dimensions: applyDimensionOverrides(
            savedDashboardFilters,
            schedulerFilters ?? [],
        ),
    };

    const unmetRequirements = getUnmetFilterRequirements(effectiveFilters);
    const seenFilterIds = new Set<string>();
    const filtersWithUnmetRequirements = unmetRequirements
        .flatMap((requirement) =>
            requirement.type === 'single'
                ? [requirement.filter]
                : requirement.filters,
        )
        .filter((filter) => {
            if (seenFilterIds.has(filter.id)) return false;
            seenFilterIds.add(filter.id);
            return true;
        });

    return { unmetRequirements, filtersWithUnmetRequirements };
};
