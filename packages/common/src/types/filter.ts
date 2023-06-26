import { ConditionalOperator, ConditionalRule } from './conditionalRule';

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
}

export interface MetricFilterRule
    extends FilterRule<ConditionalOperator, { fieldRef: string }> {}

export type DashboardFieldTarget = {
    fieldId: string;
    tableName: string;
};

export type DashboardFilterRule<
    O = ConditionalOperator,
    T extends DashboardFieldTarget = DashboardFieldTarget,
    V = any,
    S = any,
> = FilterRule<O, T, V, S> & {
    tileTargets?: Record<string, DashboardFieldTarget>;
    label: undefined | string;
};

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
};

export type DashboardFilters = {
    dimensions: DashboardFilterRule[];
    metrics: DashboardFilterRule[];
};

export type DashboardFiltersFromSearchParam = {
    dimensions: (Omit<DashboardFilterRule, 'tileTargets'> & {
        tileTargets?: (string | Record<string, DashboardFieldTarget>)[];
    })[];
    metrics: (Omit<DashboardFilterRule, 'tileTargets'> & {
        tileTargets?: (string | Record<string, DashboardFieldTarget>)[];
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

export const isFilterRule = (value: ConditionalRule): value is FilterRule =>
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
    return rules;
};

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
    const { dimensions, metrics } = dashboardFilters;
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
    return filters;
};

const isDashboardTileTargetFilterOverride = (
    filter: string | Record<string, DashboardFieldTarget>,
): filter is Record<string, DashboardFieldTarget> => typeof filter === 'object';

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
                        Record<string, DashboardFieldTarget>
                    >(
                        (tileTargetsResult, tileTarget) => ({
                            ...tileTargetsResult,
                            ...(isDashboardTileTargetFilterOverride(tileTarget)
                                ? {
                                      [Object.keys(tileTarget)[0]]: {
                                          fieldId:
                                              tileTarget[
                                                  Object.keys(tileTarget)[0]
                                              ].fieldId,
                                          tableName:
                                              tileTarget[
                                                  Object.keys(tileTarget)[0]
                                              ].tableName,
                                      },
                                  }
                                : {
                                      [tileTarget]: {
                                          fieldId: f.target.fieldId,
                                          tableName: f.target.tableName,
                                      },
                                  }),
                        }),
                        {},
                    ),
                }),
            })),
        }),
        { dimensions: [], metrics: [] },
    );

export const convertDashboardFiltersToParam = (
    dashboardFilters: DashboardFilters,
): DashboardFiltersFromSearchParam =>
    Object.entries(dashboardFilters).reduce(
        (result, [key, value]) => ({
            ...result,
            [key]: value.map((f) => ({
                ...f,
                ...(f.tileTargets && {
                    tileTargets: Object.entries(f.tileTargets).map(
                        ([tileTargetKey, tileTargetValue]) =>
                            tileTargetValue.fieldId === f.target.fieldId
                                ? tileTargetKey
                                : { [tileTargetKey]: tileTargetValue },
                    ),
                }),
            })),
        }),
        { dimensions: [], metrics: [] },
    );

export { ConditionalOperator as FilterOperator };
