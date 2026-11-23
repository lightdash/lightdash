import {
    AMPLITUDE_PATHS,
    AMPLITUDE_REGION_ORIGINS,
    ApiConnectorType,
    getAmplitudeRegion,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileAmplitudeQuery } from './compile';
import { toAmplitudeError } from './errors';
import {
    AMPLITUDE_DATE_FILTERS,
    AMPLITUDE_EVENTS_EXPLORE,
    AMPLITUDE_FUNNEL_EXPLORE,
    AMPLITUDE_NUMBER_FILTERS,
    AMPLITUDE_PROPERTY_FILTERS,
    AMPLITUDE_RETENTION_EXPLORE,
    AMPLITUDE_SESSIONS_EXPLORE,
    AMPLITUDE_USERS_EXPLORE,
} from './explores';
import {
    AMPLITUDE_CALLS_PER_QUERY,
    AMPLITUDE_MAX_QUERY_ROWS,
    amplitudeRequestSchema,
    runAmplitudeQuery,
} from './run';
import { summarizeAmplitudeTest } from './testSummary';
import { amplitudeUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.AMPLITUDE];
const LABEL = CATALOG.messageLabel;

export const amplitudeIntegration = defineLiveIntegration({
    connector: ApiConnectorType.AMPLITUDE,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [AMPLITUDE_REGION_ORIGINS.us, AMPLITUDE_REGION_ORIGINS.eu],
    access: () => ({
        pathPrefixes: Object.values(AMPLITUDE_PATHS),
        methods: ['GET'],
    }),
    // Amplitude runs 5 Dashboard API queries at once per project and limits
    // their cost per hour (days × conditions × query type). These stay well
    // under it and leave room for other clients of the same project.
    limits: {
        concurrentCalls: 3,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: AMPLITUDE_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: AMPLITUDE_MAX_QUERY_ROWS,
    },
    // Reports take one date range in the project's time zone, by day, week or
    // month, and segments of `is` and `is not` on user properties, ANDed.
    capabilities: {
        filters: {
            operators: {
                string: AMPLITUDE_PROPERTY_FILTERS,
                number: AMPLITUDE_NUMBER_FILTERS,
                date: AMPLITUDE_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: AMPLITUDE_DATE_FILTERS,
            grains: [TimeFrames.DAY, TimeFrames.WEEK, TimeFrames.MONTH],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [
        AMPLITUDE_EVENTS_EXPLORE,
        AMPLITUDE_USERS_EXPLORE,
        AMPLITUDE_FUNNEL_EXPLORE,
        AMPLITUDE_RETENTION_EXPLORE,
        AMPLITUDE_SESSIONS_EXPLORE,
    ],
    plannedModelNames: [
        'lifecycle',
        'stickiness',
        'revenue',
        'composition',
        'cohorts',
    ],
    level: {
        value: 3,
        description:
            'The Dashboard REST API returns totals, uniques, funnels and retention Amplitude computes per event, interval and property.',
    },
    auth: {
        description:
            'A project API key and secret key, signed in with HTTP Basic; no vendor review. The free plan includes APIs.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'none',
    },
    paging: {
        description:
            'No paging: each call returns every row, up to 1,000 group values by default and 20,000 at most.',
    },
    rateLimits: {
        concurrentCalls: 5,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 60,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 1_000,
            },
        ],
        note: 'Amplitude limits query cost, not calls: 108,000 an hour, where one query costs days × conditions × a per-report factor, at least 10.',
    },
    useCases: amplitudeUseCases,
    validate: () => {},
    checkAuth: ({ type }) => {
        if (type !== 'api_key') {
            throw new ParameterError(
                'Amplitude connections authenticate with the project API key and secret key',
            );
        }
    },
    describeTarget: ({ origin, targetLabel }) => {
        const region = getAmplitudeRegion(origin).toUpperCase();
        return `Amplitude project${targetLabel ? ` "${targetLabel}"` : ''}, ${region} data region`;
    },
    parseRequest: jsonRequest(`${LABEL} report`, amplitudeRequestSchema),
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileAmplitudeQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runAmplitudeQuery,
    toError: (response) => toAmplitudeError(response),
    summarizeTest: summarizeAmplitudeTest,
});
