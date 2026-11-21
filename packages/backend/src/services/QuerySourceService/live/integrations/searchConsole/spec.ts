// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const searchConsoleSpec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        oauthReview:
            'Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
    },
    api: {
        description: 'Search Analytics query, with Google sign-in.',
        serverSideTotals: 'Yes. Reports return totals per dimension.',
        vendorLimit:
            'Search Analytics: 1,200 queries a minute per site and per user.',
        paging: 'One call, up to 24,999 rows.',
        whyOurLimits: 'Half the per-minute limit.',
    },
    questions: [
        {
            id: 'GSC-01',
            question:
                'How have clicks, impressions, click-through rate and average position from Google Search trended day by day over the last 16 months?',
            expect: 'answer',
            source: 'https://support.google.com/webmasters/answer/7576553',
        },
        {
            id: 'GSC-02',
            question: 'Which search queries bring the most clicks to our site?',
            expect: 'answer',
            source: 'https://databox.com/dashboard-examples/google-search-console-queries-page-overview',
        },
        {
            id: 'GSC-03',
            question:
                "Which pages get the most impressions and clicks from search, and what is each page's click-through rate and average position?",
            expect: 'answer',
            source: 'https://databox.com/dashboard-examples/google-search-console-queries-page-overview',
        },
        {
            id: 'GSC-04',
            question:
                'Which queries get lots of impressions but rank just outside the top 10, so a small push could put them on page one?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://www.coupler.io/dashboard-examples/keyword-ranking-dashboard',
        },
        {
            id: 'GSC-05',
            question:
                'Which queries have two or more of our pages competing for them, and how are the clicks split between those pages?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://sitechecker.pro/keyword-cannibalization-looker-studio-template',
        },
        {
            id: 'GSC-06',
            question:
                'For each of our top landing pages, what are the ten queries that bring it the most clicks, and do they match what the page is about?',
            expect: 'answer',
            source: 'https://www.coupler.io/dashboard-examples/keyword-ranking-dashboard',
        },
        {
            id: 'GSC-07',
            question:
                'What share of our search clicks and impressions comes from branded versus non-branded queries, and how is that changing month by month?',
            expect: 'answer',
            source: 'https://supermetrics.com/template-gallery/looker-studio-search-console-overview',
        },
        {
            id: 'GSC-08',
            question:
                'Which pages lost the most search clicks and ranking positions this month compared with the previous month?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://databox.com/dashboard-examples/google-search-console-basics-dashboard',
        },
        {
            id: 'GSC-09',
            question:
                'How do click-through rate and average position differ between mobile and desktop, and which queries underperform on mobile?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://supermetrics.com/template-gallery/looker-studio-search-console-overview',
        },
        {
            id: 'GSC-10',
            question:
                'How many clicks do we get from rich results such as job listings or top stories compared with plain search results?',
            expect: 'needs_change',
            source: 'https://support.google.com/webmasters/answer/12917991',
        },
        {
            id: 'GSC-11',
            question:
                'What share of our clicks comes from queries Google hides for privacy, and is that hidden share growing?',
            expect: 'answer',
            source: 'https://developers.google.com/search/blog/2022/10/performance-data-deep-dive',
        },
        {
            id: 'GSC-12',
            question:
                'What is our average position and click-through rate for one specific query in the UK on mobile over the last 28 days?',
            expect: 'answer',
            source: 'https://fivetran.com/docs/connectors/applications/google-search-console',
        },
        {
            id: 'GSC-13',
            question:
                'What click-through rate do we get at each ranking position from 1 to 20, and which queries fall well below that curve?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://supermetrics.com/template-gallery/looker-studio-search-console-overview',
        },
        {
            id: 'GSC-14',
            question:
                'How are our clicks and impressions split across web, image, video, news and Discover, and across countries?',
            expect: 'needs_change',
            source: 'https://support.google.com/webmasters/answer/12917991',
        },
    ],
    dashboards: [
        {
            id: 'DB-25',
            name: 'Search Console overview',
            source: 'https://supermetrics.com/template-gallery/looker-studio-search-console-overview',
            charts: [
                {
                    id: 'DB-25.1',
                    title: 'Impressions and clicks',
                    detail: 'total impressions and clicks from search',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.2',
                    title: 'Average CTR and position',
                    detail: 'average click-through rate and average ranking position',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.3',
                    title: 'Search visibility over time',
                    detail: 'impressions, clicks, CTR and position trend',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.4',
                    title: 'Top-performing queries',
                    detail: 'queries with clicks, impressions, CTR, position',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.5',
                    title: 'Top landing pages',
                    detail: 'pages attracting the most search traffic, with average position',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.6',
                    title: 'Mobile vs desktop',
                    detail: 'search traffic, CTR and position by device',
                    expect: 'answer',
                },
                {
                    id: 'DB-25.7',
                    title: 'Queries underperforming by device',
                    detail: 'queries with weak CTR or position on a given device',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-25.8',
                    title: 'Branded search terms',
                    detail: 'performance of queries matching the brand keywords entered at setup',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-26',
            name: 'Keyword ranking',
            source: 'https://www.coupler.io/dashboard-examples/keyword-ranking-dashboard',
            charts: [
                {
                    id: 'DB-26.1',
                    title: 'Clicks',
                    detail: 'total clicks',
                    expect: 'answer',
                },
                {
                    id: 'DB-26.2',
                    title: 'Impressions',
                    detail: 'total impressions',
                    expect: 'answer',
                },
                {
                    id: 'DB-26.3',
                    title: 'Click-through rate',
                    detail: 'average CTR',
                    expect: 'answer',
                },
                {
                    id: 'DB-26.4',
                    title: 'Average position',
                    detail: 'average ranking position',
                    expect: 'answer',
                },
                {
                    id: 'DB-26.5',
                    title: 'Page-query relevance',
                    detail: 'most popular landing pages, each with its top 10 queries by clicks',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-26.6',
                    title: 'Keyword cannibalization detector',
                    detail: 'enter a word or phrase to see the same queries appearing on several pages',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-26.7',
                    title: 'SEO growth opportunities',
                    detail: 'keywords with high impressions ranking beyond the top 10',
                    expect: 'answer',
                    tags: ['capped'],
                },
            ],
        },
        {
            id: 'DB-27',
            name: 'Queries and pages overview',
            source: 'https://databox.com/dashboard-examples/google-search-console-queries-page-overview',
            charts: [
                {
                    id: 'DB-27.1',
                    title: 'Search queries driving traffic',
                    detail: 'queries by clicks',
                    expect: 'answer',
                },
                {
                    id: 'DB-27.2',
                    title: 'Impressions and clicks by page',
                    detail: 'pages by impressions and clicks',
                    expect: 'answer',
                },
                {
                    id: 'DB-27.3',
                    title: 'CTR by page',
                    detail: 'click-through rate per page',
                    expect: 'answer',
                },
                {
                    id: 'DB-27.4',
                    title: 'Average position by page',
                    detail: 'average search position per page, rising or falling over time',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-27.5',
                    title: 'Daily clicks',
                    detail: 'clicks per day with the month-to-date total',
                    expect: 'answer',
                },
            ],
        },
    ],
};
