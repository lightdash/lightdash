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
import { PYLON_EXPLORES } from './explores';
import {
    PYLON_DATE_FILTERS,
    PYLON_NUMBER_FILTERS,
    PYLON_SET_FILTERS,
    PYLON_TEXT_FILTERS,
    PYLON_VALUE_FILTERS,
} from './filters';
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
    limits: {
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
    explores: PYLON_EXPLORES,
    plannedModelNames: ['messages', 'users', 'teams'],
    level: {
        value: 2,
        description: 'Filtered search returns records but no totals.',
    },
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'real_account',
        needs: ['gmail', 'invite'],
        token: true,
        oauth: 'none',
    },
    paging: {
        description:
            'Search returns up to 1,000 records a page, with a cursor.',
    },
    // Each search endpoint allows 120 calls a minute per workspace
    rateLimits: {
        concurrentCalls: 3,
        callsPerSecond: 2,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 100,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 3_000,
            },
        ],
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
