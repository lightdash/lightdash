import { ApiConnectorType } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    LIVE_FILTERS,
    type LiveQuery,
} from '../../sdk';
import { toMetaAdsError } from './api';
import { compileMetaAdsQuery } from './compile';
import { META_ADS_NAME_FILTERS } from './model';
import {
    META_ADS_CALLS_PER_QUERY,
    META_ADS_MAX_QUERY_ROWS,
    META_ADS_PAGE_SIZE,
    metaAdsRequestSchema,
    runMetaAdsQuery,
    type MetaAdsRequest,
} from './run';

export const metaAdsQuery: LiveQuery<
    ApiConnectorType.META_ADS,
    MetaAdsRequest
> = {
    request: metaAdsRequestSchema,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileMetaAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
            maxRows: META_ADS_MAX_QUERY_ROWS,
        }),
    run: runMetaAdsQuery,
    toError: (response, { adAccountId }) =>
        toMetaAdsError(response, adAccountId),
    // Insights ANDs one flat list of filters on ad objects and reads one date
    // range in the ad account's time zone. Everything else is refused.
    capabilities: {
        filters: {
            operators: {
                string: META_ADS_NAME_FILTERS,
                date: LIVE_FILTERS.dateRangeOrFrom,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: LIVE_FILTERS.dateRangeOrFrom,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: META_ADS_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: META_ADS_MAX_QUERY_ROWS,
        pageSize: META_ADS_PAGE_SIZE,
        // Meta counts load per app and ad account and publishes no fixed number,
        // so these stay well below what its best-practices page warns about.
        concurrentCalls: 3,
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
        note: 'Meta scores load per app and ad account and publishes no fixed number.',
    },
};
