import {
    ConditionalOperator as FilterOperator,
    ConditionalRule,
} from './conditionalRule';

export { FilterOperator };

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
    O = FilterOperator,
    T = FieldTarget,
    V = any,
    S = any,
> extends ConditionalRule<O, V> {
    id: string;
    target: T;
    settings?: S;
}

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
    label: undefined | string;
};

export const isDashboardFilterRule = (
    value: FilterRule,
): value is DashboardFilterRule => 'tileTargets' in value;

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

export const isFilterRule = (value: ConditionalRule): value is FilterRule =>
    'id' in value && 'target' in value && 'operator' in value;

export enum FilterGroupOperator {
    and = 'and',
    or = 'or',
}
