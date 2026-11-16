import {
    ApiConnectorType,
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
import { toGoogleApiError } from '../google/errors';
import { assertGoogleSignIn } from '../google/signIn';
import { compileYoutubeAnalyticsQuery } from './compile';
import {
    YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE,
    YOUTUBE_ANALYTICS_DATE_FILTERS,
    YOUTUBE_ANALYTICS_EXACT_FILTERS,
} from './explores';
import {
    runYoutubeAnalyticsQuery,
    YOUTUBE_ANALYTICS_MAX_QUERY_ROWS,
    YOUTUBE_ANALYTICS_ORIGIN,
    YOUTUBE_ANALYTICS_REPORTS_PATH,
    youtubeAnalyticsRequestSchema,
} from './run';

const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const LABEL = 'YouTube Analytics';

export const youtubeAnalyticsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.YOUTUBE_ANALYTICS,
    label: LABEL,
    settings: z.object({
        connector: z.literal(ApiConnectorType.YOUTUBE_ANALYTICS),
        channelId: z.string(),
    }),
    origins: [YOUTUBE_ANALYTICS_ORIGIN],
    // The query names the channel on every report, so the path can't narrow
    // a source to it.
    access: () => ({
        pathPrefixes: [YOUTUBE_ANALYTICS_REPORTS_PATH],
        methods: ['GET'],
    }),
    // Google publishes no per-minute figure for this API; these match GA4.
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: 1,
        timeoutMs: 30_000,
        maxRows: YOUTUBE_ANALYTICS_MAX_QUERY_ROWS,
    },
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
    explores: [YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE],
    plannedModelNames: [
        'demographics',
        'playlists',
        'revenue',
        'audience_retention',
    ],
    validate: ({ channelId }) => {
        if (!YOUTUBE_CHANNEL_ID.test(channelId)) {
            throw new ParameterError(
                'The YouTube channel ID must look like UC followed by 22 characters',
            );
        }
    },
    checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
    describeTarget: ({ settings: { channelId }, targetLabel }) =>
        targetLabel
            ? `YouTube channel "${targetLabel}" (ID ${channelId})`
            : `YouTube channel ${channelId}`,
    parseRequest: jsonRequest(
        'YouTube Analytics report',
        youtubeAnalyticsRequestSchema,
    ),
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
});
