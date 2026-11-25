import {
    ApiConnectorType,
    getGooglePlayAppPath,
    GOOGLE_PLAY_ORIGIN,
    GOOGLE_PLAY_SCOPE,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileGooglePlayQuery } from './compile';
import { toGooglePlayError } from './errors';
import {
    GOOGLE_PLAY_DATE_FILTERS,
    GOOGLE_PLAY_EQUALS_FILTERS,
    GOOGLE_PLAY_EXPLORES,
} from './explores';
import {
    GOOGLE_PLAY_CALLS_PER_QUERY,
    GOOGLE_PLAY_MAX_QUERY_ROWS,
    GOOGLE_PLAY_TIME_ZONE,
    googlePlayRequestSchema,
    runGooglePlayQuery,
} from './run';
import { summarizeGooglePlayTest } from './testSummary';
import { googlePlayUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_PLAY];
const LABEL = CATALOG.messageLabel;
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

const [firstExplore, ...otherExplores] = GOOGLE_PLAY_EXPLORES.map(
    ({ definition }) => definition,
);

export const googlePlayIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GOOGLE_PLAY,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [GOOGLE_PLAY_ORIGIN],
    access: ({ packageName }) => ({
        pathPrefixes: [getGooglePlayAppPath(packageName)],
        methods: ['GET', 'POST'],
    }),
    limits: {
        callsPerQuery: GOOGLE_PLAY_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: GOOGLE_PLAY_MAX_QUERY_ROWS,
    },
    capabilities: {
        filters: {
            operators: {
                string: GOOGLE_PLAY_EQUALS_FILTERS,
                number: GOOGLE_PLAY_EQUALS_FILTERS,
                date: GOOGLE_PLAY_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: GOOGLE_PLAY_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [firstExplore, ...otherExplores],
    plannedModelNames: [
        'slow_rendering',
        'error_issues',
        'installs',
        'ratings',
        'reviews',
    ],
    level: {
        value: 3,
        description:
            'Vitals metric sets return rates Google computes per day and dimension; nothing is totalled across days.',
    },
    auth: {
        description:
            'A Google Cloud service account invited to the Play Console account with read access; no Google review. Vitals exist only for apps with enough users.',
        testWith: 'real_account',
        needs: ['gmail', 'card'],
        token: true,
        oauth: 'needs_review',
    },
    paging: {
        description:
            'One call returns up to 10,000 rows; a page token reads the next page.',
    },
    rateLimits: {
        concurrentCalls: 2,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 60,
            },
        ],
    },
    useCases: googlePlayUseCases,
    validate: ({ packageName }) => {
        if (!PACKAGE_NAME.test(packageName)) {
            throw new ParameterError(
                'The Google Play package name must look like com.example.app',
            );
        }
    },
    checkAuth: ({ type, oauthScopes }) => {
        if (
            type !== 'google_service_account' ||
            oauthScopes?.length !== 1 ||
            oauthScopes[0] !== GOOGLE_PLAY_SCOPE
        ) {
            throw new ParameterError(
                'Google Play connections authenticate with a Google service account key and the playdeveloperreporting scope',
            );
        }
    },
    describeTarget: ({ settings: { packageName } }) =>
        `Google Play app ${packageName}`,
    parseRequest: jsonRequest(LABEL, googlePlayRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileGooglePlayQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, GOOGLE_PLAY_TIME_ZONE),
            maxRows: GOOGLE_PLAY_MAX_QUERY_ROWS,
        }),
    run: runGooglePlayQuery,
    toError: toGooglePlayError,
    summarizeTest: summarizeGooglePlayTest,
});
