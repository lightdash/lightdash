export enum FilterOperator {
    NULL = 'isNull',
    NOT_NULL = 'notNull',
    EQUALS = 'equals',
    NOT_EQUALS = 'notEquals',
    STARTS_WITH = 'startsWith',
    NOT_INCLUDE = 'doesNotInclude',
    LESS_THAN = 'lessThan',
    LESS_THAN_OR_EQUAL = 'lessThanOrEqual',
    GREATER_THAN = 'greaterThan',
    GREATER_THAN_OR_EQUAL = 'greaterThanOrEqual',
}

export type FilterRule<
    O = FilterOperator,
    V = any,
    S extends object | undefined = undefined,
> = {
    id: string;
    target: {
        fieldId: string;
    };
    operator: O;
    settings?: S;
    values?: V[];
};

type OrFilterGroup = {
    id: string;
    or: Array<FilterGroup | FilterRule>;
};

type AndFilterGroup = {
    id: string;
    and: Array<FilterGroup | FilterRule>;
};

export type FilterGroup = OrFilterGroup | AndFilterGroup;

export type Filters = {
    // Note: dimensions need to be in a separate filter group from metrics & table calculations
    dimensions?: FilterGroup;
    metrics?: FilterGroup;
};

/* Utils */

export const isOrFilterGroup = (
    value: FilterGroup | FilterRule,
): value is OrFilterGroup => 'or' in value;

export const isAndFilterGroup = (
    value: FilterGroup | FilterRule,
): value is AndFilterGroup => 'and' in value;

export const isFilterGroup = (
    value: FilterGroup | FilterRule,
): value is FilterGroup => isOrFilterGroup(value) || isAndFilterGroup(value);

export const isFilterRule = (
    value: FilterGroup | FilterRule,
): value is FilterRule => 'target' in value && 'operator' in value;

export const getFilterRulesFromGroup = (
    filterGroup: FilterGroup,
): FilterRule[] => {
    const items = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;
    return items.reduce<FilterRule[]>(
        (sum, item) =>
            isFilterGroup(item)
                ? [...sum, ...getFilterRulesFromGroup(item)]
                : [...sum, item],
        [],
    );
};

export const getTotalFilterRules = (filters: Filters): FilterRule[] => {
    const dimensionRules = filters.dimensions
        ? getFilterRulesFromGroup(filters.dimensions)
        : [];
    const metricsRules = filters.metrics
        ? getFilterRulesFromGroup(filters.metrics)
        : [];
    return [...dimensionRules, ...metricsRules];
};

export const countTotalFilterRules = (filters: Filters): number =>
    getTotalFilterRules(filters).length;

export const example: FilterGroup = {
    id: '1',
    and: [
        {
            id: '2',
            target: {
                fieldId: 'customers_customer_id',
            },
            operator: FilterOperator.EQUALS,
            settings: undefined,
            values: ['some'],
        },
    ],
};
