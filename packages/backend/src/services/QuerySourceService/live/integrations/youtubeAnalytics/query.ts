import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toGoogleApiError } from '../google/errors';
import { compileYoutubeAnalyticsQuery } from './compile';
import {
    YOUTUBE_ANALYTICS_DATE_FILTERS,
    YOUTUBE_ANALYTICS_EXACT_FILTERS,
} from './model';
import {
    runYoutubeAnalyticsQuery,
    YOUTUBE_ANALYTICS_MAX_QUERY_ROWS,
    youtubeAnalyticsRequestSchema,
    type YoutubeAnalyticsRequest,
} from './run';

const LABEL =
    LIVE_INTEGRATION_CATALOG[ApiConnectorType.YOUTUBE_ANALYTICS].messageLabel;

export const youtubeAnalyticsQuery: LiveQuery<
    ApiConnectorType.YOUTUBE_ANALYTICS,
    YoutubeAnalyticsRequest
> = {
    request: youtubeAnalyticsRequestSchema,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileYoutubeAnalyticsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runYoutubeAnalyticsQuery,
    toError: (response, { channelId }) =>
        toGoogleApiError(response, {
            label: LABEL,
            resource: `channel ${channelId}`,
        }),
    // reports.query ANDs a short list of equals filters and can't filter
    // metrics. It groups by day or month only.
    capabilities: {
        filters: {
            operators: {
                string: YOUTUBE_ANALYTICS_EXACT_FILTERS,
                date: YOUTUBE_ANALYTICS_DATE_FILTERS,
                metric: [],
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: YOUTUBE_ANALYTICS_DATE_FILTERS,
            grains: [TimeFrames.DAY, TimeFrames.MONTH],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        timeoutMs: 30_000,
        maxRows: YOUTUBE_ANALYTICS_MAX_QUERY_ROWS,
        // Google publishes no per-minute figure for this API; these match GA4.
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
    },
};
