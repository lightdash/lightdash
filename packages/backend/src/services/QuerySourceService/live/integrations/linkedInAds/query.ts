import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toLinkedInApiError } from './api';
import { compileLinkedInAdsQuery } from './compile';
import { LINKEDIN_ADS_DATE_FILTERS, LINKEDIN_ADS_ID_FILTERS } from './model';
import {
    LINKEDIN_ADS_CALLS_PER_QUERY,
    LINKEDIN_ADS_MAX_QUERY_ROWS,
    linkedInAdsRequestSchema,
    runLinkedInAdsQuery,
    type LinkedInAdsRequest,
} from './run';

// LinkedIn reports in UTC, whatever the project's time zone.
const TIME_ZONE = 'UTC';

export const linkedInAdsQuery: LiveQuery<
    ApiConnectorType.LINKEDIN_ADS,
    LinkedInAdsRequest
> = {
    request: linkedInAdsRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileLinkedInAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, TIME_ZONE),
        }),
    run: runLinkedInAdsQuery,
    toError: (response, { adAccountId }) =>
        toLinkedInApiError(response, adAccountId),
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
    limits: {
        callsPerQuery: LINKEDIN_ADS_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: LINKEDIN_ADS_MAX_QUERY_ROWS,
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
};
