export enum FilterType {
    STRING = 'string',
    NUMBER = 'number',
    DATE = 'date',
    BOOLEAN = 'boolean',
}

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
    IN_THE_PAST = 'inThePast',
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

export type FilterRule<O = FilterOperator, V = any, S = any> = {
    id: string;
    target: {
        fieldId: string;
    };
    operator: O;
    settings?: S;
    values?: V[];
};

export type DateFilterRule = FilterRule<
    FilterOperator,
    any,
    {
        unitOfTime?: UnitOfTime;
        completed?: boolean;
    }
>;

type OrFilterGroup = {
    id: string;
    or: Array<FilterGroup | FilterRule>;
};

export type AndFilterGroup = {
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
    filterGroup: FilterGroup | undefined,
): FilterRule[] => {
    if (filterGroup) {
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
    }
    return [];
};

export const getTotalFilterRules = (filters: Filters): FilterRule[] => [
    ...getFilterRulesFromGroup(filters.dimensions),
    ...getFilterRulesFromGroup(filters.metrics),
];

export const countTotalFilterRules = (filters: Filters): number =>
    getTotalFilterRules(filters).length;
