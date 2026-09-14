import {
    addDashboardFiltersToMetricQuery,
    addFiltersToMetricQuery,
    getAvailableFilterFieldIds,
    getDashboardFilterRulesForTables,
    getDashboardFiltersForTile,
    getFilterRulesFromGroup,
    isAndFilterGroup,
    isFilterGroup,
    isMergeMetricSource,
    MERGE_TABLE_NAME,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type Filters,
    type MergeQuery,
    type MergeQuerySource,
} from '@lightdash/common';

/** Explores of the merge's metric sources, keyed by source id. */
export type MergeSourceExplores = Record<string, Explore>;

export type MergeDashboardFiltersResult = {
    mergeQuery: MergeQuery;
    /** Every rule that applied to at least one source: the existing tile echo. */
    appliedDashboardFilters: DashboardFilters;
    /** The same rules, keyed by the source they were pushed into. */
    appliedDashboardFiltersBySourceId: Record<string, DashboardFilters>;
    /**
     * Rules that target a merged output column rather than a source field.
     * The merge has no post-join filter stage, so they are refused instead of
     * silently ignored; rules matching neither are dropped like any tile.
     */
    refusedDashboardFilters: DashboardFilterRule[];
};

/** Field ids the merged result exposes, derived the way compilation names them. */
export const getMergeOutputFieldIds = (mergeQuery: MergeQuery): Set<string> =>
    new Set([
        ...mergeQuery.joinKey.map((part) => `${MERGE_TABLE_NAME}_${part.name}`),
        ...mergeQuery.sources.flatMap((source) =>
            isMergeMetricSource(source)
                ? [
                      ...source.metricQuery.metrics,
                      ...source.metricQuery.tableCalculations.map(
                          (calculation) => calculation.name,
                      ),
                  ].map((fieldId) => `${source.id}_${fieldId}`)
                : [],
        ),
        ...mergeQuery.tableCalculations.map(
            (calculation) => `${MERGE_TABLE_NAME}_${calculation.name}`,
        ),
    ]);

const uniqueRules = (rules: DashboardFilterRule[]): DashboardFilterRule[] =>
    rules.filter(
        (rule, index) => rules.findIndex((r) => r.id === rule.id) === index,
    );

const unionDashboardFilters = (
    bySourceId: Record<string, DashboardFilters>,
): DashboardFilters => {
    const all = Object.values(bySourceId);
    return {
        dimensions: uniqueRules(all.flatMap((f) => f.dimensions)),
        metrics: uniqueRules(all.flatMap((f) => f.metrics)),
        tableCalculations: uniqueRules(all.flatMap((f) => f.tableCalculations)),
    };
};

const filtersForExplore = (
    explore: Explore,
    rules: DashboardFilters,
): DashboardFilters => {
    const availableFieldIds = getAvailableFilterFieldIds(explore);
    return {
        dimensions: getDashboardFilterRulesForTables(
            availableFieldIds,
            rules.dimensions,
        ),
        metrics: getDashboardFilterRulesForTables(
            availableFieldIds,
            rules.metrics,
        ),
        tableCalculations: getDashboardFilterRulesForTables(
            availableFieldIds,
            rules.tableCalculations,
        ),
    };
};

/**
 * Pushes a tile's dashboard filters down into every source that has the
 * field, before the join, with the semantics an ordinary tile gets: dimension
 * filters as WHERE, metric filters as HAVING, same-field dashboard filters
 * overriding chart filters. A join-key filter therefore reaches every side
 * and the join stays aligned. Result sources are already materialized and
 * cannot be re-filtered, so they are left untouched.
 *
 * `tileUuid` is null when the filters were not authored against a tile (a
 * data-app chart), in which case tile targets are not consulted.
 */
export const applyDashboardFiltersToMergeQuery = ({
    tileUuid,
    mergeQuery,
    dashboardFilters,
    exploreBySourceId,
}: {
    tileUuid: string | null;
    mergeQuery: MergeQuery;
    dashboardFilters: DashboardFilters;
    exploreBySourceId: MergeSourceExplores;
}): MergeDashboardFiltersResult => {
    const tileFilters =
        tileUuid === null
            ? dashboardFilters
            : getDashboardFiltersForTile(tileUuid, dashboardFilters);

    const appliedDashboardFiltersBySourceId: Record<string, DashboardFilters> =
        {};
    const sources = mergeQuery.sources.map((source): MergeQuerySource => {
        const explore = isMergeMetricSource(source)
            ? exploreBySourceId[source.id]
            : undefined;
        if (!isMergeMetricSource(source) || explore === undefined) {
            return source;
        }
        const applied = filtersForExplore(explore, tileFilters);
        appliedDashboardFiltersBySourceId[source.id] = applied;
        if (
            applied.dimensions.length === 0 &&
            applied.metrics.length === 0 &&
            applied.tableCalculations.length === 0
        ) {
            return source;
        }
        return {
            ...source,
            metricQuery: addDashboardFiltersToMetricQuery(
                source.metricQuery,
                applied,
                explore,
            ),
        };
    });

    const appliedDashboardFilters = unionDashboardFilters(
        appliedDashboardFiltersBySourceId,
    );
    const appliedIds = new Set(
        [
            ...appliedDashboardFilters.dimensions,
            ...appliedDashboardFilters.metrics,
            ...appliedDashboardFilters.tableCalculations,
        ].map((rule) => rule.id),
    );
    const outputFieldIds = getMergeOutputFieldIds(mergeQuery);
    const refusedDashboardFilters = [
        ...tileFilters.dimensions,
        ...tileFilters.metrics,
        ...tileFilters.tableCalculations,
    ].filter(
        (rule) =>
            !appliedIds.has(rule.id) && outputFieldIds.has(rule.target.fieldId),
    );

    return {
        mergeQuery: { ...mergeQuery, sources },
        appliedDashboardFilters,
        appliedDashboardFiltersBySourceId,
        refusedDashboardFilters,
    };
};

/** The message a refused merged-column filter surfaces with. */
export const formatRefusedMergeDashboardFilters = (
    refused: DashboardFilterRule[],
): string =>
    `This merged chart cannot apply the dashboard filter on ${refused
        .map((rule) => rule.label ?? rule.target.fieldId)
        .join(
            ', ',
        )}: it targets a merged column, and merged charts can only be filtered on their sources' fields. Remove it from this tile.`;

/**
 * Keeps the part of a filter group a source can evaluate. AND members are
 * independent narrowings, so unknown ones drop out; an OR group is one
 * predicate, so it is kept whole or not at all.
 */
const pruneFilterGroup = (
    group: FilterGroup | undefined,
    availableFieldIds: Set<string>,
): FilterGroup | undefined => {
    if (group === undefined) return undefined;
    if (!isAndFilterGroup(group)) {
        const resolvable = getFilterRulesFromGroup(group).every((rule) =>
            availableFieldIds.has(rule.target.fieldId),
        );
        return resolvable ? group : undefined;
    }
    const and = group.and.flatMap((item): FilterGroupItem[] => {
        if (isFilterGroup(item)) {
            const pruned = pruneFilterGroup(item, availableFieldIds);
            return pruned === undefined ? [] : [pruned];
        }
        return availableFieldIds.has(item.target.fieldId) ? [item] : [];
    });
    return and.length === 0 ? undefined : { id: group.id, and };
};

/**
 * ANDs saved-chart filter overrides (a scheduler's chart filters) onto every
 * source that has the field, so the narrowing reaches both sides of the join.
 * The primary source takes the overrides whole, as the chart does on its own,
 * so an unknown field still fails the run the way an ordinary chart run does.
 */
export const applyFilterOverridesToMergeQuery = ({
    mergeQuery,
    filterOverrides,
    exploreBySourceId,
}: {
    mergeQuery: MergeQuery;
    filterOverrides: Filters;
    exploreBySourceId: MergeSourceExplores;
}): MergeQuery => {
    const sources = mergeQuery.sources.map(
        (source, index): MergeQuerySource => {
            const explore = isMergeMetricSource(source)
                ? exploreBySourceId[source.id]
                : undefined;
            if (!isMergeMetricSource(source) || explore === undefined) {
                return source;
            }
            if (index === 0) {
                return {
                    ...source,
                    metricQuery: addFiltersToMetricQuery(
                        source.metricQuery,
                        filterOverrides,
                    ),
                };
            }
            const availableFieldIds = new Set(
                getAvailableFilterFieldIds(explore),
            );
            const pruned: Filters = {
                dimensions: pruneFilterGroup(
                    filterOverrides.dimensions,
                    availableFieldIds,
                ),
                metrics: pruneFilterGroup(
                    filterOverrides.metrics,
                    availableFieldIds,
                ),
                tableCalculations: pruneFilterGroup(
                    filterOverrides.tableCalculations,
                    availableFieldIds,
                ),
            };
            if (
                pruned.dimensions === undefined &&
                pruned.metrics === undefined &&
                pruned.tableCalculations === undefined
            ) {
                return source;
            }
            return {
                ...source,
                metricQuery: addFiltersToMetricQuery(
                    source.metricQuery,
                    pruned,
                ),
            };
        },
    );
    return { ...mergeQuery, sources };
};
