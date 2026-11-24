import {
    ApiConnectorType,
    APP_STORE_CONNECT_ORIGIN,
    getAppStoreConnectAppPath,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { compileAppStoreConnectQuery } from './compile';
import { toAppStoreConnectError } from './errors';
import {
    APP_STORE_CONNECT_BUILDS_EXPLORE,
    APP_STORE_CONNECT_CUSTOMER_REVIEWS_EXPLORE,
    APP_STORE_CONNECT_FILTERS,
    APP_STORE_CONNECT_REVIEW_SUBMISSIONS_EXPLORE,
    APP_STORE_CONNECT_VERSIONS_EXPLORE,
} from './explores';
import {
    APP_STORE_CONNECT_CALLS_PER_QUERY,
    APP_STORE_CONNECT_MAX_QUERY_ROWS,
    appStoreConnectRequestSchema,
    runAppStoreConnectQuery,
} from './run';
import { summarizeAppStoreConnectTest } from './testSummary';
import { appStoreConnectUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.APP_STORE_CONNECT];
const LABEL = CATALOG.messageLabel;
const APP_ID = /^\d{6,12}$/;

export const appStoreConnectIntegration = defineLiveIntegration({
    connector: ApiConnectorType.APP_STORE_CONNECT,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [APP_STORE_CONNECT_ORIGIN],
    access: ({ appId }) => ({
        pathPrefixes: [getAppStoreConnectAppPath(appId)],
        methods: ['GET'],
    }),
    limits: {
        callsPerQuery: APP_STORE_CONNECT_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: APP_STORE_CONNECT_MAX_QUERY_ROWS,
    },
    // Lists AND one filter per field, each ORing its comma-separated values;
    // counts come from the list total and can't be grouped
    capabilities: {
        filters: {
            operators: {
                string: APP_STORE_CONNECT_FILTERS,
                number: APP_STORE_CONNECT_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: false,
            operators: [],
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [
        APP_STORE_CONNECT_VERSIONS_EXPLORE,
        APP_STORE_CONNECT_BUILDS_EXPLORE,
        APP_STORE_CONNECT_CUSTOMER_REVIEWS_EXPLORE,
        APP_STORE_CONNECT_REVIEW_SUBMISSIONS_EXPLORE,
    ],
    plannedModelNames: [
        'downloads',
        'sessions',
        'installs',
        'crashes',
        'sales',
        'subscriptions',
        'ratings',
    ],
    level: {
        value: 2,
        description:
            'Lists return records with one total per filter; nothing else is totalled.',
    },
    auth: {
        description:
            'A team API key created in App Store Connect: key ID, issuer ID and a .p8 private key. No Apple review, but the Apple Developer Program is paid.',
        testWith: 'paid_account',
        needs: ['card'],
        token: true,
        oauth: 'none',
    },
    paging: {
        description:
            'Lists return up to 200 records a call, with a cursor to the next page and a total.',
    },
    rateLimits: {
        concurrentCalls: 4,
        callsPerSecond: null,
        buckets: [
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 1_000,
            },
        ],
        note: 'Apple allows about 3,500 requests an hour per API key, shared with everything else that uses the key.',
    },
    useCases: appStoreConnectUseCases,
    validate: ({ appId }) => {
        if (!APP_ID.test(appId)) {
            throw new ParameterError(
                "The App Store Connect app ID is the number in the app's App Store URL, such as 6803089592",
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'app_store_connect_key') {
            throw new ParameterError(
                'App Store Connect connections authenticate with a team API key: its key ID, issuer ID and .p8 private key',
            );
        }
    },
    describeTarget: ({ settings: { appId } }) =>
        `App Store Connect app ${appId}`,
    parseRequest: jsonRequest(LABEL, appStoreConnectRequestSchema),
    compile: ({ explore, metricQuery }) =>
        compileAppStoreConnectQuery({ explore, metricQuery }),
    run: runAppStoreConnectQuery,
    toError: (response, settings) => toAppStoreConnectError(response, settings),
    summarizeTest: summarizeAppStoreConnectTest,
});
