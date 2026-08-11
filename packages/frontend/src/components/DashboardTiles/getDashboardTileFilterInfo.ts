import {
    getOverriddenChartFilterRuleIds,
    getTotalFilterRules,
    type DashboardFilters,
    type Explore,
    type Filters,
} from '@lightdash/common';

export const getDashboardTileFilterInfo = ({
    chartFilters,
    appliedDashboardFilters,
    explore,
}: {
    chartFilters: Filters;
    appliedDashboardFilters: DashboardFilters | undefined;
    explore: Explore | undefined;
}) => {
    const overriddenChartFilterRuleIds = getOverriddenChartFilterRuleIds({
        chartFilters,
        dashboardFilters: appliedDashboardFilters,
        explore,
    });

    return {
        appliedFilterRules: appliedDashboardFilters
            ? [
                  ...appliedDashboardFilters.dimensions,
                  ...appliedDashboardFilters.metrics,
              ]
            : [],
        chartFilterItems: getTotalFilterRules(chartFilters).map(
            (filterRule) => ({
                filterRule,
                isOverridden: overriddenChartFilterRuleIds.has(filterRule.id),
            }),
        ),
    };
};
