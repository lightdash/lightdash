import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type InteractivityOptions,
} from '@lightdash/common';
import { emptyDashboardFilters } from '../../features/dashboard/store';

type EmbedFilterInteractivity = Pick<Dashboard, 'filters'> &
    Pick<InteractivityOptions, 'dashboardFiltersInteractivity'>;

/** Viewers can't use any filter, so the embed's filters stay the empty sentinel */
export const isEmbedFilterInteractivityOff = (
    embedDashboard: Pick<InteractivityOptions, 'dashboardFiltersInteractivity'>,
) =>
    !embedDashboard.dashboardFiltersInteractivity ||
    getFilterInteractivityValue(
        embedDashboard.dashboardFiltersInteractivity.enabled,
    ) === FilterInteractivityValues.none;

/** Limits filters to what an embedded dashboard lets viewers interact with */
export const applyEmbedFilterInteractivity = (
    filters: DashboardFilters,
    embedDashboard: EmbedFilterInteractivity | undefined,
): DashboardFilters => {
    if (!embedDashboard) {
        return filters;
    }

    if (
        isEmbedFilterInteractivityOff(embedDashboard) ||
        !embedDashboard.dashboardFiltersInteractivity
    ) {
        return emptyDashboardFilters;
    }

    const interactivityOptions = embedDashboard.dashboardFiltersInteractivity;
    const filterInteractivityValue = getFilterInteractivityValue(
        interactivityOptions.enabled,
    );

    if (filterInteractivityValue === FilterInteractivityValues.some) {
        return {
            ...filters,
            dimensions: filters.dimensions.filter((filter) =>
                interactivityOptions.allowedFilters?.includes(filter.id),
            ),
        };
    }

    // If 'all', return filters as-is
    return filters;
};

const allRules = (filters: DashboardFilters): DashboardFilterRule[] => [
    ...filters.dimensions,
    ...filters.metrics,
    ...filters.tableCalculations,
];

/** The saved rules an embedded dashboard's token keeps out of the store */
export const getEmbedHiddenFilters = (
    embedDashboard: EmbedFilterInteractivity,
): DashboardFilterRule[] => {
    const shownIds = new Set(
        allRules(
            applyEmbedFilterInteractivity(
                embedDashboard.filters,
                embedDashboard,
            ),
        ).map(({ id }) => id),
    );
    return allRules(embedDashboard.filters).filter(
        ({ id }) => !shownIds.has(id),
    );
};
