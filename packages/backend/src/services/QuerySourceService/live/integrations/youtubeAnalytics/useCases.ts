// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const youtubeAnalyticsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'YTB-01',
            question:
                'How have views, watch time and average view duration trended day by day across the channel this year?',
            expect: 'answer',
            why: "Date with views, minutes watched and average view duration for this year is one call of at most 366 rows; each day's average is computed by YouTube.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-02',
            question:
                'How many subscribers did we gain and lose each day, and are we losing more than we gain?',
            expect: 'answer',
            why: 'Date with subscribers gained and subscribers lost is one explore query; both are additive daily counts, so comparing them is direct.',
            tags: ['unverified'],
        },
        {
            id: 'YTB-03',
            question: 'Which videos drove the most watch time this month?',
            expect: 'answer',
            why: "Video ID with minutes watched, sorted descending, for the current month is YouTube's Top videos report: exact for the top 200. Videos appear as IDs, not titles (titles are in a different YouTube API), and the row limit must be 200 or less or the query errors.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-04',
            question:
                'How has this one video performed since it was published: total views, watch time, likes, comments, shares and subscribers gained?',
            expect: 'answer',
            why: "All six metrics with no breakdown, filtered to the video ID, is one call. The date range must be set explicitly to cover the video's life; with no date filter the query silently reads only the last 28 days.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-05',
            question:
                'At what points in this video do viewers drop off or rewatch, and what share is still watching after the first 30 seconds?',
            expect: 'needs_change',
            why: "The retention curve is a separate YouTube report that is not in the explore; its explore name is reserved but not built. Turning 30 seconds into a point on the curve also needs the video's length, which this API does not return.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-06',
            question:
                'How do viewers find our videos: YouTube search, suggested videos, browse, playlists or external sites?',
            expect: 'answer',
            why: "Traffic source type with views and minutes watched is one explore query; values come back as YouTube's codes (YT_SEARCH, RELATED_VIDEO, PLAYLIST, EXT_URL).",
            tags: ['unverified'],
        },
        {
            id: 'YTB-07',
            question:
                'How many thumbnail impressions turned into views and then watch time for each video, and which videos have the weakest click-through rate?',
            expect: 'needs_change',
            why: "Views and watch time per video work, but thumbnail impressions and impression click-through rate are not fields. I could not confirm from the code whether YouTube's query API returns them or only its bulk Reporting API does; if only bulk, this is not answerable live.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-08',
            question:
                'What is the age, gender and country mix of the people watching our videos?',
            expect: 'needs_change',
            why: 'Country mix is one explore query. Age and gender are a separate demographics report whose explore name is reserved but not built.',
            tags: ['unverified'],
        },
        {
            id: 'YTB-09',
            question:
                'How many new, casual and regular viewers did we reach each month, counting each viewer once?',
            expect: 'api_cant',
            why: 'New, casual and regular viewers and unique viewers are shown in YouTube Studio only; as far as I know the Analytics API has no such dimension or a unique-viewer metric.',
            tags: ['unverified'],
        },
        {
            id: 'YTB-10',
            question:
                'How do estimated revenue, RPM and CPM this month compare with last month?',
            expect: 'needs_change',
            why: 'Revenue metrics are a reserved explore that is not built, and they need an extra Google permission (the monetary scope) that the sign-in does not ask for. Month against month would then be two nodes joined in DuckDB, with RPM computed as revenue per thousand views.',
            tags: ['unverified'],
        },
        {
            id: 'YTB-11',
            question:
                'Which videos won us the most subscribers, and which ones cost us subscribers?',
            expect: 'answer',
            why: "Video ID with subscribers gained and lost, sorted by gained (and a second query sorted by lost), is YouTube's Top videos report: exact for the top 200 each way. Videos appear as IDs, not titles.",
            tags: ['unverified'],
        },
        {
            id: 'YTB-12',
            question:
                'How many views did each video get in its first 7 and 28 days after publishing, compared with our typical video?',
            expect: 'answer',
            why: 'YouTube cannot break videos down by day in one report and this API has no publish date. A pipeline can read one daily series per video (filtered by video ID), take the first day with views as the publish day and sum the first 7 and 28 days in DuckDB, one node per video.',
            tags: ['unverified', 'capped'],
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
                    expect: 'answer',
                    why: 'Subscribers gained and lost for the current month, no breakdown.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.2',
                    title: 'Daily subscriber growth',
                    detail: 'subscribers gained and unsubscribes per day',
                    expect: 'answer',
                    why: 'Date with subscribers gained and lost.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.3',
                    title: 'Watch time',
                    detail: 'minutes watched daily, weekly or monthly',
                    expect: 'answer',
                    why: 'Minutes watched by day or by whole month are native; weekly needs a DuckDB roll-up of daily rows.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.4',
                    title: 'Watch time by video',
                    detail: 'top videos by watch time this month',
                    expect: 'answer',
                    why: 'Top videos by minutes watched (limit 200 or less); shown as video IDs, not titles.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-28.5',
                    title: 'Engagement',
                    detail: 'likes, comments and shares over time',
                    expect: 'answer',
                    why: 'Date with likes, comments and shares.',
                    tags: ['unverified'],
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
                    expect: 'needs_change',
                    why: 'Views and minutes watched work; the current subscriber count is not in the Analytics API (only gained and lost).',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.2',
                    title: 'Views',
                    detail: 'views scorecard with daily trend',
                    expect: 'answer',
                    why: 'Date with views.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.3',
                    title: 'Minutes watched',
                    detail: 'estimated minutes watched with daily trend',
                    expect: 'answer',
                    why: 'Date with minutes watched.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.4',
                    title: 'Likes and comments',
                    detail: 'likes and comments scorecards with daily trend',
                    expect: 'answer',
                    why: 'Date with likes and comments.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.5',
                    title: 'Latest videos',
                    detail: 'publish date, thumbnail, title, views, comments, likes, dislikes; sorted by views or publish date',
                    expect: 'needs_change',
                    why: 'Publish date, title and thumbnail are not in the Analytics API, and it cannot list videos by publish date.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.6',
                    title: 'All-time top videos',
                    detail: 'lifetime view count per video',
                    expect: 'answer',
                    why: 'Video ID with views over a wide fixed date range, top 200; IDs, not titles.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-29.7',
                    title: 'Per-video stats',
                    detail: 'video-level stats for the period',
                    expect: 'answer',
                    why: 'Per-video stats come from the Top videos report, which returns at most 200 videos per query.',
                    tags: ['unverified', 'capped'],
                },
                {
                    id: 'DB-29.8',
                    title: 'Subscribers gained and lost',
                    detail: 'last 28 days, credited to a video',
                    expect: 'answer',
                    why: 'Video ID with subscribers gained and lost for 28 days, top 200.',
                    tags: ['unverified'],
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
                    expect: 'api_cant',
                    why: 'New, casual, regular, returning and unique viewers are in YouTube Studio only.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.2',
                    title: 'When your viewers are on YouTube',
                    detail: 'viewer activity by day of week and hour',
                    expect: 'api_cant',
                    why: 'Viewer activity by day of week and hour is in YouTube Studio only.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.3',
                    title: 'Watch time from subscribers',
                    detail: 'watch time from subscribed vs not subscribed viewers',
                    expect: 'needs_change',
                    why: "Subscribed status is not an explore field; YouTube's API has it as a dimension with views and minutes watched.",
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.4',
                    title: 'Age and gender',
                    detail: 'viewer share by age group and gender',
                    expect: 'needs_change',
                    why: 'Age group and gender are the reserved demographics report, which is not built.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.5',
                    title: 'Top geographies',
                    detail: 'views by country',
                    expect: 'answer',
                    why: 'Country with views, one query.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.6',
                    title: 'Device type',
                    detail: 'views by device type',
                    expect: 'answer',
                    why: 'Device type with views, one query.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.7',
                    title: 'Formats your viewers watch',
                    detail: 'videos, Shorts and live',
                    expect: 'answer',
                    why: 'Content type cannot be queried alone, so it is read by day and summed in DuckDB (views are additive).',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.8',
                    title: 'What your audience watches',
                    detail: 'other videos and channels the audience watches',
                    expect: 'api_cant',
                    why: 'Other videos and channels the audience watches are in YouTube Studio only.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.9',
                    title: 'Top subtitle/CC languages',
                    detail: 'views by subtitle language',
                    expect: 'api_cant',
                    why: "Subtitle language is, as far as I know, only in YouTube's bulk Reporting API, not in live queries.",
                    tags: ['unverified'],
                },
                {
                    id: 'DB-30.10',
                    title: 'Subscriber bell notifications',
                    detail: 'share of subscribers with notifications turned on',
                    expect: 'api_cant',
                    why: 'Bell-notification share is in YouTube Studio only.',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
