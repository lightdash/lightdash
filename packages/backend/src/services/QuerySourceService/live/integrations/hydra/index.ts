import {
    ApiConnectorType,
    getHydraSettingsProblem,
    HYDRA_ACCOUNT_PATH,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { type LiveLimits } from '../../types';
import { compileHydraQuery } from './compile';
import { toHydraError } from './errors';
import {
    HYDRA_DATE_FILTERS,
    HYDRA_EVENTS_EXPLORE,
    HYDRA_STRING_FILTERS,
    HYDRA_USERS_EXPLORE,
} from './explores';
import { hydraReportSchema } from './report';
import { HYDRA_MAX_QUERY_ROWS, runHydraQuery } from './run';
import { summarizeHydraTest } from './testSummary';
import { hydraUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HYDRA];
const LABEL = CATALOG.messageLabel;

// The defaults every source starts from; its settings set the call limits
const LIMITS: LiveLimits = {
    concurrentCalls: 2,
    callsPerMinute: 30,
    callsPerHour: 300,
    callsPerQuery: 1,
    timeoutMs: 30_000,
    maxRows: HYDRA_MAX_QUERY_ROWS,
};

/**
 * Hydra, the test integration: a normal integration run by the shared
 * engine, whose API is answered in-process (see `server.ts`). Registered only
 * when LIVE_SOURCES_HYDRA_ENABLED is true.
 */
export const hydraIntegration = defineLiveIntegration({
    connector: ApiConnectorType.HYDRA,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [HYDRA_ORIGIN],
    access: () => ({
        pathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
        methods: ['GET', 'POST'],
    }),
    limits: LIMITS,
    limitsFor: ({ callsPerMinute, callsPerHour }) => ({
        ...LIMITS,
        callsPerMinute,
        callsPerHour,
    }),
    // One AND of report filters, each keeping or dropping a list of values.
    // Events are read over one range of UTC days.
    capabilities: {
        filters: {
            operators: {
                string: HYDRA_STRING_FILTERS,
                date: HYDRA_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: HYDRA_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [HYDRA_EVENTS_EXPLORE, HYDRA_USERS_EXPLORE],
    plannedModelNames: [],
    level: {
        value: 3,
        description:
            'Reports return totals per dimension, filtered and sorted by the API.',
    },
    auth: {
        description:
            'A test integration: any token signs in, and each token seeds its own rows.',
        testWith: 'test_account',
        needs: ['invite'],
        token: true,
        oauth: 'none',
    },
    paging: {
        description:
            'One call returns up to 10,000 groups; there is no paging.',
    },
    rateLimits: {
        concurrentCalls: LIMITS.concurrentCalls,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: LIMITS.callsPerMinute,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: LIMITS.callsPerHour,
            },
        ],
        note: 'Each source sets its own per-minute and per-hour limits, and can answer 429 with Retry-After every Nth call.',
    },
    useCases: hydraUseCases,
    validate: (settings) => {
        const problem = getHydraSettingsProblem(settings);
        if (problem) {
            throw new ParameterError(`The Hydra setting ${problem}`);
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Hydra connections authenticate with a token',
            );
        }
    },
    describeTarget: () =>
        'Hydra test data: seeded product events and users, for testing',
    parseRequest: jsonRequest(LABEL, hydraReportSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileHydraQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runHydraQuery,
    toError: (response) => toHydraError(response),
    summarizeTest: summarizeHydraTest,
});
