import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    PYLON_ACCOUNTS_SEARCH_PATH,
    PYLON_CONTACTS_SEARCH_PATH,
    PYLON_ISSUES_SEARCH_PATH,
    PYLON_ORIGIN,
    PYLON_USERS_PATH,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compilePylonQuery } from './compile';
import { toPylonError } from './errors';
import {
    PYLON_ACCOUNTS_EXPLORE,
    PYLON_CONTACTS_EXPLORE,
    PYLON_DATE_FILTERS,
    PYLON_ISSUES_EXPLORE,
    PYLON_NUMBER_FILTERS,
    PYLON_SET_FILTERS,
    PYLON_TEXT_FILTERS,
    PYLON_VALUE_FILTERS,
} from './explores';
import {
    PYLON_CALLS_PER_QUERY,
    PYLON_MAX_QUERY_ROWS,
    pylonRequestSchema,
    runPylonQuery,
} from './run';
import { summarizePylonTest } from './testSummary';
import { pylonUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.PYLON];
const LABEL = CATALOG.messageLabel;

export const pylonIntegration = defineLiveIntegration({
    connector: ApiConnectorType.PYLON,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [PYLON_ORIGIN],
    // Searches are POSTs but only read; nothing else on the API is reachable
    access: () => ({
        pathPrefixes: [
            PYLON_ISSUES_SEARCH_PATH,
            PYLON_ACCOUNTS_SEARCH_PATH,
            PYLON_CONTACTS_SEARCH_PATH,
            PYLON_USERS_PATH,
        ],
        methods: ['GET', 'POST'],
    }),
    // Each search endpoint allows 120 calls a minute per workspace
    limits: {
        concurrentCalls: 2,
        callsPerMinute: 100,
        callsPerHour: 3_000,
        callsPerQuery: PYLON_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: PYLON_MAX_QUERY_ROWS,
    },
    // One AND of search filters, each taking a list of values. Issues are
    // searched by a range of creation days; dates are UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [
                    ...PYLON_VALUE_FILTERS,
                    ...PYLON_TEXT_FILTERS,
                    ...PYLON_SET_FILTERS,
                ],
                number: PYLON_NUMBER_FILTERS,
                date: PYLON_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: PYLON_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [
        PYLON_ISSUES_EXPLORE,
        PYLON_ACCOUNTS_EXPLORE,
        PYLON_CONTACTS_EXPLORE,
    ],
    plannedModelNames: ['messages', 'users', 'teams'],
    level: {
        value: 2,
        description:
            'No. Filtered search returns records; totals are computed locally.',
    },
    auth: {
        description: 'Offers a token. No vendor review is needed.',
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        token: true,
        oauth: 'none',
    },
    paging: {
        description:
            '1,000 records a page, up to 10 pages, plus name lookups (up to 23 calls a query).',
    },
    rateLimiting: {
        description:
            '120 calls a minute per search endpoint, per workspace; no limit on calls at once. A query can make 23 calls, so 2 at a time keeps a busy dashboard under 120 a minute.',
    },
    useCases: pylonUseCases,
    validate: () => {},
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Pylon connections authenticate with an API token',
            );
        }
    },
    describeTarget: ({ targetLabel }) =>
        `Pylon workspace${targetLabel ? ` ${targetLabel}` : ''}: support issues, customer accounts and contacts`,
    parseRequest: jsonRequest(LABEL, pylonRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compilePylonQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runPylonQuery,
    toError: (response) => toPylonError(response),
    summarizeTest: summarizePylonTest,
});
