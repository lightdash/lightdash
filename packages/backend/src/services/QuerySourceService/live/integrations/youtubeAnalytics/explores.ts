import { DimensionType, MetricType, TimeFrames } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    explore,
    metric,
    NON_ADDITIVE,
} from '../../explores/declare';
import {
    YOUTUBE_ANALYTICS_DATE_FILTERS,
    YOUTUBE_ANALYTICS_EXACT_FILTERS,
} from './filters';

/**
 * One channel's activity. Field combinations follow YouTube's documented
 * channel reports; anything else is refused by the compiler.
 */
export const YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE = explore({
    name: 'activity',
    label: 'Channel activity',
    description:
        'Views, watch time, engagement and subscribers for one YouTube channel.',
    aiHint: 'Without a Date filter the query reads the last 28 days; YouTube leaves out the most recent days until all metrics are ready. At most 3 dimensions. Device type and Traffic source type only work with Views, Engaged views and Estimated minutes watched. Date month needs a date filter covering whole months; without one it reads the last 12 complete months. With Video ID, YouTube ranks at most 200 videos per query, sorted by a metric descending. Content type must be combined with a date, country, video, device type or traffic source. Average view duration and Average view percentage are averages: never sum them.',
    maxDimensions: 3,
    dateRange: { dimension: 'date', defaultDays: 28 },
    // Device type and traffic source reports document only Views, Engaged views
    // and Estimated minutes watched
    // (https://developers.google.com/youtube/analytics/channel_reports)
    incompatible: [
        {
            fields: ['device_type', 'traffic_source_type'],
            with: [
                'average_view_duration',
                'average_view_percentage',
                'likes',
                'dislikes',
                'comments',
                'shares',
                'subscribers_gained',
                'subscribers_lost',
            ],
            reason: "YouTube's device and traffic source reports only have views, engaged_views, estimated_minutes_watched.",
        },
    ],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: YOUTUBE_ANALYTICS_DATE_FILTERS,
            description: 'Day of the activity.',
            aiHint: 'Without a date filter the query reads the last 28 days. YouTube leaves out the most recent days until all their metrics are ready.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Month of the activity, shown as its first day.',
            aiHint: 'YouTube reports whole months only, so the date filter must cover whole months. Without a date filter the query reads the last 12 complete months.',
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'video_id',
            apiName: 'video',
            label: 'Video ID',
            type: DimensionType.STRING,
            filterOperators: YOUTUBE_ANALYTICS_EXACT_FILTERS,
            description: 'YouTube video ID.',
            aiHint: 'YouTube ranks at most 200 videos per query, by a metric sorted descending.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: YOUTUBE_ANALYTICS_EXACT_FILTERS,
            description:
                "Viewer's country, as a two-letter code such as US. ZZ means unknown.",
        }),
        dimension({
            name: 'device_type',
            apiName: 'deviceType',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Type of device the video was watched on, such as MOBILE, DESKTOP or TV.',
            aiHint: 'Values are DESKTOP, MOBILE, TABLET, TV, GAME_CONSOLE, AUTOMOTIVE, WEARABLE or UNKNOWN_PLATFORM. Only works with Views, Engaged views and Estimated minutes watched.',
        }),
        dimension({
            name: 'traffic_source_type',
            apiName: 'insightTrafficSourceType',
            label: 'Traffic source type',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'How viewers found the video, such as YouTube search, related videos, subscriber feeds or external websites.',
            aiHint: 'Only works with Views, Engaged views and Estimated minutes watched. Values are codes like YT_SEARCH, RELATED_VIDEO, SUBSCRIBER, EXT_URL.',
        }),
        dimension({
            name: 'creator_content_type',
            apiName: 'creatorContentType',
            label: 'Content type',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'Type of content: live stream, Short, story, regular video, or unspecified.',
            aiHint: 'Combine it with a date, country, video, device type or traffic source. Values are LIVE_STREAM, SHORTS, STORY, VIDEO_ON_DEMAND, UNSPECIFIED.',
        }),
    ],
    // Every count is a total per row, so it sums. Averages are per playback.
    metrics: [
        metric({
            name: 'views',
            label: 'Views',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times videos were viewed.',
            aiHint: 'YouTube counts a view differently per report.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'engaged_views',
            apiName: 'engagedViews',
            label: 'Engaged views',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of views that went past the first frames or were started by a click or tap.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'estimated_minutes_watched',
            apiName: 'estimatedMinutesWatched',
            label: 'Estimated minutes watched',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of minutes viewers spent watching videos.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'average_view_duration',
            apiName: 'averageViewDuration',
            label: 'Average view duration',
            type: MetricType.AVERAGE,
            filterOperators: [],
            description: 'Average length of a playback, in seconds.',
            aiHint: 'An average: never sum it.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'average_view_percentage',
            apiName: 'averageViewPercentage',
            label: 'Average view percentage',
            type: MetricType.AVERAGE,
            filterOperators: [],
            description:
                'Average share of a video watched per playback, from 0 to 100.',
            aiHint: 'An average: never sum it.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'likes',
            label: 'Likes',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times viewers liked a video.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'dislikes',
            label: 'Dislikes',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times viewers disliked a video.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'comments',
            label: 'Comments',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of comments viewers posted.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'shares',
            label: 'Shares',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times viewers shared a video with the Share button.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'subscribers_gained',
            apiName: 'subscribersGained',
            label: 'Subscribers gained',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times viewers subscribed to the channel.',
            aiHint: "Filtered to one video, only counts subscriptions from that video's watch page.",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'subscribers_lost',
            apiName: 'subscribersLost',
            label: 'Subscribers lost',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times viewers unsubscribed from the channel.',
            aiHint: "Filtered to one video, only counts unsubscribes from that video's watch page.",
            aggregation: ADDITIVE,
        }),
    ],
});

export const YOUTUBE_ANALYTICS_EXPLORES = [
    YOUTUBE_ANALYTICS_ACTIVITY_EXPLORE,
] as const;
