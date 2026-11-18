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
    getLiveDefinitionName,
    getLiveExplore,
    getLiveLocalAggregates,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { getLiveDateRange, toAbsoluteDateRange } from '../../query/dateRange';
import {
    GITHUB_ISSUES_EXPLORE,
    GITHUB_PULL_REQUESTS_EXPLORE,
} from './explores';
import { type GithubRequest } from './run';

/** The first day GitHub can have anything on, for open-ended date filters. */
const GITHUB_EARLIEST_DATE = '2008-01-01';

const SEARCH_DATE_QUALIFIERS: Record<string, string> = {
    created_at: 'created',
    updated_at: 'updated',
    closed_at: 'closed',
    merged_at: 'merged',
};

const SEARCH_SORTS: Record<string, 'created' | 'updated' | 'comments'> = {
    created_at: 'created',
    updated_at: 'updated',
    comments: 'comments',
};

const PULL_REQUEST_STATES: Record<string, string> = {
    open: 'is:open',
    merged: 'is:merged',
    closed: 'is:closed is:unmerged',
};

const ISSUE_STATES: Record<string, string> = {
    open: 'is:open',
    closed: 'is:closed',
};

const STATE_REASONS: Record<string, string> = {
    completed: 'reason:completed',
    not_planned: 'reason:"not planned"',
    reopened: 'reason:reopened',
};

/** A search term or qualifier value; quotes would end it early. */
const quote = (value: unknown) => `"${String(value).replace(/"/g, '')}"`;

const toDateRange = (rule: FilterRule, today: string) => {
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays: 30,
            today,
            earliestDate: GITHUB_EARLIEST_DATE,
        }),
        today,
    );
    return `${startDate}..${endDate}`;
};

const lookUp = (
    values: Record<string, string>,
    value: unknown,
    label: string,
) => {
    const key = String(value);
    if (!Object.hasOwn(values, key)) {
        throw new ParameterError(
            `${label} must be one of: ${Object.keys(values).join(', ')}.`,
        );
    }
    return values[key];
};

/** One search qualifier per rule. Expects a query that passed the shared check. */
const toQualifier = (
    apiName: string,
    rule: FilterRule,
    { type, today }: { type: 'pr' | 'issue'; today: string },
): string => {
    const [value] = rule.values ?? [];
    const negate = rule.operator === FilterOperator.NOT_EQUALS;
    const match = (qualifier: string, text: string) =>
        `${negate ? '-' : ''}${qualifier}:${text}`;
    if (Object.hasOwn(SEARCH_DATE_QUALIFIERS, apiName)) {
        return `${SEARCH_DATE_QUALIFIERS[apiName]}:${toDateRange(rule, today)}`;
    }
    switch (apiName) {
        case 'title':
        case 'search': {
            const scope = apiName === 'title' ? 'in:title' : 'in:title,body';
            const words = (rule.values ?? []).map(quote).join(' ');
            return rule.operator === FilterOperator.NOT_INCLUDE
                ? `NOT ${words} ${scope}`
                : `${words} ${scope}`;
        }
        case 'author':
            return match('author', String(value).trim());
        case 'assignee':
            return match('assignee', String(value).trim());
        case 'labels':
            return match('label', quote(value));
        case 'state':
            return lookUp(
                type === 'pr' ? PULL_REQUEST_STATES : ISSUE_STATES,
                value,
                'State',
            );
        case 'state_reason':
            return lookUp(STATE_REASONS, value, 'State reason');
        case 'draft':
            return `draft:${String(value) === 'true'}`;
        case 'comments': {
            const count = Number(value);
            if (!Number.isInteger(count) || count < 0) {
                throw new ParameterError('Comments must be a whole number.');
            }
            if (rule.operator === FilterOperator.GREATER_THAN) {
                return `comments:>${count}`;
            }
            return rule.operator === FilterOperator.LESS_THAN
                ? `comments:<${count}`
                : `comments:${count}`;
        }
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered on GitHub.`,
            );
    }
};

/** Search sorts created, updated and comments; any other order is ours. */
const toSearchSort = (
    sorts: SortField[],
    apiName: (fieldId: string) => string,
) => {
    const [first, ...others] = sorts;
    if (!first) {
        return { localSorts: [] };
    }
    const sort =
        others.length === 0 ? SEARCH_SORTS[apiName(first.fieldId)] : undefined;
    return sort
        ? {
              sort,
              order: first.descending ? ('desc' as const) : ('asc' as const),
              localSorts: [],
          }
        : { localSorts: sorts };
};

const compileSearch = ({
    explore,
    metricQuery,
    type,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    type: 'pr' | 'issue';
    today: string;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const q = getActiveFilterRules(metricQuery.filters.dimensions)
        .map((rule) =>
            toQualifier(apiName(rule.target.fieldId), rule, { type, today }),
        )
        .join(' ');
    // Count alone is the search total; split by a dimension, it's counted
    // from the results read
    if (metricQuery.metrics.length > 0 && metricQuery.dimensions.length === 0) {
        const request: GithubRequest = {
            kind: 'search',
            type,
            q,
            columns: ['total_count'],
        };
        return { query: JSON.stringify(request), localSorts: [] };
    }
    const localAggregates = getLiveLocalAggregates(
        type === 'pr' ? GITHUB_PULL_REQUESTS_EXPLORE : GITHUB_ISSUES_EXPLORE,
        explore,
        metricQuery,
    );
    const columns = metricQuery.dimensions.map(apiName) as Extract<
        GithubRequest,
        { kind: 'search' }
    >['columns'];
    if (metricQuery.metrics.length > 0) {
        const request: GithubRequest = { kind: 'search', type, q, columns };
        return { query: JSON.stringify(request), localAggregates };
    }
    const { localSorts, ...sort } = toSearchSort(metricQuery.sorts, apiName);
    const request: GithubRequest = {
        kind: 'search',
        type,
        q,
        columns,
        ...sort,
    };
    return { query: JSON.stringify(request), localSorts };
};

const compileContributors = ({
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
    const rules = getActiveFilterRules(metricQuery.filters.dimensions);
    const authors = rules.filter(
        (rule) => apiName(rule.target.fieldId) === 'author',
    );
    const weekRule = rules.find(
        (rule) => apiName(rule.target.fieldId) === 'week',
    );
    const weeks = weekRule
        ? toAbsoluteDateRange(
              getLiveDateRange({
                  rule: weekRule,
                  defaultDays: 30,
                  today,
                  earliestDate: GITHUB_EARLIEST_DATE,
              }),
              today,
          )
        : null;
    const valuesOf = (operator: FilterOperator) =>
        authors
            .filter((rule) => rule.operator === operator)
            .flatMap((rule) => (rule.values ?? []).map(String));
    const included = valuesOf(FilterOperator.EQUALS);
    const excluded = valuesOf(FilterOperator.NOT_EQUALS);
    const request: GithubRequest = {
        kind: 'contributors',
        columns: [...metricQuery.dimensions, ...metricQuery.metrics].map(
            apiName,
        ) as Extract<GithubRequest, { kind: 'contributors' }>['columns'],
        ...(weeks ? { since: weeks.startDate, until: weeks.endDate } : {}),
        ...(included.length > 0 ? { authors: included } : {}),
        ...(excluded.length > 0 ? { excludeAuthors: excluded } : {}),
    };
    // Statistics come unsorted beyond most commits first, so any sort is ours
    return { query: JSON.stringify(request), localSorts: metricQuery.sorts };
};

/**
 * Compiles a metric query on a GitHub explore: pull requests and issues
 * become one search, contributors one statistics read. `today` is in UTC,
 * the time zone GitHub reports in.
 */
export const compileGithubQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const definition = getLiveDefinitionName(explore);
    switch (definition) {
        case 'pull_requests':
            return compileSearch({ explore, metricQuery, type: 'pr', today });
        case 'issues':
            return compileSearch({
                explore,
                metricQuery,
                type: 'issue',
                today,
            });
        case 'contributors':
            return compileContributors({ explore, metricQuery, today });
        default:
            throw new ParameterError(
                `"${explore.name}" isn't a GitHub explore.`,
            );
    }
};
