import {
    findFieldByIdInExplore,
    getDashboardBoundaryErrors,
    getDefaultStartOfWeek,
    getExecutableFilterFieldIds,
    getFilterBoundaryFieldContext,
    isAndFilterGroup,
    isFilterRule,
    ParameterError,
    type DashboardFilters,
    type Explore,
    type FilterBoundaryContext,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type ItemsMap,
} from '@lightdash/common';

export const assertDashboardFilterBoundaries = ({
    savedFilters,
    filters,
    tileUuid,
    explore,
    context,
    fields,
}: {
    savedFilters: DashboardFilters;
    filters: DashboardFilters;
    tileUuid: string;
    explore: Explore;
    context: FilterBoundaryContext;
    fields?: ItemsMap;
}): void => {
    const errors = getDashboardBoundaryErrors(
        savedFilters,
        filters,
        tileUuid,
        getExecutableFilterFieldIds(explore),
        (target) => ({
            ...context,
            startOfWeek:
                context.startOfWeek ??
                getDefaultStartOfWeek(explore.targetDatabase),
            ...getFilterBoundaryFieldContext(
                fields?.[target.fieldId] ??
                    findFieldByIdInExplore(explore, target.fieldId),
                explore.caseSensitive,
            ),
        }),
    );
    if (errors.length) throw new ParameterError([...new Set(errors)].join(' '));
};

const conjunctiveRules = (group: FilterGroup | undefined): FilterRule[] => {
    if (!group || !isAndFilterGroup(group)) return [];
    return group.and.flatMap((item) =>
        isFilterRule(item) ? [item] : conjunctiveRules(item),
    );
};

export const assertDashboardMetricFilterBoundaries = ({
    filters,
    ...args
}: Omit<Parameters<typeof assertDashboardFilterBoundaries>[0], 'filters'> & {
    filters: Filters;
}): void => {
    const dashboardFilters: DashboardFilters = {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    };
    for (const kind of [
        'dimensions',
        'metrics',
        'tableCalculations',
    ] as const) {
        dashboardFilters[kind] = conjunctiveRules(filters[kind]).map((rule) => {
            const field = findFieldByIdInExplore(
                args.explore,
                rule.target.fieldId,
            );
            return {
                ...rule,
                target: {
                    fieldId: rule.target.fieldId,
                    tableName: field?.table ?? '',
                },
                label: undefined,
            };
        });
    }
    assertDashboardFilterBoundaries({ ...args, filters: dashboardFilters });
};
