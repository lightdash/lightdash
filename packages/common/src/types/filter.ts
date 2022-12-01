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
    INCLUDE = 'include',
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

export type FieldTarget = {
    fieldId: string;
};

export type FilterRule<
    O = FilterOperator,
    T = FieldTarget,
    V = any,
    S = any,
> = {
    id: string;
    target: T;
    operator: O;
    settings?: S;
    values?: V[];
};

export type DashboardFieldTarget = {
    fieldId: string;
    tableName: string;
};

export type DashboardFilterRule<
    O = FilterOperator,
    T = DashboardFieldTarget,
    V = any,
    S = any,
> = FilterRule<O, T, V, S> & {
    tileTargets?: Record<string, DashboardFieldTarget>;
};

export type DateFilterRule = FilterRule<
    FilterOperator,
    FieldTarget,
    any,
    {
        unitOfTime?: UnitOfTime;
        completed?: boolean;
    }
>;

export type FilterGroupItem = FilterGroup | FilterRule;

type OrFilterGroup = {
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
};

export type DashboardFilters = {
    dimensions: DashboardFilterRule[];
    metrics: DashboardFilterRule[];
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

export const isFilterRule = (value: FilterGroupItem): value is FilterRule =>
    'target' in value && 'operator' in value;

export enum FilterGroupOperator {
    and = 'and',
    or = 'or',
}
