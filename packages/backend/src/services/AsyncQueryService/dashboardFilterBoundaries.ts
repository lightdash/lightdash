import {
    DEFAULT_UI_STRINGS,
    findFieldByIdInExplore,
    getDashboardBoundaryErrors,
    getDefaultStartOfWeek,
    getExecutableFilterFieldIds,
    getFilterBoundaryDefaultRules,
    getFilterBoundaryFieldContext,
    interpolateUiString,
    isAndFilterGroup,
    isEmptyDashboardFilterRule,
    isFilterRule,
    ParameterError,
    restoreDashboardFilterBoundaries,
    validateFilterBoundary,
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
    const contextNow = new Date();
    for (const kind of [
        'dimensions',
        'metrics',
        'tableCalculations',
    ] as const) {
        const savedRuleIds = new Set(
            args.savedFilters[kind].map((rule) => rule.id),
        );
        args.savedFilters[kind].forEach((rule) => {
            const target = rule.tileTargets?.[args.tileUuid] || rule.target;
            if (
                !rule.boundaries ||
                rule.tileTargets?.[args.tileUuid] === false ||
                !getExecutableFilterFieldIds(args.explore).includes(
                    target.fieldId,
                )
            )
                return;
            const context = {
                now: contextNow,
                ...args.context,
                startOfWeek:
                    args.context.startOfWeek ??
                    getDefaultStartOfWeek(args.explore.targetDatabase),
                ...getFilterBoundaryFieldContext(
                    args.fields?.[target.fieldId] ??
                        findFieldByIdInExplore(args.explore, target.fieldId),
                    args.explore.caseSensitive,
                ),
            };
            const candidates = dashboardFilters[kind].filter(
                (candidate) =>
                    candidate.target.fieldId === target.fieldId &&
                    (candidate.id === rule.id ||
                        !savedRuleIds.has(candidate.id)),
            );
            if (
                rule.boundaries.type === 'date' &&
                rule.boundaries.mode === 'fixed' &&
                getFilterBoundaryDefaultRules(
                    { ...rule, target },
                    context,
                ).every((expected) =>
                    candidates.some(
                        (candidate) =>
                            !candidate.disabled &&
                            !candidate.includeNull &&
                            candidate.operator === expected.operator &&
                            JSON.stringify(candidate.values) ===
                                JSON.stringify(expected.values),
                    ),
                )
            )
                return;
            if (
                !candidates.length ||
                candidates.some(
                    (candidate) =>
                        candidate.disabled ||
                        isEmptyDashboardFilterRule(candidate) ||
                        validateFilterBoundary(
                            rule.boundaries,
                            candidate,
                            context,
                        ),
                )
            ) {
                throw new ParameterError(
                    interpolateUiString(
                        DEFAULT_UI_STRINGS['filters.boundaries.invalidFilters'],
                        {
                            filters:
                                rule.label ||
                                context.fieldLabel ||
                                target.fieldId,
                        },
                    ),
                );
            }
        });
    }
};

export const resolveBoundaryDefaults = ({
    savedFilters,
    filters,
    tileUuid,
    availableFieldIds,
    getContext,
}: {
    savedFilters: DashboardFilters;
    filters: DashboardFilters;
    tileUuid: string;
    availableFieldIds: string[];
    getContext: NonNullable<Parameters<typeof getDashboardBoundaryErrors>[4]>;
}): DashboardFilters => {
    const restored = restoreDashboardFilterBoundaries(savedFilters, filters);
    for (const kind of [
        'dimensions',
        'metrics',
        'tableCalculations',
    ] as const) {
        restored[kind] = restored[kind].flatMap((rule) => {
            const target = rule.tileTargets?.[tileUuid] || rule.target;
            return rule.boundaries &&
                rule.tileTargets?.[tileUuid] !== false &&
                availableFieldIds.includes(target.fieldId) &&
                (rule.disabled || isEmptyDashboardFilterRule(rule))
                ? getFilterBoundaryDefaultRules(rule, getContext(target))
                : [rule];
        });
    }
    return restored;
};

export const resolveDashboardFilterBoundaries = (
    args: Parameters<typeof assertDashboardFilterBoundaries>[0],
): DashboardFilters => {
    assertDashboardFilterBoundaries(args);
    return resolveBoundaryDefaults({
        savedFilters: args.savedFilters,
        filters: args.filters,
        tileUuid: args.tileUuid,
        availableFieldIds: getExecutableFilterFieldIds(args.explore),
        getContext: (target) => ({
            ...args.context,
            startOfWeek:
                args.context.startOfWeek ??
                getDefaultStartOfWeek(args.explore.targetDatabase),
            ...getFilterBoundaryFieldContext(
                args.fields?.[target.fieldId] ??
                    findFieldByIdInExplore(args.explore, target.fieldId),
                args.explore.caseSensitive,
            ),
        }),
    });
};
