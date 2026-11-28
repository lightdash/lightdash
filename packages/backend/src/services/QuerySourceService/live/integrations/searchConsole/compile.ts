import {
    FilterOperator,
    flattenFilterGroup,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    escapeRe2,
    getApiName,
    getLiveDateRange,
    getLiveExplore,
    getLiveRequestLimit,
    refuseLiveQuery,
    splitDateRangeFilter,
    toAbsoluteDateRange,
    type LiveCompiledRequest,
} from '../../sdk';

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

/** The search types a query can read; Google reads web when none is set. */
const SEARCH_TYPES = ['web', 'image', 'video', 'news'] as const;
type SearchType = (typeof SEARCH_TYPES)[number];
const isSearchType = (value: string): value is SearchType =>
    SEARCH_TYPES.includes(value as SearchType);

/** The field Search Console reads as the request's `type`, not as a dimension. */
export const SEARCH_TYPE_FIELD = 'search_type';

/** The search type a query filters to; null when it doesn't. */
const toSearchType = (rules: FilterRule[]): SearchType | null => {
    if (rules.length === 0) return null;
    const [rule] = rules;
    const values = (rule.values ?? []).map(String);
    if (
        rules.length > 1 ||
        rule.operator !== FilterOperator.EQUALS ||
        values.length !== 1 ||
        !isSearchType(values[0])
    ) {
        throw refuseLiveQuery(
            'live_source.refused.filter_operator',
            'Search Console reads one search type per query: filter Search type to equal one of web, image, video or news.',
        );
    }
    return values[0];
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
    const activeRules = (
        otherFilters ? flattenFilterGroup(otherFilters) : []
    ).filter((rule) => !rule.disabled && (rule.values ?? []).length > 0);
    const isSearchTypeRule = (rule: FilterRule) =>
        apiName(rule.target.fieldId) === SEARCH_TYPE_FIELD;
    const searchType = toSearchType(activeRules.filter(isSearchTypeRule));
    const filters = activeRules
        .filter((rule) => !isSearchTypeRule(rule))
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
    const localSorts = isApiOrder ? [] : metricQuery.sorts;
    const request = {
        ...dateRange,
        // The search type is the request's type, echoed on each row by run
        dimensions: metricQuery.dimensions
            .map(apiName)
            .filter((name) => name !== SEARCH_TYPE_FIELD),
        ...(searchType ? { type: searchType } : {}),
        ...(filters.length > 0
            ? { dimensionFilterGroups: [{ groupType: 'and', filters }] }
            : {}),
        rowLimit: getLiveRequestLimit(metricQuery.limit, localSorts, maxRows),
    };
    return {
        query: JSON.stringify(request),
        localSorts,
    };
};
