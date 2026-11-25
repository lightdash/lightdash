import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

export const YOUTUBE_ANALYTICS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

// reports.query filters match whole values only
export const YOUTUBE_ANALYTICS_EXACT_FILTERS = [FilterOperator.EQUALS];

const DAY_LAG_NOTE =
    'YouTube leaves out the most recent days until all their metrics are ready.';

const dimension = (
    name: string,
    apiName: string,
    label: string,
    description: string,
    filterOperators: FilterOperator[] = [],
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators,
});

// Every count is a total per row, so it sums. Averages are per playback.
const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    aiHint?: string,
    format?: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: [],
    aggregation,
    ...(format ? { format } : {}),
});

const count = (
    name: string,
    apiName: string,
    label: string,
    description: string,
    aiHint?: string,
) =>
    metric(name, apiName, label, MetricType.SUM, ADDITIVE, description, aiHint);

// The only metrics YouTube's device type and traffic source reports document
// (https://developers.google.com/youtube/analytics/channel_reports)
const PLAYBACK_REPORT_METRICS = [
    'views',
    'engaged_views',
    'estimated_minutes_watched',
];

const CHANNEL_ONLY_METRICS = [
    'average_view_duration',
    'average_view_percentage',
    'likes',
    'dislikes',
    'comments',
    'shares',
    'subscribers_gained',
    'subscribers_lost',
];

/**
 * One channel's activity. Field combinations follow YouTube's documented
 * channel reports; anything else is refused by the compiler.
 */
export const YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE: LiveExploreDefinition = {
    name: 'activity',
    label: 'Channel activity',
    description:
        'Views, watch time, engagement and subscribers for one YouTube channel.',
    aiHint: 'Without a Date filter the query reads the last 28 days; YouTube leaves out the most recent days until all metrics are ready. At most 3 dimensions. Device type and Traffic source type only work with Views, Engaged views and Estimated minutes watched. Date month needs a date filter covering whole months; without one it reads the last 12 complete months. With Video ID, YouTube ranks at most 200 videos per query, sorted by a metric descending. Content type must be combined with a date, country, video, device type or traffic source. Average view duration and Average view percentage are averages: never sum them.',
    dimensions: [
        {
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: YOUTUBE_ANALYTICS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: 'Day of the activity.',
            aiHint: `Without a date filter the query reads the last 28 days. ${DAY_LAG_NOTE}`,
        },
        {
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description: 'Month of the activity, shown as its first day.',
            aiHint: 'YouTube reports whole months only, so the date filter must cover whole months. Without a date filter the query reads the last 12 complete months.',
        },
        dimension(
            'video_id',
            'video',
            'Video ID',
            'YouTube video ID.',
            YOUTUBE_ANALYTICS_EXACT_FILTERS,
            'YouTube ranks at most 200 videos per query, by a metric sorted descending.',
        ),
        dimension(
            'country',
            'country',
            'Country',
            "Viewer's country, as a two-letter code such as US. ZZ means unknown.",
            YOUTUBE_ANALYTICS_EXACT_FILTERS,
        ),
        dimension(
            'device_type',
            'deviceType',
            'Device type',
            'Type of device the video was watched on, such as MOBILE, DESKTOP or TV.',
            [],
            'Values are DESKTOP, MOBILE, TABLET, TV, GAME_CONSOLE, AUTOMOTIVE, WEARABLE or UNKNOWN_PLATFORM. Only works with Views, Engaged views and Estimated minutes watched.',
        ),
        dimension(
            'traffic_source_type',
            'insightTrafficSourceType',
            'Traffic source type',
            'How viewers found the video, such as YouTube search, related videos, subscriber feeds or external websites.',
            [],
            'Only works with Views, Engaged views and Estimated minutes watched. Values are codes like YT_SEARCH, RELATED_VIDEO, SUBSCRIBER, EXT_URL.',
        ),
        dimension(
            'creator_content_type',
            'creatorContentType',
            'Content type',
            'Type of content: live stream, Short, story, regular video, or unspecified.',
            [],
            'Combine it with a date, country, video, device type or traffic source. Values are LIVE_STREAM, SHORTS, STORY, VIDEO_ON_DEMAND, UNSPECIFIED.',
        ),
    ],
    metrics: [
        count(
            'views',
            'views',
            'Views',
            'Number of times videos were viewed.',
            'YouTube counts a view differently per report.',
        ),
        count(
            'engaged_views',
            'engagedViews',
            'Engaged views',
            'Number of views that went past the first frames or were started by a click or tap.',
        ),
        count(
            'estimated_minutes_watched',
            'estimatedMinutesWatched',
            'Estimated minutes watched',
            'Number of minutes viewers spent watching videos.',
        ),
        metric(
            'average_view_duration',
            'averageViewDuration',
            'Average view duration',
            MetricType.AVERAGE,
            NON_ADDITIVE,
            'Average length of a playback, in seconds.',
            'An average: never sum it.',
        ),
        metric(
            'average_view_percentage',
            'averageViewPercentage',
            'Average view percentage',
            MetricType.AVERAGE,
            NON_ADDITIVE,
            'Average share of a video watched per playback, from 0 to 100.',
            'An average: never sum it.',
        ),
        count(
            'likes',
            'likes',
            'Likes',
            'Number of times viewers liked a video.',
        ),
        count(
            'dislikes',
            'dislikes',
            'Dislikes',
            'Number of times viewers disliked a video.',
        ),
        count(
            'comments',
            'comments',
            'Comments',
            'Number of comments viewers posted.',
        ),
        count(
            'shares',
            'shares',
            'Shares',
            'Number of times viewers shared a video with the Share button.',
        ),
        count(
            'subscribers_gained',
            'subscribersGained',
            'Subscribers gained',
            'Number of times viewers subscribed to the channel.',
            "Filtered to one video, only counts subscriptions from that video's watch page.",
        ),
        count(
            'subscribers_lost',
            'subscribersLost',
            'Subscribers lost',
            'Number of times viewers unsubscribed from the channel.',
            "Filtered to one video, only counts unsubscribes from that video's watch page.",
        ),
    ],
    maxDimensions: 3,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [
        {
            fields: ['device_type', 'traffic_source_type'],
            with: CHANNEL_ONLY_METRICS,
            reason: `YouTube's device and traffic source reports only have ${PLAYBACK_REPORT_METRICS.join(', ')}.`,
        },
    ],
};
