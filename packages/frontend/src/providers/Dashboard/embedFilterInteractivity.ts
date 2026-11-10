import {
    FilterInteractivityValues,
    getFilterInteractivityValue,
    type Dashboard,
    type DashboardFilters,
    type InteractivityOptions,
} from '@lightdash/common';
import { emptyDashboardFilters } from '../../features/dashboard/store';

/** Limits filters to what an embedded dashboard lets viewers interact with */
export const applyEmbedFilterInteractivity = (
    filters: DashboardFilters,
    embedDashboard: (Dashboard & InteractivityOptions) | undefined,
): DashboardFilters => {
    if (!embedDashboard) {
        return filters;
    }

    if (!embedDashboard.dashboardFiltersInteractivity) {
        return emptyDashboardFilters;
    }

    const interactivityOptions = embedDashboard.dashboardFiltersInteractivity;
    const filterInteractivityValue = getFilterInteractivityValue(
        interactivityOptions.enabled,
    );

    if (filterInteractivityValue === FilterInteractivityValues.none) {
        return emptyDashboardFilters;
    }

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
