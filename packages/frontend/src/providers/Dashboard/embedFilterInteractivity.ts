import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type Dashboard,
    type DashboardFilters,
    type InteractivityOptions,
} from '@lightdash/common';
import { emptyDashboardFilters } from '../../features/dashboard/store';

/** Viewers can't use any filter, so the embed's filters stay the empty sentinel */
export const isEmbedFilterInteractivityOff = (
    embedDashboard: Dashboard & InteractivityOptions,
) =>
    !embedDashboard.dashboardFiltersInteractivity ||
    getFilterInteractivityValue(
        embedDashboard.dashboardFiltersInteractivity.enabled,
    ) === FilterInteractivityValues.none;

/** Limits filters to what an embedded dashboard lets viewers interact with */
export const applyEmbedFilterInteractivity = (
    filters: DashboardFilters,
    embedDashboard: (Dashboard & InteractivityOptions) | undefined,
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
