import {
    getOverriddenChartFilterRuleIds,
    getTotalFilterRules,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type Filters,
    type SavedMergeQuery,
    type SavedMergeQuerySource,
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

const sourceExploreNameOf = (
    source: SavedMergeQuerySource,
    primaryExploreName: string | null,
): string | null =>
    source.kind === 'chart'
        ? primaryExploreName
        : source.metricQuery.exploreName;

/** Primary first, so the popover reads in the order the merge editor shows. */
const orderedSources = (merge: SavedMergeQuery): SavedMergeQuerySource[] => [
    ...merge.sources.filter((source) => source.id === merge.primarySourceId),
    ...merge.sources.filter((source) => source.id !== merge.primarySourceId),
];

const getAppliedFilterItems = ({
    appliedDashboardFilters,
    appliedDashboardFiltersBySourceId,
    merge,
    primaryExploreName,
}: {
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    merge: SavedMergeQuery | null;
    primaryExploreName: string | null;
}): AppliedDashboardFilterItem[] => {
    if (merge && appliedDashboardFiltersBySourceId) {
        return orderedSources(merge).flatMap((source) => {
            const applied = appliedDashboardFiltersBySourceId[source.id];
            if (!applied) return [];
            return rulesOf(applied).map((filterRule) => ({
                filterRule,
                sourceId: source.id,
                sourceExploreName: sourceExploreNameOf(
                    source,
                    primaryExploreName,
                ),
            }));
        });
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
    explore,
}: {
    chartFilters: Filters;
    appliedDashboardFilters: DashboardFilters | undefined;
    appliedDashboardFiltersBySourceId:
        | Record<string, DashboardFilters>
        | undefined;
    merge: SavedMergeQuery | null;
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
            primaryExploreName: explore?.name ?? null,
        }),
        chartFilterItems: getTotalFilterRules(chartFilters).map(
            (filterRule) => ({
                filterRule,
                isOverridden: overriddenChartFilterRuleIds.has(filterRule.id),
            }),
        ),
    };
};
