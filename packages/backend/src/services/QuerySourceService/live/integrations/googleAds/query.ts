import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toGoogleAdsApiError } from './api';
import { compileGoogleAdsQuery } from './compile';
import {
    GOOGLE_ADS_DATE_FILTERS,
    GOOGLE_ADS_METRIC_FILTERS,
    GOOGLE_ADS_STRING_FILTERS,
} from './model';
import {
    GOOGLE_ADS_MAX_QUERY_ROWS,
    parseGoogleAdsRequest,
    runGoogleAdsQuery,
    type GoogleAdsRequest,
} from './run';

export const googleAdsQuery: LiveQuery<
    ApiConnectorType.GOOGLE_ADS,
    GoogleAdsRequest
> = {
    request: parseGoogleAdsRequest,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileGoogleAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runGoogleAdsQuery,
    toError: (response, { customerId }) =>
        toGoogleAdsApiError(response, `Google Ads account ${customerId}`),
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
    limits: {
        timeoutMs: 60_000,
        maxRows: GOOGLE_ADS_MAX_QUERY_ROWS,
        // Daily operations are shared by every connection of the server's Google
        // client (2,880 at Explorer access), so one connection can't take them all.
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
    // GAQL ANDs one flat list of conditions, so OR and nested groups are
    // refused. Dates are a finite range in the account's own time zone, and
    // metric filters apply to the returned rows.
    // Week, month and quarter already arrive as their first day
    periodFormats: { [TimeFrames.YEAR]: 'year' },
};
