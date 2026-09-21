import {
    getOverriddenChartFilterRuleIds,
    getTotalFilterRules,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type Filters,
    type SavedMergeQuery,
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
const mergeSources = (
    merge: SavedMergeQuery,
    chartExploreName: string,
): Array<{ sourceId: string; exploreName: string }> =>
    [...merge.sources]
        .sort(
            (a, b) =>
                Number(b.id === merge.primarySourceId) -
                Number(a.id === merge.primarySourceId),
        )
        .map((source) => ({
            sourceId: source.id,
            exploreName:
                source.kind === 'chart'
                    ? chartExploreName
                    : source.metricQuery.exploreName,
        }));

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
    merge: SavedMergeQuery | null;
    chartExploreName: string;
}): AppliedDashboardFilterItem[] => {
    if (merge && appliedDashboardFiltersBySourceId) {
        return mergeSources(merge, chartExploreName).flatMap(
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
    merge: SavedMergeQuery | null;
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
