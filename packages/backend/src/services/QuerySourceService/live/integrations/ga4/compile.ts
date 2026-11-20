import {
    FilterOperator,
    getDimensions,
    getItemId,
    isAndFilterGroup,
    isFilterGroup,
    ParameterError,
    TimeFrames,
    UnitOfTime,
    type ApiSourceExplore,
    type Explore,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiName,
    getLiveExplore,
    type LiveCompiledRequest,
    type LivePeriodFormat,
} from '../../explores/definition';
import {
    getLiveDateRange,
    getStartOfPeriod,
    splitDateRangeFilter,
    toAbsoluteDate,
    type LiveDateBound,
    type LiveDateRange,
} from '../../query/dateRange';
import { toGa4ColumnName } from './run';

type Ga4Expression = Record<string, unknown>;

const anyOf = (expressions: Ga4Expression[]): Ga4Expression =>
    expressions.length === 1 ? expressions[0] : { orGroup: { expressions } };

const not = (expression: Ga4Expression): Ga4Expression => ({
    notExpression: expression,
});

const toNumber = (value: unknown) => {
    const number = Number(value);
    if (value === null || value === '' || !Number.isFinite(number)) {
        throw new ParameterError(`"${String(value)}" isn't a number.`);
    }
    return number;
};

const getDimensionExpression = (
    fieldName: string,
    rule: FilterRule,
    caseSensitive: boolean,
): Ga4Expression => {
    const values = (rule.values ?? []).map(String);
    const stringFilter = (matchType: string) =>
        anyOf(
            values.map((value) => ({
                filter: {
                    fieldName,
                    stringFilter: { matchType, value, caseSensitive },
                },
            })),
        );
    const equals = () =>
        values.length === 1
            ? stringFilter('EXACT')
            : {
                  filter: {
                      fieldName,
                      inListFilter: { values, caseSensitive },
                  },
              };
    const empty = { filter: { fieldName, emptyFilter: {} } };
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return equals();
        case FilterOperator.NOT_EQUALS:
            return not(equals());
        case FilterOperator.INCLUDE:
            return stringFilter('CONTAINS');
        case FilterOperator.NOT_INCLUDE:
            return not(stringFilter('CONTAINS'));
        case FilterOperator.STARTS_WITH:
            return stringFilter('BEGINS_WITH');
        case FilterOperator.ENDS_WITH:
            return stringFilter('ENDS_WITH');
        case FilterOperator.NULL:
            return empty;
        case FilterOperator.NOT_NULL:
            return not(empty);
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

const getMetricExpression = (
    fieldName: string,
    rule: FilterRule,
): Ga4Expression => {
    const values = (rule.values ?? []).map(toNumber);
    const numericFilter = (operation: string) =>
        anyOf(
            values.map((value) => ({
                filter: {
                    fieldName,
                    numericFilter: {
                        operation,
                        value: { doubleValue: value },
                    },
                },
            })),
        );
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return numericFilter('EQUAL');
        case FilterOperator.GREATER_THAN:
            return numericFilter('GREATER_THAN');
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return numericFilter('GREATER_THAN_OR_EQUAL');
        case FilterOperator.LESS_THAN:
            return numericFilter('LESS_THAN');
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return numericFilter('LESS_THAN_OR_EQUAL');
        case FilterOperator.IN_BETWEEN: {
            const [fromValue, toValue] = values;
            if (fromValue === undefined || toValue === undefined) {
                throw new ParameterError(
                    `"between" on "${rule.target.fieldId}" needs two numbers.`,
                );
            }
            return {
                filter: {
                    fieldName,
                    betweenFilter: {
                        fromValue: { doubleValue: fromValue },
                        toValue: { doubleValue: toValue },
                    },
                },
            };
        }
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

const NO_VALUE_OPERATORS = [FilterOperator.NULL, FilterOperator.NOT_NULL];
// GA4 reports need a metric; dimension-only queries ask for this one and drop it.
const DIMENSION_ONLY_METRIC = 'eventCount';

/** A GA4 FilterExpression for a Lightdash filter group; undefined when nothing filters. */
const toFilterExpression = (
    group: FilterGroup | undefined,
    toRuleExpression: (rule: FilterRule) => Ga4Expression,
): Ga4Expression | undefined => {
    if (!group) {
        return undefined;
    }
    const isAnd = isAndFilterGroup(group);
    const expressions = ((isAnd ? group.and : group.or) ?? []).flatMap(
        (item): Ga4Expression[] => {
            if (isFilterGroup(item)) {
                const nested = toFilterExpression(item, toRuleExpression);
                return nested ? [nested] : [];
            }
            const hasValues =
                NO_VALUE_OPERATORS.includes(item.operator) ||
                (item.values ?? []).length > 0;
            return item.disabled || !hasValues ? [] : [toRuleExpression(item)];
        },
    );
    if (expressions.length === 0) {
        return undefined;
    }
    if (expressions.length === 1) {
        return expressions[0];
    }
    return isAnd ? { andGroup: { expressions } } : { orGroup: { expressions } };
};

// The first day the Data API accepts
// (https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/DateRange)
export const GA4_EARLIEST_DATE = '2015-08-14';

const toGa4Date = (bound: LiveDateBound) => {
    if ('date' in bound) {
        return bound.date;
    }
    return bound.daysAgo === 0 ? 'today' : `${bound.daysAgo}daysAgo`;
};

/** The period each grain of the date reports, coarsest last. */
const PERIOD_UNITS: [apiName: string, unit: UnitOfTime][] = [
    ['isoYearIsoWeek', UnitOfTime.weeks],
    ['yearMonth', UnitOfTime.months],
    ['year', UnitOfTime.years],
];

/**
 * The default window, started at the beginning of its first week, month or
 * year when the query groups by one, so that period isn't cut short.
 */
const getDefaultRange = (
    defaultDays: number,
    groupedApiNames: string[],
    today: string,
): LiveDateRange => {
    const range = getLiveDateRange({ rule: null, defaultDays, today });
    const coarsest = PERIOD_UNITS.filter(([apiName]) =>
        groupedApiNames.includes(apiName),
    ).pop();
    if (!coarsest) {
        return range;
    }
    return {
        start: {
            date: getStartOfPeriod(
                coarsest[1],
                toAbsoluteDate(range.start, today),
            ),
        },
        end: range.end,
    };
};

const getDateRanges = (
    apiSource: ApiSourceExplore,
    dateRule: FilterRule | null,
    groupedApiNames: string[],
    today: string,
) => {
    const defaultDays = apiSource.dateRange?.defaultDays ?? 28;
    const { start, end } = dateRule
        ? getLiveDateRange({
              rule: dateRule,
              defaultDays,
              today,
              earliestDate: GA4_EARLIEST_DATE,
          })
        : getDefaultRange(defaultDays, groupedApiNames, today);
    return [{ startDate: toGa4Date(start), endDate: toGa4Date(end) }];
};

// How GA4 reports the grains of the date dimension: isoYearIsoWeek, yearMonth, year
/** GA4 returns weeks, months and years as YYYYWW, YYYYMM and YYYY. */
export const GA4_PERIOD_FORMATS: Partial<Record<TimeFrames, LivePeriodFormat>> =
    {
        [TimeFrames.WEEK]: 'iso_week',
        [TimeFrames.MONTH]: 'year_month',
        [TimeFrames.YEAR]: 'year',
    };

/**
 * Compiles a metric query on a GA4 explore into one runReport body. Dates
 * are relative where possible, so GA4 resolves them in the property's own
 * time zone; `today` is only used for calendar periods such as last month.
 */
export const compileGa4Query = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const caseSensitive = explore.caseSensitive ?? true;
    const { dateRule, otherFilters } = apiSource.dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              apiSource.dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };

    const dimensionFilter = toFilterExpression(otherFilters, (rule) =>
        getDimensionExpression(
            apiName(rule.target.fieldId),
            rule,
            rule.caseSensitive ?? caseSensitive,
        ),
    );
    const metricFilter = toFilterExpression(
        metricQuery.filters.metrics,
        (rule) => getMetricExpression(apiName(rule.target.fieldId), rule),
    );
    const metricIds = new Set(metricQuery.metrics);
    const request = {
        dateRanges: getDateRanges(
            apiSource,
            dateRule,
            metricQuery.dimensions.map(apiName),
            today,
        ),
        dimensions: metricQuery.dimensions.map((fieldId) => ({
            name: apiName(fieldId),
        })),
        metrics: (metricQuery.metrics.length > 0
            ? metricQuery.metrics.map(apiName)
            : [DIMENSION_ONLY_METRIC]
        ).map((name) => ({ name })),
        ...(dimensionFilter ? { dimensionFilter } : {}),
        ...(metricFilter ? { metricFilter } : {}),
        orderBys: metricQuery.sorts.map((sort) =>
            metricIds.has(sort.fieldId)
                ? {
                      metric: { metricName: apiName(sort.fieldId) },
                      desc: sort.descending,
                  }
                : {
                      dimension: { dimensionName: apiName(sort.fieldId) },
                      desc: sort.descending,
                  },
        ),
    };
    return {
        query: JSON.stringify(request),
        fieldIdsByColumn: Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [toGa4ColumnName(apiName(fieldId)), fieldId],
            ),
        ),
    };
};
