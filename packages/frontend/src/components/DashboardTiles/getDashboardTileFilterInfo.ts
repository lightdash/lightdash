import {
    getOverriddenChartFilterRuleIds,
    getTotalFilterRules,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    getPipelineChartName,
    type Filters,
    type SavedPipeline,
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
    pipeline: SavedPipeline,
    chartExploreName: string,
): Array<{ sourceId: string; exploreName: string }> => [
    {
        sourceId: getPipelineChartName(pipeline, chartExploreName),
        exploreName: chartExploreName,
    },
    ...Object.entries(pipeline.queries).map(([name, query]) => ({
        sourceId: name,
        exploreName: query.explore,
    })),
];

const getAppliedFilterItems = ({
    appliedDashboardFilters,
    appliedDashboardFiltersBySourceId,
    pipeline,
    chartExploreName,
}: {
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    pipeline: SavedPipeline | null;
    chartExploreName: string;
}): AppliedDashboardFilterItem[] => {
    if (pipeline && appliedDashboardFiltersBySourceId) {
        return pipelineSources(pipeline, chartExploreName).flatMap(
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
    pipeline,
    chartExploreName,
    explore,
}: {
    chartFilters: Filters;
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    pipeline: SavedPipeline | null;
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
            pipeline,
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
