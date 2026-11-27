import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import { z } from 'zod';
import { ALL_PUSHDOWN_REFUSED, defineLiveIntegration } from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { assertGoogleSignIn } from '../google/signIn';
import { compileGoogleAdsQuery } from './compile';
import { toGoogleAdsApiError } from './errors';
import { GOOGLE_ADS_EXPLORES } from './explores';
import {
    GOOGLE_ADS_DATE_FILTERS,
    GOOGLE_ADS_METRIC_FILTERS,
    GOOGLE_ADS_STRING_FILTERS,
} from './filters';
import {
    getGoogleAdsSearchPath,
    GOOGLE_ADS_MAX_QUERY_ROWS,
    GOOGLE_ADS_ORIGIN,
    parseGoogleAdsRequest,
    runGoogleAdsQuery,
} from './run';
import { googleAdsUseCases } from './useCases';

const GOOGLE_ADS_CUSTOMER_ID = /^\d{10}$/;
const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_ADS];
const LABEL = CATALOG.messageLabel;

export const googleAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GOOGLE_ADS,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [GOOGLE_ADS_ORIGIN],
    // Google's only Ads scope also allows changes, so the source reaches
    // nothing but the read-only report endpoint of its one account.
    access: ({ customerId, loginCustomerId }) => ({
        pathPrefixes: [getGoogleAdsSearchPath(customerId)],
        methods: ['POST'],
        headers: loginCustomerId
            ? { 'login-customer-id': loginCustomerId }
            : null,
    }),
    limits: {
        callsPerQuery: 1,
        timeoutMs: 60_000,
        maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
    },
    // GAQL ANDs one flat list of conditions, so OR and nested groups are
    // refused. Dates are a finite range in the account's own time zone, and
    // metric filters apply to the returned rows.
    // Week, month and quarter already arrive as their first day
    periodFormats: { [TimeFrames.YEAR]: 'year' },
    capabilities: {
        filters: {
            operators: {
                string: GOOGLE_ADS_STRING_FILTERS,
                date: GOOGLE_ADS_DATE_FILTERS,
                metric: GOOGLE_ADS_METRIC_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: true,
        dates: {
            rangeRequired: true,
            operators: GOOGLE_ADS_DATE_FILTERS,
            grains: [
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
            ],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: GOOGLE_ADS_EXPLORES,
    plannedModelNames: [
        'ads',
        'keywords',
        'search_terms',
        'conversions',
        'locations',
    ],
    level: {
        value: 3,
        description:
            'GAQL reports return totals by the segments you pick (date, campaign, ad group).',
    },
    auth: {
        description:
            'Needs Google verification plus a Google Ads access level: Explorer, then Basic or Standard for real customer volume.',
        testWith: 'paid_account',
        needs: ['gmail', 'card'],
        token: false,
        oauth: 'needs_review',
    },
    paging: {
        description:
            'GAQL search returns results in pages of up to 10,000 rows.',
    },
    // Daily operations are shared by every connection of the server's Google
    // client (2,880 at Explorer access), so one connection can't take them all.
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
            {
                id: 'day',
                label: 'per day',
                windowMs: 86_400_000,
                capacity: 1_000,
            },
        ],
        note: 'Daily operations count against our developer token, shared by every customer (2,880 at Explorer access).',
    },
    useCases: googleAdsUseCases,
    validate: ({ customerId, loginCustomerId }) => {
        if (
            !GOOGLE_ADS_CUSTOMER_ID.test(customerId) ||
            (loginCustomerId !== null &&
                !GOOGLE_ADS_CUSTOMER_ID.test(loginCustomerId))
        ) {
            throw new ParameterError(
                'Google Ads customer IDs must be 10 digits without dashes',
            );
        }
    },
    checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
    describeTarget: ({ settings: { customerId }, targetLabel }) =>
        targetLabel
            ? `Google Ads account "${targetLabel}" (ID ${customerId})`
            : `Google Ads account ${customerId}`,
    parseRequest: parseGoogleAdsRequest,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileGoogleAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runGoogleAdsQuery,
    toError: (response, { customerId }) =>
        toGoogleAdsApiError(response, `Google Ads account ${customerId}`),
});
