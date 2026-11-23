import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileLinkedInAdsQuery } from './compile';
import {
    LINKEDIN_ADS_DATE_FILTERS,
    LINKEDIN_ADS_ID_FILTERS,
    LINKEDIN_ADS_PERFORMANCE_EXPLORE,
} from './explores';
import {
    getLinkedInAdsAccountPath,
    LINKEDIN_ADS_ANALYTICS_PATH,
    LINKEDIN_ADS_CALLS_PER_QUERY,
    LINKEDIN_ADS_MAX_QUERY_ROWS,
    LINKEDIN_ADS_ORIGIN,
    LINKEDIN_ADS_REQUEST_HEADERS,
    LINKEDIN_ADS_TOKEN_URL,
    linkedInAdsRequestSchema,
    runLinkedInAdsQuery,
    toLinkedInApiError,
} from './run';
import { linkedInAdsUseCases } from './useCases';

const LINKEDIN_AD_ACCOUNT_ID = /^\d{1,20}$/;
const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.LINKEDIN_ADS];
const LABEL = CATALOG.messageLabel;
// LinkedIn reports in UTC, whatever the project's time zone.
const TIME_ZONE = 'UTC';

export const linkedInAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.LINKEDIN_ADS,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [LINKEDIN_ADS_ORIGIN],
    access: ({ adAccountId }) => ({
        pathPrefixes: [
            LINKEDIN_ADS_ANALYTICS_PATH,
            getLinkedInAdsAccountPath(adAccountId),
        ],
        methods: ['GET'],
        headers: LINKEDIN_ADS_REQUEST_HEADERS,
    }),
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: LINKEDIN_ADS_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: LINKEDIN_ADS_MAX_QUERY_ROWS,
    },
    // adAnalytics filters by campaign and campaign group only, ANDed, and
    // can't filter metrics. Dates are in UTC, grouped by day, month or year.
    capabilities: {
        filters: {
            operators: {
                string: LINKEDIN_ADS_ID_FILTERS,
                date: LINKEDIN_ADS_DATE_FILTERS,
                metric: [],
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: LINKEDIN_ADS_DATE_FILTERS,
            grains: [TimeFrames.DAY, TimeFrames.MONTH, TimeFrames.YEAR],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [LINKEDIN_ADS_PERFORMANCE_EXPLORE],
    // organic_shares needs another API, permission and account, so it may
    // become its own integration; the name stays reserved here.
    plannedModelNames: [
        'creatives',
        'demographics',
        'conversions',
        'organic_shares',
    ],
    level: {
        value: 3,
        description: 'adAnalytics returns totals per pivot and time grain.',
    },
    auth: {
        description:
            "Needs Advertising API approval: Development tier first, then Standard tier to read customers' ad accounts.",
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person', 'vendor_approval'],
        token: false,
        oauth: 'needs_review',
    },
    paging: {
        description:
            'One adAnalytics call returns up to 15,000 rows, with no paging.',
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
        note: 'LinkedIn shows its daily per-app and per-member limits only in the developer portal.',
    },
    useCases: linkedInAdsUseCases,
    validate: ({ adAccountId }) => {
        if (!LINKEDIN_AD_ACCOUNT_ID.test(adAccountId)) {
            throw new ParameterError(
                'The LinkedIn ad account ID must be a number',
            );
        }
    },
    checkAuth: ({ type, oauthTokenUrl }) => {
        if (
            type !== 'oauth_authorization_code' ||
            oauthTokenUrl !== LINKEDIN_ADS_TOKEN_URL
        ) {
            throw new ParameterError(
                'LinkedIn Ads connections authenticate by signing in with LinkedIn',
            );
        }
    },
    describeTarget: ({ settings: { adAccountId } }) =>
        `LinkedIn Ads account ${adAccountId}`,
    parseRequest: jsonRequest('LinkedIn Ads report', linkedInAdsRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileLinkedInAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, TIME_ZONE),
        }),
    run: runLinkedInAdsQuery,
    toError: (response, { adAccountId }) =>
        toLinkedInApiError(response, adAccountId),
});
