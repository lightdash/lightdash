import {
    ApiConnectorType,
    getGithubContributorsPath,
    GITHUB_ORIGIN,
    GITHUB_SEARCH_PATH,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileGithubQuery } from './compile';
import { toGithubError } from './errors';
import {
    GITHUB_BOOLEAN_FILTERS,
    GITHUB_CONTRIBUTORS_EXPLORE,
    GITHUB_DATE_FILTERS,
    GITHUB_ISSUES_EXPLORE,
    GITHUB_NUMBER_FILTERS,
    GITHUB_PULL_REQUESTS_EXPLORE,
    GITHUB_TEXT_FILTERS,
    GITHUB_VALUE_FILTERS,
} from './explores';
import {
    GITHUB_CALLS_PER_QUERY,
    GITHUB_MAX_QUERY_ROWS,
    githubRequestSchema,
    runGithubQuery,
} from './run';
import { summarizeGithubTest } from './testSummary';
import { githubUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GITHUB];
const LABEL = CATALOG.messageLabel;
// GitHub's own rules for user, organization and repository names
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export const githubIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GITHUB,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [GITHUB_ORIGIN],
    // Search reads any repository the token can, but every request names
    // this one; see toGithubSearchQuery.
    access: ({ owner, repo }) => ({
        pathPrefixes: [
            GITHUB_SEARCH_PATH,
            getGithubContributorsPath(owner, repo),
        ],
        methods: ['GET'],
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Lightdash',
        },
    }),
    // Search allows 30 calls a minute per token, the tightest of GitHub's
    // limits; the REST API allows 5,000 an hour.
    limits: {
        concurrentCalls: 3,
        callsPerMinute: 30,
        callsPerHour: 1_800,
        callsPerQuery: GITHUB_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: GITHUB_MAX_QUERY_ROWS,
    },
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
    explores: [
        GITHUB_PULL_REQUESTS_EXPLORE,
        GITHUB_ISSUES_EXPLORE,
        GITHUB_CONTRIBUTORS_EXPLORE,
    ],
    plannedModelNames: ['workflow_runs', 'releases'],
    level: {
        value: 2,
        description:
            'Search returns a total count per filter; nothing else is totalled.',
    },
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail', 'phone'],
        token: true,
        oauth: 'no_review',
    },
    paging: {
        description:
            'Search returns 100 results a page and stops at 1,000 results.',
    },
    rateLimits: {
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
    useCases: githubUseCases,
    validate: ({ owner, repo }) => {
        if (!GITHUB_OWNER.test(owner)) {
            throw new ParameterError(
                'The GitHub owner must be a user or organization name, like lightdash',
            );
        }
        if (!GITHUB_REPO.test(repo)) {
            throw new ParameterError(
                'The GitHub repository must be its name without the owner, like lightdash',
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'GitHub connections authenticate with a personal access token',
            );
        }
    },
    describeTarget: ({ settings: { owner, repo } }) =>
        `GitHub repository ${owner}/${repo}`,
    parseRequest: jsonRequest(LABEL, githubRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileGithubQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runGithubQuery,
    toError: (response, settings) => toGithubError(response, settings),
    summarizeTest: summarizeGithubTest,
});
