// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const searchConsoleUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GSC-01',
            question:
                'How have clicks, impressions, click-through rate and average position from Google Search trended day by day over the last 16 months?',
            expect: 'answer',
            why: 'Date with clicks, impressions, click-through rate and position over 16 months is about 490 daily rows in one call, each computed by Google. 16 months is exactly what Search Console keeps; the last two or three days are incomplete.',
        },
        {
            id: 'GSC-02',
            question: 'Which search queries bring the most clicks to our site?',
            expect: 'answer',
            why: "Query with clicks, sorted by clicks descending, is Google's own order, so the top rows are exact however many queries exist. Anonymised queries are left out by Google.",
        },
        {
            id: 'GSC-03',
            question:
                "Which pages get the most impressions and clicks from search, and what is each page's click-through rate and average position?",
            expect: 'answer',
            why: "Page with clicks, impressions, click-through rate and position is one query; ranked by clicks it is Google's own order. Ranking by impressions reads every page (up to 24,999), which a typical site fits; beyond that it is refused with a clear message.",
        },
        {
            id: 'GSC-04',
            question:
                'Which queries get lots of impressions but rank just outside the top 10, so a small push could put them on page one?',
            expect: 'answer',
            why: "Google cannot filter on position or impressions and only sorts by clicks, so every query row has to be read and then filtered to positions 11 to 20 locally. That is right only while the site's queries in the period fit in one call.",
            tags: ['capped'],
        },
        {
            id: 'GSC-05',
            question:
                'Which queries have two or more of our pages competing for them, and how are the clicks split between those pages?',
            expect: 'answer',
            why: 'Finding queries served by two or more pages needs every query and page pair, then a count of pages per query in DuckDB. Pairs are far more numerous than queries and a typical site exceeds one call, so competing pages with few clicks are missed.',
            tags: ['capped'],
        },
        {
            id: 'GSC-06',
            question:
                'For each of our top landing pages, what are the ten queries that bring it the most clicks, and do they match what the page is about?',
            expect: 'answer',
            why: "The agent first reads the top pages by clicks, then asks for the top ten queries of each page with a page filter: each is an exact, Google-ordered query (up to 25 nodes fit in one pipeline). Judging whether the queries match the page is the agent's reading.",
        },
        {
            id: 'GSC-07',
            question:
                'What share of our search clicks and impressions comes from branded versus non-branded queries, and how is that changing month by month?',
            expect: 'answer',
            why: "Two nodes by date, one with 'query contains' the brand terms and one with 'does not contain', each about 490 daily rows over 16 months, rolled up to months and turned into shares in DuckDB. Both sides leave out Google's anonymised queries, so the shares are of identified queries; node limits must be raised above the 500 default.",
        },
        {
            id: 'GSC-08',
            question:
                'Which pages lost the most search clicks and ranking positions this month compared with the previous month?',
            expect: 'answer',
            why: "Two nodes by page, one per month, joined in DuckDB give the click and position change per page. Each node reads the page list in Google's click order, so it is right while the site's pages with search traffic fit under the node limit.",
            tags: ['capped'],
        },
        {
            id: 'GSC-09',
            question:
                'How do click-through rate and average position differ between mobile and desktop, and which queries underperform on mobile?',
            expect: 'answer',
            why: "Click-through rate and position by device is one exact explore query. Finding queries that underperform on mobile needs query by device rows compared in DuckDB, read in Google's click order, so it covers the top few thousand queries.",
            tags: ['capped'],
        },
        {
            id: 'GSC-10',
            question:
                'How many clicks do we get from rich results such as job listings or top stories compared with plain search results?',
            expect: 'needs_change',
            why: 'Search appearance (rich result type) is not a field of the explore and the raw request schema does not accept it either; the explore name is reserved for later.',
        },
        {
            id: 'GSC-11',
            question:
                'What share of our clicks comes from queries Google hides for privacy, and is that hidden share growing?',
            expect: 'answer',
            why: "One node gives total clicks by date; a second adds a query filter that matches everything, which makes Google drop anonymised queries, so the difference is the hidden share. DuckDB subtracts and rolls up by month. This relies on Google's documented behaviour, seen in the field test.",
        },
        {
            id: 'GSC-12',
            question:
                'What is our average position and click-through rate for one specific query in the UK on mobile over the last 28 days?',
            expect: 'answer',
            why: 'Click-through rate and position with no breakdown, filtered to one query, one country and one device, is a single exact call; 28 days is the default window.',
        },
        {
            id: 'GSC-13',
            question:
                'What click-through rate do we get at each ranking position from 1 to 20, and which queries fall well below that curve?',
            expect: 'answer',
            why: "A click-through-rate curve by position is built from every query's impressions, clicks and position, bucketed in DuckDB. Reading only the top rows by clicks leaves out low-click queries and bends the curve upward, so it is right only when all queries fit in one call.",
            tags: ['capped'],
        },
        {
            id: 'GSC-14',
            question:
                'How are our clicks and impressions split across web, image, video, news and Discover, and across countries?',
            expect: 'needs_change',
            why: 'The country split is one explore query. Search type (web, image, video, news, Discover) is not an explore field, so every query reads web search only; the API takes it as a request parameter.',
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
                    expect: 'answer',
                    why: 'Clicks and impressions with no breakdown, one call.',
                },
                {
                    id: 'DB-25.2',
                    title: 'Average CTR and position',
                    detail: 'average click-through rate and average ranking position',
                    expect: 'answer',
                    why: 'Click-through rate and position with no breakdown are computed by Google.',
                },
                {
                    id: 'DB-25.3',
                    title: 'Search visibility over time',
                    detail: 'impressions, clicks, CTR and position trend',
                    expect: 'answer',
                    why: 'Date with the four metrics, daily only.',
                },
                {
                    id: 'DB-25.4',
                    title: 'Top-performing queries',
                    detail: 'queries with clicks, impressions, CTR, position',
                    expect: 'answer',
                    why: "Query with the four metrics in Google's click order.",
                },
                {
                    id: 'DB-25.5',
                    title: 'Top landing pages',
                    detail: 'pages attracting the most search traffic, with average position',
                    expect: 'answer',
                    why: "Page with the four metrics in Google's click order.",
                },
                {
                    id: 'DB-25.6',
                    title: 'Mobile vs desktop',
                    detail: 'search traffic, CTR and position by device',
                    expect: 'answer',
                    why: 'Device with the four metrics, three rows.',
                },
                {
                    id: 'DB-25.7',
                    title: 'Queries underperforming by device',
                    detail: 'queries with weak CTR or position on a given device',
                    expect: 'answer',
                    why: 'Queries with weak click-through rate or position on a device need the query rows read and filtered locally; Google has no metric filters.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-25.8',
                    title: 'Branded search terms',
                    detail: 'performance of queries matching the brand keywords entered at setup',
                    expect: 'answer',
                    why: "Query metrics filtered with 'query contains' the brand terms; several terms become one regex.",
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
                    expect: 'answer',
                    why: 'Clicks, no breakdown.',
                },
                {
                    id: 'DB-26.2',
                    title: 'Impressions',
                    detail: 'total impressions',
                    expect: 'answer',
                    why: 'Impressions, no breakdown; a page filter switches Google to per-page counting.',
                },
                {
                    id: 'DB-26.3',
                    title: 'Click-through rate',
                    detail: 'average CTR',
                    expect: 'answer',
                    why: 'Click-through rate computed by Google.',
                },
                {
                    id: 'DB-26.4',
                    title: 'Average position',
                    detail: 'average ranking position',
                    expect: 'answer',
                    why: 'Average position computed by Google.',
                },
                {
                    id: 'DB-26.5',
                    title: 'Page-query relevance',
                    detail: 'most popular landing pages, each with its top 10 queries by clicks',
                    expect: 'answer',
                    why: 'Page by query rows in click order, ranked within each page in DuckDB; right for the pages whose top ten queries sit above the row cut.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-26.6',
                    title: 'Keyword cannibalization detector',
                    detail: 'enter a word or phrase to see the same queries appearing on several pages',
                    expect: 'answer',
                    why: "Query by page rows filtered with 'query contains' the entered word; fits under the cap with the word, not without it.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-26.7',
                    title: 'SEO growth opportunities',
                    detail: 'keywords with high impressions ranking beyond the top 10',
                    expect: 'answer',
                    why: 'High impressions beyond position 10 cannot be filtered at Google, so all query rows are read and filtered in DuckDB; low-click queries fall past the cut on a typical site.',
                    tags: ['capped'],
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
                    expect: 'answer',
                    why: "Query with clicks in Google's click order.",
                },
                {
                    id: 'DB-27.2',
                    title: 'Impressions and clicks by page',
                    detail: 'pages by impressions and clicks',
                    expect: 'answer',
                    why: 'Page with impressions and clicks.',
                },
                {
                    id: 'DB-27.3',
                    title: 'CTR by page',
                    detail: 'click-through rate per page',
                    expect: 'answer',
                    why: 'Page with click-through rate.',
                },
                {
                    id: 'DB-27.4',
                    title: 'Average position by page',
                    detail: 'average search position per page, rising or falling over time',
                    expect: 'answer',
                    why: 'Position per page for two periods, joined in DuckDB to show rising or falling; reads the page list twice.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-27.5',
                    title: 'Daily clicks',
                    detail: 'clicks per day with the month-to-date total',
                    expect: 'answer',
                    why: "Daily clicks from a node reading the last 31 days, cut to the current month and totalled in DuckDB; Search Console dates have no 'this month' filter.",
                },
            ],
        },
    ],
};
