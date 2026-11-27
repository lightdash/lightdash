import {
    ApiConnectorType,
    getSentryPaths,
    isSentrySlug,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SENTRY_ORIGIN,
    SENTRY_REGION_ORIGINS,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileSentryQuery } from './compile';
import { toSentryError } from './errors';
import {
    SENTRY_BOOLEAN_FILTERS,
    SENTRY_DATE_FILTERS,
    SENTRY_ERRORS_EXPLORE,
    SENTRY_ISSUES_EXPLORE,
    SENTRY_RETENTION_DAYS,
    SENTRY_SESSIONS_EXPLORE,
    SENTRY_TEXT_FILTERS,
    SENTRY_VALUE_FILTERS,
} from './explores';
import {
    runSentryQuery,
    SENTRY_CALLS_PER_QUERY,
    SENTRY_MAX_QUERY_ROWS,
    sentryRequestSchema,
} from './run';
import { summarizeSentryTest } from './testSummary';
import { sentryUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SENTRY];
const LABEL = CATALOG.messageLabel;

export const sentryIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SENTRY,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [
        SENTRY_ORIGIN,
        SENTRY_REGION_ORIGINS.us,
        SENTRY_REGION_ORIGINS.eu,
    ],
    // Reads only, and only of this organization. The token reads every
    // project of it, so each call names the source's projects; see
    // getProjects. No request names an event or an issue, so the paths under
    // these that return one are never called.
    access: ({ organizationSlug }) => ({
        pathPrefixes: Object.values(getSentryPaths(organizationSlug)),
        methods: ['GET'],
    }),
    limits: {
        callsPerQuery: SENTRY_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: SENTRY_MAX_QUERY_ROWS,
    },
    // One AND of search terms, each taking a list of values. Errors and
    // sessions are read over one range of UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [...SENTRY_VALUE_FILTERS, ...SENTRY_TEXT_FILTERS],
                boolean: SENTRY_BOOLEAN_FILTERS,
                date: SENTRY_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: SENTRY_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
            maxLookbackDays: SENTRY_RETENTION_DAYS,
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [
        SENTRY_ERRORS_EXPLORE,
        SENTRY_ISSUES_EXPLORE,
        SENTRY_SESSIONS_EXPLORE,
    ],
    plannedModelNames: ['releases', 'transactions', 'logs', 'monitors'],
    level: {
        value: 4,
        description:
            'Events are grouped and totalled with its own search syntax; issues are a filtered list.',
    },
    auth: {
        description:
            'A token from an internal integration needs no vendor review. OAuth needs a public integration, which Sentry must publish before other organizations can install it.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'needs_review',
    },
    paging: {
        description:
            'Events and issues return up to 100 rows a page, with a cursor in the Link header. Sessions return up to 10,000 data points a call.',
    },
    rateLimits: {
        concurrentCalls: 3,
        callsPerSecond: 5,
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
                capacity: 2_000,
            },
        ],
        note: 'Sentry publishes no numbers: it limits each endpoint per caller and reports the limit in X-Sentry-Rate-Limit headers. These are set low on purpose.',
    },
    useCases: sentryUseCases,
    validate: ({ organizationSlug, projectSlugs }) => {
        if (!isSentrySlug(organizationSlug)) {
            throw new ParameterError(
                'The Sentry organization must be its slug, like acme',
            );
        }
        if (projectSlugs.length === 0 || !projectSlugs.every(isSentrySlug)) {
            throw new ParameterError(
                'Name the Sentry projects to read by their slugs, like mobile-ios',
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Sentry connections authenticate with an auth token',
            );
        }
    },
    describeTarget: ({ settings: { organizationSlug, projectSlugs } }) =>
        `Sentry organization ${organizationSlug}: errors, issues and release health of ${projectSlugs.join(', ')}`,
    parseRequest: jsonRequest(LABEL, sentryRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileSentryQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runSentryQuery,
    toError: (response, settings) => toSentryError(response, settings),
    summarizeTest: summarizeSentryTest,
});
