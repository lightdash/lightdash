// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const youtubeAnalyticsSpec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        oauthReview:
            'Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
    },
    api: {
        description:
            'YouTube Analytics API reports.query (dimensions and metrics, like the GA4 Data API). Reuses Google sign-in.',
        serverSideTotals: 'Yes. Reports return totals per dimension and day.',
        vendorLimit:
            'Google publishes no per-minute figure for YouTube Analytics.',
        paging: 'One call, up to 9,999 rows.',
        whyOurLimits: 'Matches GA4.',
    },
    questions: [
        {
            id: 'YTB-01',
            question:
                'How have views, watch time and average view duration trended day by day across the channel this year?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-02',
            question:
                'How many subscribers did we gain and lose each day, and are we losing more than we gain?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-03',
            question: 'Which videos drove the most watch time this month?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-04',
            question:
                'How has this one video performed since it was published: total views, watch time, likes, comments, shares and subscribers gained?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-05',
            question:
                'At what points in this video do viewers drop off or rewatch, and what share is still watching after the first 30 seconds?',
            expect: 'needs_change',
            tags: ['unverified'],
        },
        {
            id: 'YTB-06',
            question:
                'How do viewers find our videos: YouTube search, suggested videos, browse, playlists or external sites?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-07',
            question:
                'How many thumbnail impressions turned into views and then watch time for each video, and which videos have the weakest click-through rate?',
            expect: 'needs_change',
            tags: ['unverified'],
        },
        {
            id: 'YTB-08',
            question:
                'What is the age, gender and country mix of the people watching our videos?',
            expect: 'needs_change',
            tags: ['unverified'],
        },
        {
            id: 'YTB-09',
            question:
                'How many new, casual and regular viewers did we reach each month, counting each viewer once?',
            expect: 'api_cant',
            tags: ['unverified'],
        },
        {
            id: 'YTB-10',
            question:
                'How do estimated revenue, RPM and CPM this month compare with last month?',
            expect: 'needs_change',
            tags: ['unverified'],
        },
        {
            id: 'YTB-11',
            question:
                'Which videos won us the most subscribers, and which ones cost us subscribers?',
            expect: 'answer',
            tags: ['unverified'],
        },
        {
            id: 'YTB-12',
            question:
                'How many views did each video get in its first 7 and 28 days after publishing, compared with our typical video?',
            expect: 'answer',
            tags: ['unverified', 'capped'],
        },
    ],
    dashboards: [
        {
            id: 'DB-28',
            name: 'Channel performance',
            charts: [
                {
                    id: 'DB-28.1',
                    title: 'Subscriber rate',
                    detail: 'subscribers gained or lost, month to date',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.2',
                    title: 'Daily subscriber growth',
                    detail: 'subscribers gained and unsubscribes per day',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.3',
                    title: 'Watch time',
                    detail: 'minutes watched daily, weekly or monthly',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.4',
                    title: 'Watch time by video',
                    detail: 'top videos by watch time this month',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.5',
                    title: 'Engagement',
                    detail: 'likes, comments and shares over time',
                    expect: 'answer',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-29',
            name: 'Video performance',
            charts: [
                {
                    id: 'DB-29.1',
                    title: 'Channel totals',
                    detail: 'current subscribers, estimated minutes watched and video views for the selected dates',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.2',
                    title: 'Views',
                    detail: 'views scorecard with daily trend',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.3',
                    title: 'Minutes watched',
                    detail: 'estimated minutes watched with daily trend',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.4',
                    title: 'Likes and comments',
                    detail: 'likes and comments scorecards with daily trend',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.5',
                    title: 'Latest videos',
                    detail: 'publish date, thumbnail, title, views, comments, likes, dislikes; sorted by views or publish date',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.6',
                    title: 'All-time top videos',
                    detail: 'lifetime view count per video',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.7',
                    title: 'Per-video stats',
                    detail: 'video-level stats for the period',
                    expect: 'answer',
                    tags: ['unverified', 'capped'],
                },
                {
                    id: 'DB-29.8',
                    title: 'Subscribers gained and lost',
                    detail: 'last 28 days, credited to a video',
                    expect: 'answer',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-30',
            name: 'Audience',
            charts: [
                {
                    id: 'DB-30.1',
                    title: 'Monthly audience',
                    detail: 'new, casual and regular viewers; returning viewers and unique viewers',
                    expect: 'api_cant',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.2',
                    title: 'When your viewers are on YouTube',
                    detail: 'viewer activity by day of week and hour',
                    expect: 'api_cant',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.3',
                    title: 'Watch time from subscribers',
                    detail: 'watch time from subscribed vs not subscribed viewers',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.4',
                    title: 'Age and gender',
                    detail: 'viewer share by age group and gender',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.5',
                    title: 'Top geographies',
                    detail: 'views by country',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.6',
                    title: 'Device type',
                    detail: 'views by device type',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.7',
                    title: 'Formats your viewers watch',
                    detail: 'videos, Shorts and live',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.8',
                    title: 'What your audience watches',
                    detail: 'other videos and channels the audience watches',
                    expect: 'api_cant',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.9',
                    title: 'Top subtitle/CC languages',
                    detail: 'views by subtitle language',
                    expect: 'api_cant',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.10',
                    title: 'Subscriber bell notifications',
                    detail: 'share of subscribers with notifications turned on',
                    expect: 'api_cant',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
