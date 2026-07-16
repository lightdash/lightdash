import { type DashboardFilterRule } from '@lightdash/common';
import { useCallback } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

/**
 * Immediately applies a partial update to a saved dashboard filter
 * (dimension or metric) by id. Used by the filter-rule editors, whose edits
 * take effect without an Apply step. `isEditMode` mirrors the dashboard
 * context updaters: true for author-side editors (default), false for
 * viewer-side value setting (e.g. the guided setup card).
 */
export const useUpdateDashboardFilterRule = (options?: {
    isEditMode?: boolean;
}) => {
    const isEditMode = options?.isEditMode ?? true;
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
                    isEditMode,
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
                    isEditMode,
                );
            }
        },
        [
            dashboardFilters,
            isEditMode,
            updateDimensionDashboardFilter,
            updateMetricDashboardFilter,
        ],
    );
};
