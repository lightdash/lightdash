import {
    getOverriddenChartFilterRuleIds,
    getTotalFilterRules,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    getMergeDefinitionChartName,
    type Filters,
    type SavedMergeDefinition,
} from '@lightdash/common';

export type AppliedDashboardFilterItem = {
    filterRule: DashboardFilterRule;
    /** Merge source the filter was pushed into; null on an ordinary tile. */
    sourceId: string | null;
    /** Explore of that source, for labelling; null on an ordinary tile. */
    sourceExploreName: string | null;
};

const rulesOf = (filters: DashboardFilters): DashboardFilterRule[] => [
    ...filters.dimensions,
    ...filters.metrics,
];

/** The merge's sources as they ran, chart first: the order the editor shows. */
const pipelineSources = (
    merge: SavedMergeDefinition,
    chartExploreName: string,
): Array<{ sourceId: string; exploreName: string }> => [
    {
        sourceId: getMergeDefinitionChartName(merge, chartExploreName),
        exploreName: chartExploreName,
    },
    ...Object.entries(merge.queries).map(([name, query]) => ({
        sourceId: name,
        exploreName: query.explore,
    })),
];

const getAppliedFilterItems = ({
    appliedDashboardFilters,
    appliedDashboardFiltersBySourceId,
    merge,
    chartExploreName,
}: {
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    merge: SavedMergeDefinition | null;
    chartExploreName: string;
}): AppliedDashboardFilterItem[] => {
    if (merge && appliedDashboardFiltersBySourceId) {
        return pipelineSources(merge, chartExploreName).flatMap(
            ({ sourceId, exploreName }) => {
                const applied = appliedDashboardFiltersBySourceId[sourceId];
                if (!applied) return [];
                return rulesOf(applied).map((filterRule) => ({
                    filterRule,
                    sourceId,
                    sourceExploreName: exploreName,
                }));
            },
        );
    }
    return appliedDashboardFilters
        ? rulesOf(appliedDashboardFilters).map((filterRule) => ({
              filterRule,
              sourceId: null,
              sourceExploreName: null,
          }))
        : [];
};

export const getDashboardTileFilterInfo = ({
    chartFilters,
    appliedDashboardFilters,
    appliedDashboardFiltersBySourceId,
    merge,
    chartExploreName,
    explore,
}: {
    chartFilters: Filters;
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    merge: SavedMergeDefinition | null;
    /** The chart's own explore; it names the chart's query in the merge. */
    chartExploreName: string;
    explore: Explore | undefined;
}) => {
    const overriddenChartFilterRuleIds = getOverriddenChartFilterRuleIds({
        chartFilters,
        dashboardFilters: appliedDashboardFilters,
        explore,
    });

    return {
        appliedFilterItems: getAppliedFilterItems({
            appliedDashboardFilters,
            appliedDashboardFiltersBySourceId,
            merge,
            chartExploreName,
        }),
        chartFilterItems: getTotalFilterRules(chartFilters).map(
            (filterRule) => ({
                filterRule,
                isOverridden: overriddenChartFilterRuleIds.has(filterRule.id),
            }),
        ),
    };
};
