import {
    FilterOperator,
    flattenFilterGroup,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from '../apiDateRange';
import {
    getApiName,
    getApiSourceExplore,
    type CompiledApiSourceQuery,
} from '../apiSourceExplore';
import { escapeRe2 } from '../escapeRe2';

const anyOf = (values: string[]) => {
    const escaped = values.map(escapeRe2);
    return escaped.length === 1 ? escaped[0] : `(${escaped.join('|')})`;
};

type SearchConsoleFilter = {
    dimension: string;
    operator: string;
    expression: string;
};

/**
 * One Search Analytics filter per rule where possible. Several values on a
 * positive match OR into one regex; several negative matches AND as
 * separate filters. Expects a query that passed the shared check.
 */
const toFilters = (
    dimension: string,
    rule: FilterRule,
): SearchConsoleFilter[] => {
    const values = (rule.values ?? []).map(String);
    const filter = (operator: string, expression: string) => ({
        dimension,
        operator,
        expression,
    });
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return values.length === 1
                ? [filter('equals', values[0])]
                : [filter('includingRegex', `^${anyOf(values)}$`)];
        case FilterOperator.INCLUDE:
            return values.length === 1
                ? [filter('contains', values[0])]
                : [filter('includingRegex', anyOf(values))];
        case FilterOperator.STARTS_WITH:
            return [filter('includingRegex', `^${anyOf(values)}`)];
        case FilterOperator.ENDS_WITH:
            return [filter('includingRegex', `${anyOf(values)}$`)];
        case FilterOperator.NOT_EQUALS:
            return values.map((value) => filter('notEquals', value));
        case FilterOperator.NOT_INCLUDE:
            return values.map((value) => filter('notContains', value));
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
            );
    }
};

/** Months of data Search Console keeps, per Google's help pages. */
const SEARCH_CONSOLE_RETENTION_MONTHS = 16;

/** The first day Search Console still reports, 16 months before `today`. */
export const getSearchConsoleEarliestDate = (today: string): string => {
    const date = new Date(`${today}T00:00:00Z`);
    const day = date.getUTCDate();
    // From the 1st, so a 31st never rolls into the next month
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - SEARCH_CONSOLE_RETENTION_MONTHS);
    const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString().slice(0, 10);
};

/**
 * Compiles a metric query on a Search Console explore into one Search
 * Analytics request. The API always orders by clicks, so any other sort
 * fetches up to `maxRows` and sorts locally. `today` is in Pacific Time,
 * the time zone Search Console reports in.
 */
export const compileSearchConsoleQuery = ({
    explore,
    metricQuery,
    today,
    maxRows,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
    maxRows: number;
}): CompiledApiSourceQuery => {
    const apiSource = getApiSourceExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { dateRule, otherFilters } = apiSource.dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              apiSource.dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };
    const earliestDate = getSearchConsoleEarliestDate(today);
    const dateRange = toAbsoluteDateRange(
        getApiDateRange({
            rule: dateRule,
            defaultDays: apiSource.dateRange?.defaultDays ?? 28,
            today,
            earliestDate,
        }),
        today,
    );
    if (dateRange.startDate > dateRange.endDate) {
        throw new ParameterError(
            `Search Console has data from ${earliestDate} to ${today}. Pick a date in that range.`,
        );
    }
    const filters = (otherFilters ? flattenFilterGroup(otherFilters) : [])
        .filter((rule) => !rule.disabled && (rule.values ?? []).length > 0)
        .flatMap((rule) => toFilters(apiName(rule.target.fieldId), rule));

    // The API returns rows by clicks descending, except that rows grouped by
    // date come back by date ascending.
    const [firstSort, ...otherSorts] = metricQuery.sorts;
    const groupsByDate =
        apiSource.dateRange !== null &&
        metricQuery.dimensions.includes(apiSource.dateRange.fieldId);
    const isApiOrder =
        !firstSort ||
        (!groupsByDate &&
            otherSorts.length === 0 &&
            firstSort.descending &&
            apiName(firstSort.fieldId) === 'clicks');
    const requestLimit = isApiOrder ? metricQuery.limit : maxRows;
    const request = {
        ...dateRange,
        dimensions: metricQuery.dimensions.map(apiName),
        ...(filters.length > 0
            ? { dimensionFilterGroups: [{ groupType: 'and', filters }] }
            : {}),
        rowLimit: requestLimit,
    };
    return {
        query: JSON.stringify(request),
        requestLimit,
        limit: metricQuery.limit,
        fieldIdsByColumn: Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [apiName(fieldId), fieldId],
            ),
        ),
        localSorts: isApiOrder ? [] : metricQuery.sorts,
    };
};
