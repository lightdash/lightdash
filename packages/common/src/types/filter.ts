import { ConditionalOperator, type ConditionalRule } from './conditionalRule';
import type { SchedulerFilterRule } from './scheduler';

export enum FilterType {
    STRING = 'string',
    NUMBER = 'number',
    DATE = 'date',
    BOOLEAN = 'boolean',
}

export enum UnitOfTime {
    milliseconds = 'milliseconds',
    seconds = 'seconds',
    minutes = 'minutes',
    hours = 'hours',
    days = 'days',
    weeks = 'weeks',
    months = 'months',
    quarters = 'quarters',
    years = 'years',
}

export const unitOfTimeFormat: Record<UnitOfTime, string> = {
    milliseconds: 'YYYY-MM-DD HH:mm:ss',
    seconds: 'YYYY-MM-DD HH:mm:ss',
    minutes: 'YYYY-MM-DD HH:mm',
    hours: 'YYYY-MM-DD HH',
    days: 'YYYY-MM-DD',
    weeks: 'YYYY-MM-DD',
    months: 'YYYY-MM',
    quarters: 'YYYY-MM',
    years: 'YYYY',
};

export type FieldTarget = {
    fieldId: string;
};

export interface FilterRule<
    O = ConditionalOperator,
    T = FieldTarget,
    V = any,
    S = any,
> extends ConditionalRule<O, V> {
    id: string;
    target: T;
    settings?: S;
    disabled?: boolean;
    required?: boolean;
}

export interface MetricFilterRule
    extends FilterRule<ConditionalOperator, { fieldRef: string }> {}

export type DashboardFieldTarget = {
    fieldId: string;
    tableName: string;
};

export type DashboardTileTarget = DashboardFieldTarget | false;

export type DashboardFilterRule<
    O = ConditionalOperator,
    T extends DashboardFieldTarget = DashboardFieldTarget,
    V = any,
    S = any,
> = FilterRule<O, T, V, S> & {
    tileTargets?: Record<string, DashboardTileTarget>;
    label: undefined | string;
};

export type FilterDashboardToRule = DashboardFilterRule & {
    target: {
        fieldName: string;
    };
};

export type DashboardFilterRuleOverride = Omit<
    DashboardFilterRule,
    'tileTargets'
>;

export type DateFilterRule = FilterRule<
    ConditionalOperator,
    unknown,
    any,
    {
        unitOfTime?: UnitOfTime;
        completed?: boolean;
    }
>;

export type FilterGroupItem = FilterGroup | FilterRule;

export type OrFilterGroup = {
    id: string;
    or: Array<FilterGroupItem>;
};

export type AndFilterGroup = {
    id: string;
    and: Array<FilterGroupItem>;
};

export type FilterGroup = OrFilterGroup | AndFilterGroup;

export type Filters = {
    // Note: dimensions need to be in a separate filter group from metrics & table calculations
    dimensions?: FilterGroup;
    metrics?: FilterGroup;
    tableCalculations?: FilterGroup;
};

export type DashboardFilters = {
    dimensions: DashboardFilterRule[];
    metrics: DashboardFilterRule[];
    tableCalculations: DashboardFilterRule[];
};

export type DashboardFiltersFromSearchParam = {
    dimensions: (Omit<DashboardFilterRule, 'tileTargets'> & {
        tileTargets?: (string | Record<string, DashboardTileTarget>)[];
    })[];
    metrics: (Omit<DashboardFilterRule, 'tileTargets'> & {
        tileTargets?: (string | Record<string, DashboardTileTarget>)[];
    })[];
    tableCalculations: (Omit<DashboardFilterRule, 'tileTargets'> & {
        tileTargets?: (string | Record<string, DashboardTileTarget>)[];
    })[];
};

/* Utils */

export const isOrFilterGroup = (
    value: FilterGroupItem,
): value is OrFilterGroup => 'or' in value;

export const isAndFilterGroup = (
    value: FilterGroupItem,
): value is AndFilterGroup => 'and' in value;

export const isFilterGroup = (value: FilterGroupItem): value is FilterGroup =>
    isOrFilterGroup(value) || isAndFilterGroup(value);

export const isFilterRule = (
    value: ConditionalRule | FilterGroupItem,
): value is FilterRule =>
    'id' in value && 'target' in value && 'operator' in value;

export const getFilterRules = (filters: Filters): FilterRule[] => {
    const rules: FilterRule[] = [];
    const flattenFilterGroup = (filterGroup: FilterGroup): FilterRule[] => {
        const groupRules: FilterRule[] = [];

        (isAndFilterGroup(filterGroup)
            ? filterGroup.and
            : filterGroup.or
        ).forEach((item) => {
            if (isFilterGroup(item)) {
                rules.push(...flattenFilterGroup(item));
            } else {
                rules.push(item);
            }
        });
        return groupRules;
    };
    if (filters.dimensions) {
        rules.push(...flattenFilterGroup(filters.dimensions));
    }
    if (filters.metrics) {
        rules.push(...flattenFilterGroup(filters.metrics));
    }
    if (filters.tableCalculations) {
        rules.push(...flattenFilterGroup(filters.tableCalculations));
    }
    return rules;
};

export const updateFieldIdInFilterGroupItem = (
    filterGroupItem: FilterGroupItem,
    previousName: string,
    newName: string,
): void => {
    if (isFilterGroup(filterGroupItem)) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        updateFieldIdInFilters(filterGroupItem, previousName, newName);
    } else if (filterGroupItem.target.fieldId === previousName) {
        // eslint-disable-next-line no-param-reassign
        filterGroupItem.target.fieldId = newName;
    }
};

export const updateFieldIdInFilters = (
    filterGroup: FilterGroup | undefined,
    previousName: string,
    newName: string,
): void => {
    if (filterGroup) {
        if (isOrFilterGroup(filterGroup)) {
            filterGroup.or.forEach((item) =>
                updateFieldIdInFilterGroupItem(item, previousName, newName),
            );
        } else if (isAndFilterGroup(filterGroup)) {
            filterGroup.and.forEach((item) =>
                updateFieldIdInFilterGroupItem(item, previousName, newName),
            );
        }
    }
};

export const removeFieldFromFilterGroup = (
    filterGroup: FilterGroup | undefined,
    fieldId: string,
): FilterGroup | undefined => {
    if (!filterGroup) {
        return undefined;
    }

    const removeFiltersGroupItems = (
        items: FilterGroupItem[],
    ): FilterGroupItem[] =>
        items.reduce<FilterGroupItem[]>((acc, item) => {
            if (isFilterGroup(item)) {
                const updatedGroup = removeFieldFromFilterGroup(item, fieldId); // remove field from filter groups recursively
                if (updatedGroup) {
                    acc.push(updatedGroup);
                }
            } else if (item.target.fieldId !== fieldId) {
                // keep filter rule if fieldId does not match
                acc.push(item);
            }
            return acc;
        }, []);

    if (isOrFilterGroup(filterGroup)) {
        const updatedItems = removeFiltersGroupItems(filterGroup.or);
        if (updatedItems.length === 0) {
            return undefined;
        }
        return {
            ...filterGroup,
            or: updatedItems,
        };
    }
    const updatedItems = removeFiltersGroupItems(filterGroup.and);
    if (updatedItems.length === 0) {
        return undefined;
    }
    return {
        ...filterGroup,
        and: updatedItems,
    };
};

export const applyDimensionOverrides = (
    dashboardFilters: DashboardFilters,
    overrides: DashboardFilters | SchedulerFilterRule[],
) =>
    dashboardFilters.dimensions.map((dimension) => {
        const override =
            overrides instanceof Array
                ? overrides.find(
                      (overrideDimension) =>
                          overrideDimension.id === dimension.id,
                  )
                : overrides.dimensions.find(
                      (overrideDimension) =>
                          overrideDimension.id === dimension.id,
                  );
        if (override) {
            return {
                ...override,
                tileTargets: dimension.tileTargets,
            };
        }
        return dimension;
    });

export const isDashboardFilterRule = (
    value: ConditionalRule,
): value is DashboardFilterRule =>
    isFilterRule(value) && 'tableName' in value.target;

export enum FilterGroupOperator {
    and = 'and',
    or = 'or',
}

export const convertDashboardFiltersToFilters = (
    dashboardFilters: DashboardFilters,
): Filters => {
    const { dimensions, metrics, tableCalculations } = dashboardFilters;
    const filters: Filters = {};
    if (dimensions.length > 0) {
        filters.dimensions = {
            id: 'dashboard_dimension_filters',
            and: dimensions.map((dimension) => dimension),
        };
    }
    if (metrics.length > 0) {
        filters.metrics = {
            id: 'dashboard_dimension_metrics',
            and: metrics.map((metric) => metric),
        };
    }
    if (tableCalculations.length > 0) {
        filters.tableCalculations = {
            id: 'dashboard_tablecalculation_filters',
            and: tableCalculations.map((tableCalculation) => tableCalculation),
        };
    }
    return filters;
};

const isDashboardTileTargetFilterOverride = (
    filter: string | Record<string, DashboardTileTarget>,
): filter is Record<string, DashboardTileTarget> =>
    typeof filter === 'object' || typeof filter === 'boolean';

export const convertDashboardFiltersParamToDashboardFilters = (
    dashboardFilters: DashboardFiltersFromSearchParam,
): DashboardFilters =>
    Object.entries(dashboardFilters).reduce(
        (result, [key, value]) => ({
            ...result,
            [key]: value.map((f) => ({
                ...f,
                ...(f.tileTargets && {
                    tileTargets: f.tileTargets.reduce<
                        Record<string, DashboardTileTarget>
                    >((tileTargetsResult, tileTarget) => {
                        const targetName = Object.keys(tileTarget)[0];
                        const targetValue = Object.values(tileTarget)[0];
                        if (isDashboardTileTargetFilterOverride(tileTarget)) {
                            return {
                                ...tileTargetsResult,
                                ...{ [targetName]: targetValue },
                            };
                        }
                        return tileTargetsResult;
                    }, {}),
                }),
            })),
        }),
        { dimensions: [], metrics: [], tableCalculations: [] },
    );

export const compressDashboardFiltersToParam = (
    dashboardFilters: DashboardFilters,
): DashboardFiltersFromSearchParam =>
    Object.entries(dashboardFilters).reduce(
        (result, [key, value]) => ({
            ...result,
            [key]: value.map((f) => ({
                ...f,
                ...(f.tileTargets && {
                    tileTargets: Object.entries(f.tileTargets).reduce(
                        (
                            tileTargetsResult: Array<{
                                [tile: string]: DashboardTileTarget;
                            }>,
                            [tileTargetKey, tileTargetValue],
                        ) => {
                            // If the filter is not disabled for this tile
                            // AND the table and field match, we omit it.
                            // The filter will be automatically applied there
                            if (
                                tileTargetValue !== false &&
                                tileTargetValue.fieldId === f.target.fieldId &&
                                tileTargetValue.tableName === f.target.tableName
                            ) {
                                return tileTargetsResult;
                            }

                            return [
                                ...tileTargetsResult,
                                {
                                    [tileTargetKey]: tileTargetValue,
                                },
                            ];
                        },
                        [],
                    ),
                }),
            })),
        }),
        { dimensions: [], metrics: [], tableCalculations: [] },
    );

export const isFilterRuleDefinedForFieldId = (
    filterGroup: FilterGroup,
    fieldId: string,
    isInterval: boolean = false,
): boolean => {
    // Check if the filter group is an 'and' or 'or' group
    const filterGroupItems = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;

    // If the item is a filter rule, check if its id matches the provided filter rule id
    const isMatchingFieldId = (item: FilterGroupItem) => {
        if (!isFilterGroup(item)) {
            // If the item is not a filter group, check if it matches the fieldId
            return isInterval
                ? item.target.fieldId.startsWith(fieldId)
                : item.target.fieldId === fieldId;
        }
        return false;
    };
    const isFilterRulePresent = (
        item: OrFilterGroup | AndFilterGroup | FilterRule,
    ): boolean => {
        if (isMatchingFieldId(item)) {
            return true;
        }
        if (isFilterGroup(item)) {
            // If the item is a filter group, recursively check its items
            return isFilterRuleDefinedForFieldId(item, fieldId, isInterval);
        }
        return false;
    };
    // If the filter rule was not found in the filter group, return false
    return filterGroupItems.some(isFilterRulePresent);
};

export { ConditionalOperator as FilterOperator };
