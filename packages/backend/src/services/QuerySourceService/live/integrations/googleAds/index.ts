import {
    ApiConnectorType,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import { z } from 'zod';
import { ALL_PUSHDOWN_REFUSED } from '../../../api/ApiConnector';
import { getIsoDateInTimeZone } from '../../../api/apiDateRange';
import { defineLiveIntegration } from '../../defineLiveIntegration';
import { assertGoogleSignIn } from '../google/signIn';
import { compileGoogleAdsQuery } from './compile';
import { toGoogleAdsApiError } from './errors';
import {
    GOOGLE_ADS_DATE_FILTERS,
    GOOGLE_ADS_METRIC_FILTERS,
    GOOGLE_ADS_PERFORMANCE_EXPLORE,
    GOOGLE_ADS_STRING_FILTERS,
} from './explores';
import {
    getGoogleAdsSearchPath,
    GOOGLE_ADS_MAX_QUERY_ROWS,
    GOOGLE_ADS_ORIGIN,
    parseGoogleAdsRequest,
    runGoogleAdsQuery,
} from './run';

const GOOGLE_ADS_CUSTOMER_ID = /^\d{10}$/;
const LABEL = 'Google Ads';

export const googleAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.GOOGLE_ADS,
    label: LABEL,
    settings: z.object({
        connector: z.literal(ApiConnectorType.GOOGLE_ADS),
        customerId: z.string(),
        loginCustomerId: z.string().nullable(),
    }),
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
    // Daily operations are shared by every connection of the server's Google
    // client (2,880 at Explorer access), so one connection can't take them all.
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: 1,
        timeoutMs: 60_000,
        maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
    },
    // GAQL ANDs one flat list of conditions, so OR and nested groups are
    // refused. Dates are a finite range in the account's own time zone, and
    // metric filters apply to the returned rows.
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
    explores: [GOOGLE_ADS_PERFORMANCE_EXPLORE],
    plannedModelNames: [
        'ads',
        'keywords',
        'search_terms',
        'conversions',
        'locations',
    ],
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
