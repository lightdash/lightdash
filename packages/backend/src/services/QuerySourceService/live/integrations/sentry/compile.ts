import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDateRange,
    getLiveDefinitionName,
    getLiveExplore,
    splitDateRangeFilter,
    toAbsoluteDateRange,
    type LiveCompiledRequest,
} from '../../sdk';
import { SENTRY_RETENTION_DAYS } from './api';
import { assertRealDays, type SentryFilter, type SentryRequest } from './run';

type SentryKind = SentryRequest['kind'];
type ErrorsRequest = Extract<SentryRequest, { kind: 'errors' }>;
type IssuesRequest = Extract<SentryRequest, { kind: 'issues' }>;
type SessionsRequest = Extract<SentryRequest, { kind: 'sessions' }>;

const OPERATORS: Partial<Record<FilterOperator, SentryFilter['operator']>> = {
    [FilterOperator.EQUALS]: 'is',
    [FilterOperator.NOT_EQUALS]: 'is_not',
    [FilterOperator.INCLUDE]: 'contains',
    [FilterOperator.NOT_INCLUDE]: 'not_contains',
};

/**
 * Errors sort in Sentry by any selected column but two: the list of error
 * types, and the issue, which Sentry orders by its number and not its ID.
 */
const UNSORTABLE_ERROR_COLUMNS = new Set(['error_type', 'issue']);

/** Sentry's own issue orders, each newest or highest first. */
const ISSUE_SORTS: Record<string, IssuesRequest['sort']> = {
    last_seen: 'date',
    first_seen: 'new',
    events: 'freq',
    users: 'user',
};

const ISSUE_DATES = ['first_seen', 'last_seen'];

const addDays = (isoDate: string, days: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

/** The first day Sentry still keeps, for open-ended date filters. */
const getEarliestDate = (today: string) =>
    addDays(today, -SENTRY_RETENTION_DAYS);

/** The date operators whose values count days or periods. */
const RELATIVE_DATE_OPERATORS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
];

const toDayRange = (
    rule: FilterRule | null,
    { today, defaultDays }: { today: string; defaultDays: number },
) => {
    // Before any date arithmetic, which moves a day the calendar doesn't
    // have into the next month
    if (rule && !RELATIVE_DATE_OPERATORS.includes(rule.operator)) {
        assertRealDays(
            ...(rule.values ?? []).map((value) =>
                typeof value === 'string' ? value.slice(0, 10) : undefined,
            ),
        );
    }
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays,
            today,
            earliestDate: getEarliestDate(today),
        }),
        today,
    );
    return { start: startDate, end: endDate };
};

/** One Sentry filter per rule. Expects a query that passed the shared check. */
const toFilter = (apiName: string, rule: FilterRule): SentryFilter => {
    const operator = OPERATORS[rule.operator];
    if (!operator) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't use "${rule.operator}" on Sentry.`,
        );
    }
    return {
        field: apiName,
        operator,
        values: (rule.values ?? []).map((value) => String(value).trim()),
    };
};

const toKind = (explore: Explore): SentryKind => {
    const name = getLiveDefinitionName(explore);
    if (name === 'errors' || name === 'issues' || name === 'sessions') {
        return name;
    }
    throw new ParameterError(`"${explore.name}" isn't a Sentry explore.`);
};

type CompileArgs = {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
};

/** The day range and filters of an explore that reads one range of days. */
const compileRange = ({ explore, metricQuery, today }: CompileArgs) => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { dateRange } = apiSource;
    if (!dateRange) {
        throw new ParameterError(`"${explore.name}" has no date range.`);
    }
    const { dateRule, otherFilters } = splitDateRangeFilter(
        metricQuery.filters.dimensions,
        dateRange.fieldId,
    );
    const filters = getActiveFilterRules(otherFilters).map((rule) =>
        toFilter(apiName(rule.target.fieldId), rule),
    );
    return {
        apiName,
        columns: [...metricQuery.dimensions, ...metricQuery.metrics].map(
            apiName,
        ),
        ...toDayRange(dateRule, {
            today,
            defaultDays: dateRange.defaultDays,
        }),
        ...(filters.length > 0 ? { filters } : {}),
    };
};

const compileErrors = (args: CompileArgs): LiveCompiledRequest => {
    const { apiName, columns, ...range } = compileRange(args);
    // Grouped by issue, Issues is 1 on every row, so it orders nothing
    const sorts = args.metricQuery.sorts.filter(
        ({ fieldId }) =>
            !(apiName(fieldId) === 'issues' && columns.includes('issue')),
    );
    const [first, ...others] = sorts;
    const sortColumn = first ? apiName(first.fieldId) : undefined;
    const isSortedBySentry =
        sortColumn !== undefined &&
        others.length === 0 &&
        columns.includes(sortColumn) &&
        !UNSORTABLE_ERROR_COLUMNS.has(sortColumn);
    const request: ErrorsRequest = {
        kind: 'errors',
        columns: columns as ErrorsRequest['columns'],
        ...range,
        ...(isSortedBySentry
            ? {
                  sort: {
                      column: sortColumn as ErrorsRequest['columns'][number],
                      descending: first.descending,
                  },
              }
            : {}),
    };
    return {
        query: JSON.stringify(request),
        localSorts: isSortedBySentry ? [] : sorts,
    };
};

/** Sessions come in Sentry's order of groups, so any sort is ours. */
const compileSessions = (args: CompileArgs): LiveCompiledRequest => {
    const { apiName, columns, ...range } = compileRange(args);
    const request: SessionsRequest = {
        kind: 'sessions',
        columns: columns as SessionsRequest['columns'],
        ...range,
    };
    return {
        query: JSON.stringify(request),
        localSorts: args.metricQuery.sorts,
    };
};

const toIssueSort = (
    sorts: SortField[],
    apiName: (fieldId: string) => string,
): Pick<IssuesRequest, 'sort'> & { localSorts: SortField[] } => {
    const [first, ...others] = sorts;
    if (!first) {
        return { localSorts: [] };
    }
    const sort =
        others.length === 0 && first.descending
            ? ISSUE_SORTS[apiName(first.fieldId)]
            : undefined;
    return sort ? { sort, localSorts: [] } : { localSorts: sorts };
};

/**
 * Issues have no date range of their own: Sentry lists the issues with
 * events in the days it keeps, and First seen and Last seen filter them.
 */
const compileIssues = ({
    explore,
    metricQuery,
    today,
}: CompileArgs): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const rules = getActiveFilterRules(metricQuery.filters.dimensions);
    const isDateRule = (rule: FilterRule) =>
        ISSUE_DATES.includes(apiName(rule.target.fieldId));
    const seenRange = (field: string) => {
        const dateRules = rules.filter(
            (rule) => apiName(rule.target.fieldId) === field,
        );
        if (dateRules.length > 1) {
            throw new ParameterError(
                'Filter each issue date one time. Combine its filters into one range.',
            );
        }
        return dateRules[0]
            ? toDayRange(dateRules[0], { today, defaultDays: 30 })
            : undefined;
    };
    const filters = rules
        .filter((rule) => !isDateRule(rule))
        .map((rule) => toFilter(apiName(rule.target.fieldId), rule));
    const firstSeen = seenRange('first_seen');
    const lastSeen = seenRange('last_seen');
    const { localSorts, ...sort } = toIssueSort(metricQuery.sorts, apiName);
    const request: IssuesRequest = {
        kind: 'issues',
        columns: metricQuery.dimensions.map(
            apiName,
        ) as IssuesRequest['columns'],
        ...(filters.length > 0 ? { filters } : {}),
        ...(firstSeen ? { firstSeen } : {}),
        ...(lastSeen ? { lastSeen } : {}),
        ...sort,
    };
    return { query: JSON.stringify(request), localSorts };
};

/**
 * Compiles a metric query on a Sentry explore into one request: grouped
 * errors, an issue list, or release health. `today` is in UTC, the time
 * zone Sentry reports in.
 */
export const compileSentryQuery = (args: CompileArgs): LiveCompiledRequest => {
    switch (toKind(args.explore)) {
        case 'errors':
            return compileErrors(args);
        case 'issues':
            return compileIssues(args);
        case 'sessions':
            return compileSessions(args);
        default:
            throw new ParameterError(
                `"${args.explore.name}" isn't a Sentry explore.`,
            );
    }
};
