/* Base types */

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

const filterOperatorLabel: Record<FilterOperator, string> = {
    [FilterOperator.NULL]: 'is null',
    [FilterOperator.NOT_NULL]: 'is not null',
    [FilterOperator.EQUALS]: 'is equal to',
    [FilterOperator.NOT_EQUALS]: 'is not equal to',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.NOT_INCLUDE]: 'does not include',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
};

export const getFilterOptions = <T extends FilterOperator>(
    operators: Array<T>,
): Array<{ value: T; label: string }> =>
    operators.map((operator) => ({
        value: operator,
        label: filterOperatorLabel[operator],
    }));

type FilterRuleBase<
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

type FilterRuleWithValuesBase<
    O = FilterOperator,
    V = any,
    S extends object | undefined = undefined,
> = FilterRuleBase<O, S> & {
    values?: V[];
};

/* Specific filter types */

export const stringFilterOptions = getFilterOptions([
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.STARTS_WITH,
    FilterOperator.NOT_INCLUDE,
]);

export const numberFilterOptions = getFilterOptions([
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
]);

export const booleanFilterOptions = getFilterOptions([
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
    FilterOperator.EQUALS,
]);

type TimeFilterRule =
    | FilterRuleBase<FilterOperator.NULL | FilterOperator.NOT_NULL>
    | FilterRuleWithValuesBase<
          | FilterOperator.EQUALS
          | FilterOperator.NOT_EQUALS
          | FilterOperator.LESS_THAN
          | FilterOperator.LESS_THAN_OR_EQUAL
          | FilterOperator.GREATER_THAN
          | FilterOperator.GREATER_THAN_OR_EQUAL,
          Date
      >;
export const timeFilterOptions: Array<{
    value: TimeFilterRule['operator'];
    label: string;
}> = [
    ...getFilterOptions([
        FilterOperator.NULL,
        FilterOperator.NOT_NULL,
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
    ]),
    { value: FilterOperator.LESS_THAN, label: 'is before' },
    { value: FilterOperator.LESS_THAN_OR_EQUAL, label: 'is on or before' },
    { value: FilterOperator.GREATER_THAN, label: 'is after' },
    { value: FilterOperator.GREATER_THAN_OR_EQUAL, label: 'is on or after' },
];

/* Group types */

export type FilterRule = FilterRuleBase;

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
