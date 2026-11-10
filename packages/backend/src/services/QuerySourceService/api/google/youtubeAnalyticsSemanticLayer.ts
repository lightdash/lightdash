import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    ApiSourceDimensionDefinition,
    ApiSourceExploreDefinition,
    ApiSourceMetricDefinition,
} from '../apiSourceExplore';

export const YOUTUBE_ANALYTICS_SEMANTIC_LAYER_VERSION = 1;

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
): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
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
    format?: string,
): ApiSourceMetricDefinition => ({
    name,
    apiName,
    label,
    description,
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
) => metric(name, apiName, label, MetricType.SUM, ADDITIVE, description);

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
export const YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE: ApiSourceExploreDefinition = {
    name: 'activity',
    label: 'Channel activity',
    description:
        'Views, watch time, engagement and subscribers for one YouTube channel, from the YouTube Analytics API.',
    dimensions: [
        {
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: YOUTUBE_ANALYTICS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: `Day of the activity. Queries without a date filter read the last 28 days. ${DAY_LAG_NOTE}`,
        },
        {
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description:
                'First day of the month. YouTube reports whole months only, so the date filter must cover whole months. Queries without a date filter read the last 12 complete months.',
        },
        dimension(
            'video_id',
            'video',
            'Video ID',
            'YouTube video ID. YouTube ranks at most 200 videos per query, by a metric sorted descending.',
            YOUTUBE_ANALYTICS_EXACT_FILTERS,
        ),
        dimension(
            'country',
            'country',
            'Country',
            'Two-letter country code, such as US. ZZ means unidentified.',
            YOUTUBE_ANALYTICS_EXACT_FILTERS,
        ),
        dimension(
            'device_type',
            'deviceType',
            'Device type',
            'DESKTOP, MOBILE, TABLET, TV, GAME_CONSOLE, AUTOMOTIVE, WEARABLE or UNKNOWN_PLATFORM.',
        ),
        dimension(
            'traffic_source_type',
            'insightTrafficSourceType',
            'Traffic source type',
            'How viewers reached the video, such as YT_SEARCH, RELATED_VIDEO, SUBSCRIBER or EXT_URL.',
        ),
        dimension(
            'creator_content_type',
            'creatorContentType',
            'Content type',
            'LIVE_STREAM, SHORTS, STORY, VIDEO_ON_DEMAND or UNSPECIFIED. Combine it with a date, country, video, device type or traffic source.',
        ),
    ],
    metrics: [
        count(
            'views',
            'views',
            'Views',
            'Times videos were viewed. YouTube counts a view differently per report.',
        ),
        count(
            'engaged_views',
            'engagedViews',
            'Engaged views',
            'Times videos were viewed past the first frame or started by a click or tap.',
        ),
        count(
            'estimated_minutes_watched',
            'estimatedMinutesWatched',
            'Estimated minutes watched',
            'Minutes viewers watched videos.',
        ),
        metric(
            'average_view_duration',
            'averageViewDuration',
            'Average view duration',
            MetricType.AVERAGE,
            NON_ADDITIVE,
            'Average length of a playback, in seconds. Never sum it.',
        ),
        metric(
            'average_view_percentage',
            'averageViewPercentage',
            'Average view percentage',
            MetricType.AVERAGE,
            NON_ADDITIVE,
            'Average percentage of a video watched per playback, as a number from 0 to 100. Never sum it.',
        ),
        count('likes', 'likes', 'Likes', 'Times viewers liked a video.'),
        count(
            'dislikes',
            'dislikes',
            'Dislikes',
            'Times viewers disliked a video.',
        ),
        count('comments', 'comments', 'Comments', 'Times viewers commented.'),
        count(
            'shares',
            'shares',
            'Shares',
            'Times viewers used the Share button.',
        ),
        count(
            'subscribers_gained',
            'subscribersGained',
            'Subscribers gained',
            'Times viewers subscribed to the channel.',
        ),
        count(
            'subscribers_lost',
            'subscribersLost',
            'Subscribers lost',
            'Times viewers unsubscribed from the channel.',
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
