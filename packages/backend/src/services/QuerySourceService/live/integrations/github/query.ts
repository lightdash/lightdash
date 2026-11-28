import { ApiConnectorType } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toGithubError } from './api';
import { compileGithubQuery } from './compile';
import {
    GITHUB_BOOLEAN_FILTERS,
    GITHUB_DATE_FILTERS,
    GITHUB_NUMBER_FILTERS,
    GITHUB_TEXT_FILTERS,
    GITHUB_VALUE_FILTERS,
} from './model';
import {
    GITHUB_CALLS_PER_QUERY,
    GITHUB_MAX_QUERY_ROWS,
    GITHUB_SEARCH_PAGE_SIZE,
    githubRequestSchema,
    runGithubQuery,
    type GithubRequest,
} from './run';

export const githubQuery: LiveQuery<ApiConnectorType.GITHUB, GithubRequest> = {
    request: githubRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileGithubQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runGithubQuery,
    toError: (response, settings) => toGithubError(response, settings),
    // Search ANDs one flat list of qualifiers, one value each; counts come
    // from the search total and can't be grouped. Dates are UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [...GITHUB_VALUE_FILTERS, ...GITHUB_TEXT_FILTERS],
                number: GITHUB_NUMBER_FILTERS,
                boolean: GITHUB_BOOLEAN_FILTERS,
                date: GITHUB_DATE_FILTERS,
            },
            multipleValues: false,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: false,
            operators: GITHUB_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: GITHUB_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: GITHUB_MAX_QUERY_ROWS,
        pageSize: GITHUB_SEARCH_PAGE_SIZE,
        // Search allows 30 calls a minute per token, the tightest of GitHub's
        // limits; the REST API allows 5,000 an hour.
        concurrentCalls: 3,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 30,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 1_800,
            },
        ],
        note: 'Search allows 30 calls a minute per token; REST allows 5,000 an hour.',
    },
};
