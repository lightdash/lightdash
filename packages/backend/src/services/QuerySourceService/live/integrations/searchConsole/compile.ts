import {
    FilterOperator,
    flattenFilterGroup,
    ParameterError,
    type Explore,
    type FilterRule,
    type LiveResultNotice,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiName,
    getLiveExplore,
    getLiveRequestLimit,
    type LiveCompiledRequest,
} from '../../explores/definition';
import {
    getLiveDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from '../../query/dateRange';
import { escapeRe2 } from '../../query/escapeRe2';

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

/**
 * How Google counts once a query splits or filters by page or query, per
 * https://support.google.com/webmasters/answer/7042828: by page, a result
 * showing two of the site's pages counts twice; by query, searches Google
 * hides for privacy drop out. A totals row grouped without them counts the
 * site's way, so it won't match the rows.
 */
const COUNTING_NOTICES: Record<'page' | 'query', string> = {
    page: 'Google counts per page when a query splits or filters by Page: a search showing two of your pages counts twice, so impressions and clicks run higher than the site total.',
    query: 'Google leaves out searches it hides for privacy when a query splits or filters by Query, so clicks and impressions add up to less than the site total.',
};

const getCountingNotices = (
    metricQuery: MetricQuery,
    filterRules: FilterRule[],
    apiName: (fieldId: string) => string,
): LiveResultNotice[] =>
    (['page', 'query'] as const).flatMap((name) => {
        const fieldIds = [
            ...new Set([
                ...metricQuery.dimensions.filter(
                    (fieldId) => apiName(fieldId) === name,
                ),
                ...filterRules
                    .map((rule) => rule.target.fieldId)
                    .filter((fieldId) => apiName(fieldId) === name),
            ]),
        ];
        return fieldIds.length > 0
            ? [
                  {
                      type: 'providerCounting' as const,
                      fieldIds,
                      message: COUNTING_NOTICES[name],
                  },
              ]
            : [];
    });

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
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { dateRule, otherFilters } = apiSource.dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              apiSource.dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };
    const earliestDate = getSearchConsoleEarliestDate(today);
    const dateRange = toAbsoluteDateRange(
        getLiveDateRange({
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
    const filterRules = (
        otherFilters ? flattenFilterGroup(otherFilters) : []
    ).filter((rule) => !rule.disabled && (rule.values ?? []).length > 0);
    const filters = filterRules.flatMap((rule) =>
        toFilters(apiName(rule.target.fieldId), rule),
    );

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
    const localSorts = isApiOrder ? [] : metricQuery.sorts;
    const request = {
        ...dateRange,
        dimensions: metricQuery.dimensions.map(apiName),
        ...(filters.length > 0
            ? { dimensionFilterGroups: [{ groupType: 'and', filters }] }
            : {}),
        rowLimit: getLiveRequestLimit(metricQuery.limit, localSorts, maxRows),
    };
    const notices = getCountingNotices(metricQuery, filterRules, apiName);
    return {
        query: JSON.stringify(request),
        localSorts,
        ...(notices.length > 0 ? { notices } : {}),
    };
};
