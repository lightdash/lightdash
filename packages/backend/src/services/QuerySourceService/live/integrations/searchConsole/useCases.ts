// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const searchConsoleUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GSC-01',
            question:
                'How have clicks, impressions, click-through rate and average position from Google Search trended day by day over the last 16 months?',
            possible: true,
        },
        {
            id: 'GSC-02',
            question: 'Which search queries bring the most clicks to our site?',
            possible: true,
        },
        {
            id: 'GSC-03',
            question:
                "Which pages get the most impressions and clicks from search, and what is each page's click-through rate and average position?",
            possible: true,
        },
        {
            id: 'GSC-04',
            question:
                'Which queries get lots of impressions but rank just outside the top 10, so a small push could put them on page one?',
            possible: true,
        },
        {
            id: 'GSC-05',
            question:
                'Which queries have two or more of our pages competing for them, and how are the clicks split between those pages?',
            possible: true,
        },
        {
            id: 'GSC-06',
            question:
                'For each of our top landing pages, what are the ten queries that bring it the most clicks, and do they match what the page is about?',
            possible: true,
        },
        {
            id: 'GSC-07',
            question:
                'What share of our search clicks and impressions comes from branded versus non-branded queries, and how is that changing month by month?',
            possible: true,
        },
        {
            id: 'GSC-08',
            question:
                'Which pages lost the most search clicks and ranking positions this month compared with the previous month?',
            possible: true,
        },
        {
            id: 'GSC-09',
            question:
                'How do click-through rate and average position differ between mobile and desktop, and which queries underperform on mobile?',
            possible: true,
        },
        {
            id: 'GSC-10',
            question:
                'How many clicks do we get from rich results such as job listings or top stories compared with plain search results?',
            possible: true,
        },
        {
            id: 'GSC-11',
            question:
                'What share of our clicks comes from queries Google hides for privacy, and is that hidden share growing?',
            possible: true,
        },
        {
            id: 'GSC-12',
            question:
                'What is our average position and click-through rate for one specific query in the UK on mobile over the last 28 days?',
            possible: true,
        },
        {
            id: 'GSC-13',
            question:
                'What click-through rate do we get at each ranking position from 1 to 20, and which queries fall well below that curve?',
            possible: true,
        },
        {
            id: 'GSC-14',
            question:
                'How are our clicks and impressions split across web, image, video, news and Discover, and across countries?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'DB-25',
            name: 'Search Console overview',
            purpose:
                'Regular review of organic search visibility: totals, top queries and pages, and how devices differ.',
            charts: [
                {
                    id: 'DB-25.1',
                    title: 'Impressions and clicks',
                    detail: 'total impressions and clicks from search',
                    possible: true,
                },
                {
                    id: 'DB-25.2',
                    title: 'Average CTR and position',
                    detail: 'average click-through rate and average ranking position',
                    possible: true,
                },
                {
                    id: 'DB-25.3',
                    title: 'Search visibility over time',
                    detail: 'impressions, clicks, CTR and position trend',
                    possible: true,
                },
                {
                    id: 'DB-25.4',
                    title: 'Top-performing queries',
                    detail: 'queries with clicks, impressions, CTR, position',
                    possible: true,
                },
                {
                    id: 'DB-25.5',
                    title: 'Top landing pages',
                    detail: 'pages attracting the most search traffic, with average position',
                    possible: true,
                },
                {
                    id: 'DB-25.6',
                    title: 'Mobile vs desktop',
                    detail: 'search traffic, CTR and position by device',
                    possible: true,
                },
                {
                    id: 'DB-25.7',
                    title: 'Queries underperforming by device',
                    detail: 'queries with weak CTR or position on a given device',
                    possible: true,
                },
                {
                    id: 'DB-25.8',
                    title: 'Branded search terms',
                    detail: 'performance of queries matching the brand keywords entered at setup',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-26',
            name: 'Keyword ranking',
            purpose:
                'Finds which keywords to work on next: mismatched pages, pages competing with each other and keywords close to page one.',
            charts: [
                {
                    id: 'DB-26.1',
                    title: 'Clicks',
                    detail: 'total clicks',
                    possible: true,
                },
                {
                    id: 'DB-26.2',
                    title: 'Impressions',
                    detail: 'total impressions',
                    possible: true,
                },
                {
                    id: 'DB-26.3',
                    title: 'Click-through rate',
                    detail: 'average CTR',
                    possible: true,
                },
                {
                    id: 'DB-26.4',
                    title: 'Average position',
                    detail: 'average ranking position',
                    possible: true,
                },
                {
                    id: 'DB-26.5',
                    title: 'Page-query relevance',
                    detail: 'most popular landing pages, each with its top 10 queries by clicks',
                    possible: true,
                },
                {
                    id: 'DB-26.6',
                    title: 'Keyword cannibalization detector',
                    detail: 'enter a word or phrase to see the same queries appearing on several pages',
                    possible: true,
                },
                {
                    id: 'DB-26.7',
                    title: 'SEO growth opportunities',
                    detail: 'keywords with high impressions ranking beyond the top 10',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-27',
            name: 'Queries and pages overview',
            purpose:
                'Shows which queries and pages bring search traffic this month and whether it is trending up.',
            charts: [
                {
                    id: 'DB-27.1',
                    title: 'Search queries driving traffic',
                    detail: 'queries by clicks',
                    possible: true,
                },
                {
                    id: 'DB-27.2',
                    title: 'Impressions and clicks by page',
                    detail: 'pages by impressions and clicks',
                    possible: true,
                },
                {
                    id: 'DB-27.3',
                    title: 'CTR by page',
                    detail: 'click-through rate per page',
                    possible: true,
                },
                {
                    id: 'DB-27.4',
                    title: 'Average position by page',
                    detail: 'average search position per page, rising or falling over time',
                    possible: true,
                },
                {
                    id: 'DB-27.5',
                    title: 'Daily clicks',
                    detail: 'clicks per day with the month-to-date total',
                    possible: true,
                },
            ],
        },
    ],
};
