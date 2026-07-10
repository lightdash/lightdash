import { type DashboardFilterRule } from '@lightdash/common';
import { useCallback } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

/**
 * Immediately applies a partial update to a saved dashboard filter
 * (dimension or metric) by id. Used by the filter-rule editors, whose edits
 * take effect without an Apply step.
 */
export const useUpdateDashboardFilterRule = () => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );

    return useCallback(
        (filterId: string, updates: Partial<DashboardFilterRule>) => {
            const dimensionIndex = dashboardFilters.dimensions.findIndex(
                (filterRule) => filterRule.id === filterId,
            );
            if (dimensionIndex >= 0) {
                updateDimensionDashboardFilter(
                    {
                        ...dashboardFilters.dimensions[dimensionIndex],
                        ...updates,
                    },
                    dimensionIndex,
                    false,
                    true,
                );
                return;
            }
            const metricIndex = dashboardFilters.metrics.findIndex(
                (filterRule) => filterRule.id === filterId,
            );
            if (metricIndex >= 0) {
                updateMetricDashboardFilter(
                    { ...dashboardFilters.metrics[metricIndex], ...updates },
                    metricIndex,
                    false,
                    true,
                );
            }
        },
        [
            dashboardFilters,
            updateDimensionDashboardFilter,
            updateMetricDashboardFilter,
        ],
    );
};
