import {
    ApiConnectorType,
    getHydraSettingsProblem,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SETTINGS,
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
import { getHydraDeclaredLimits } from './declaredLimits';
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

const LIMITS: LiveLimits = {
    // Enough pages for the row cap at the smallest page size, 10
    callsPerQuery: 51,
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
    rateLimitsFor: getHydraDeclaredLimits,
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
            "One call returns up to 10,000 groups, or the source's pageSize, and says where the next page starts.",
    },
    rateLimits: getHydraDeclaredLimits(HYDRA_DEFAULT_SETTINGS),
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
