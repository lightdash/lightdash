// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const youtubeAnalyticsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'YTB-01',
            question:
                'How have views, watch time and average view duration trended day by day across the channel this year?',
            possible: true,
        },
        {
            id: 'YTB-02',
            question:
                'How many subscribers did we gain and lose each day, and are we losing more than we gain?',
            possible: true,
        },
        {
            id: 'YTB-03',
            question: 'Which videos drove the most watch time this month?',
            possible: true,
        },
        {
            id: 'YTB-04',
            question:
                'How has this one video performed since it was published: total views, watch time, likes, comments, shares and subscribers gained?',
            possible: true,
        },
        {
            id: 'YTB-05',
            question:
                'At what points in this video do viewers drop off or rewatch, and what share is still watching after the first 30 seconds?',
            possible: false,
        },
        {
            id: 'YTB-06',
            question:
                'How do viewers find our videos: YouTube search, suggested videos, browse, playlists or external sites?',
            possible: true,
        },
        {
            id: 'YTB-07',
            question:
                'How many thumbnail impressions turned into views and then watch time for each video, and which videos have the weakest click-through rate?',
            possible: false,
        },
        {
            id: 'YTB-08',
            question:
                'What is the age, gender and country mix of the people watching our videos?',
            possible: false,
        },
        {
            id: 'YTB-09',
            question:
                'How many new, casual and regular viewers did we reach each month, counting each viewer once?',
            possible: false,
        },
        {
            id: 'YTB-10',
            question:
                'How do estimated revenue, RPM and CPM this month compare with last month?',
            possible: false,
        },
        {
            id: 'YTB-11',
            question:
                'Which videos won us the most subscribers, and which ones cost us subscribers?',
            possible: true,
        },
        {
            id: 'YTB-12',
            question:
                'How many views did each video get in its first 7 and 28 days after publishing, compared with our typical video?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-28',
            name: 'Channel performance',
            purpose:
                'Monthly health check of the channel: subscriber growth, watch time and engagement.',
            charts: [
                {
                    id: 'DB-28.1',
                    title: 'Subscriber rate',
                    detail: 'subscribers gained or lost, month to date',
                    possible: true,
                },
                {
                    id: 'DB-28.2',
                    title: 'Daily subscriber growth',
                    detail: 'subscribers gained and unsubscribes per day',
                    possible: true,
                },
                {
                    id: 'DB-28.3',
                    title: 'Watch time',
                    detail: 'minutes watched daily, weekly or monthly',
                    possible: true,
                },
                {
                    id: 'DB-28.4',
                    title: 'Watch time by video',
                    detail: 'top videos by watch time this month',
                    possible: true,
                },
                {
                    id: 'DB-28.5',
                    title: 'Engagement',
                    detail: 'likes, comments and shares over time',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-29',
            name: 'Video performance',
            purpose:
                'Reviews how recent and all-time videos perform so the team knows what to make more of.',
            charts: [
                {
                    id: 'DB-29.1',
                    title: 'Channel totals',
                    detail: 'current subscribers, estimated minutes watched and video views for the selected dates',
                    possible: false,
                },
                {
                    id: 'DB-29.2',
                    title: 'Views',
                    detail: 'views scorecard with daily trend',
                    possible: true,
                },
                {
                    id: 'DB-29.3',
                    title: 'Minutes watched',
                    detail: 'estimated minutes watched with daily trend',
                    possible: true,
                },
                {
                    id: 'DB-29.4',
                    title: 'Likes and comments',
                    detail: 'likes and comments scorecards with daily trend',
                    possible: true,
                },
                {
                    id: 'DB-29.5',
                    title: 'Latest videos',
                    detail: 'publish date, thumbnail, title, views, comments, likes, dislikes; sorted by views or publish date',
                    possible: false,
                },
                {
                    id: 'DB-29.6',
                    title: 'All-time top videos',
                    detail: 'lifetime view count per video',
                    possible: true,
                },
                {
                    id: 'DB-29.7',
                    title: 'Per-video stats',
                    detail: 'video-level stats for the period',
                    possible: true,
                },
                {
                    id: 'DB-29.8',
                    title: 'Subscribers gained and lost',
                    detail: 'last 28 days, credited to a video',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-30',
            name: 'Audience',
            purpose:
                'Tells the team who is watching and when, to plan topics, formats and publishing times.',
            charts: [
                {
                    id: 'DB-30.1',
                    title: 'Monthly audience',
                    detail: 'new, casual and regular viewers; returning viewers and unique viewers',
                    possible: false,
                },
                {
                    id: 'DB-30.2',
                    title: 'When your viewers are on YouTube',
                    detail: 'viewer activity by day of week and hour',
                    possible: false,
                },
                {
                    id: 'DB-30.3',
                    title: 'Watch time from subscribers',
                    detail: 'watch time from subscribed vs not subscribed viewers',
                    possible: false,
                },
                {
                    id: 'DB-30.4',
                    title: 'Age and gender',
                    detail: 'viewer share by age group and gender',
                    possible: false,
                },
                {
                    id: 'DB-30.5',
                    title: 'Top geographies',
                    detail: 'views by country',
                    possible: true,
                },
                {
                    id: 'DB-30.6',
                    title: 'Device type',
                    detail: 'views by device type',
                    possible: true,
                },
                {
                    id: 'DB-30.7',
                    title: 'Formats your viewers watch',
                    detail: 'videos, Shorts and live',
                    possible: true,
                },
                {
                    id: 'DB-30.8',
                    title: 'What your audience watches',
                    detail: 'other videos and channels the audience watches',
                    possible: false,
                },
                {
                    id: 'DB-30.9',
                    title: 'Top subtitle/CC languages',
                    detail: 'views by subtitle language',
                    possible: false,
                },
                {
                    id: 'DB-30.10',
                    title: 'Subscriber bell notifications',
                    detail: 'share of subscribers with notifications turned on',
                    possible: false,
                },
            ],
        },
    ],
};
