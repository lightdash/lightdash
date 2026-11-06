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

const OPERATORS: Partial<Record<FilterOperator, string>> = {
    [FilterOperator.EQUALS]: 'equals',
    [FilterOperator.NOT_EQUALS]: 'notEquals',
    [FilterOperator.INCLUDE]: 'contains',
    [FilterOperator.NOT_INCLUDE]: 'notContains',
};

const toFilters = (dimension: string, rule: FilterRule) => {
    const operator = OPERATORS[rule.operator];
    if (!operator) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't be filtered with "${rule.operator}".`,
        );
    }
    // The shared check refuses several values for a positive match, which
    // would be an OR; several negative matches AND as separate filters
    const values = (rule.values ?? []).map(String);
    return values.map((expression) => ({ dimension, operator, expression }));
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
    const dateRange = toAbsoluteDateRange(
        getApiDateRange({
            rule: dateRule,
            defaultDays: apiSource.dateRange?.defaultDays ?? 28,
            today,
        }),
        today,
    );
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
