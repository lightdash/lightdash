// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const metaAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'MET-01',
            question:
                'How are spend, results and cost per result trending day by day for each Meta campaign?',
            expect: 'answer',
            why: 'Daily spend and result counts (purchases, leads, registrations) per campaign come from Meta; cost per result is not a field, so a DuckDB step divides. The node reads one row per campaign per day.',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'MET-02',
            question:
                'Which ad sets that spent over $500 this month have the lowest cost per result?',
            expect: 'answer',
            why: 'An ad-set node with month-to-date spend and results, then DuckDB filters spend over 500, divides and sorts. Ad sets with delivery in a month number in the hundreds, well under the 5,000-row cap. The explore alone refuses filters on metrics.',
        },
        {
            id: 'MET-03',
            question:
                'How many unique people did we reach on Meta this month across all campaigns, and what was the average frequency?',
            expect: 'answer',
            why: 'Reach and frequency with no dimensions and a this-month date filter: Meta computes both for the whole range, so nothing is summed.',
        },
        {
            id: 'MET-04',
            question:
                'How has our cumulative unique reach grown week by week since the campaign launched, and is new reach flattening out?',
            expect: 'answer',
            why: 'Reach cannot be added up across weeks, so each point needs its own request from launch to the end of that week. A composer query can hold one node per week and stack them in DuckDB.',
            tags: ['capped'],
        },
        {
            id: 'MET-05',
            question:
                'For each ad, how did CTR and cost per result change in the weeks after launch as frequency built up, and which ads are now fatigued?',
            expect: 'needs_change',
            why: 'Meta is offered by day or month only. Weekly frequency cannot be rebuilt from daily rows, and daily rows per ad pass the row cap quickly, so the weekly view per ad is not available today.',
        },
        {
            id: 'MET-06',
            question:
                'How many people saw our ads once, twice, 3 to 5 times and 6 or more times this month?',
            expect: 'needs_change',
            why: "The frequency distribution needs Meta's frequency-value breakdown, which is not one of the five breakdowns offered.",
        },
        {
            id: 'MET-07',
            question:
                'Which age and gender groups have the lowest cost per purchase on Meta, and where is spend going to groups that do not convert?',
            expect: 'answer',
            why: 'Age and gender with spend and purchases is one query on the explore; cost per purchase is a division in a DuckDB step (or by the agent). At most a few dozen rows.',
        },
        {
            id: 'MET-08',
            question:
                'Which placements (Facebook Feed, Instagram Stories, Reels, Audience Network) give the lowest CPM and CPC, and how has spend shifted between them week to week?',
            expect: 'answer',
            why: 'Platform and placement with CPM and CPC is one query. The week-to-week shift comes from a daily node rolled up to weeks in DuckDB, which is safe because spend adds up; about 20 placements x days stays far under 5,000 rows.',
        },
        {
            id: 'MET-09',
            question:
                'Which countries and regions get the most Meta spend, and what is the cost per result in each?',
            expect: 'needs_change',
            why: 'Country works today; region is not offered as a breakdown.',
        },
        {
            id: 'MET-10',
            question:
                "At what time of day, in the viewer's local time, do our Meta ads get the best click-through rate and cost per result?",
            expect: 'needs_change',
            why: "Hour of day is not offered. Meta has an hourly breakdown in the viewer's time zone.",
        },
        {
            id: 'MET-11',
            question:
                'How many of the purchases Meta reports per campaign are 1-day view-through versus 1-day click versus 7-day click?',
            expect: 'needs_change',
            why: "Purchases come only under Meta's default attribution (7-day click and 1-day view) as one number; the per-window split needs a request parameter that is not passed.",
        },
        {
            id: 'MET-12',
            question:
                'Where do people drop off between link click, landing page view, add to cart, checkout and purchase for each campaign?',
            expect: 'answer',
            why: 'Link clicks, landing page views, adds to cart, checkouts and purchases are all explore metrics, so one query per campaign shows each step; drop-off rates are a division the agent or a DuckDB step adds.',
        },
        {
            id: 'MET-13',
            question:
                'Which video ads hold attention best: what share of viewers reach 25%, 50%, 75% and 100% of each video?',
            expect: 'needs_change',
            why: 'Video retention fields (25, 50, 75, 100 percent watched) are not offered.',
        },
        {
            id: 'MET-14',
            question:
                'Which headline, image or video and call-to-action variations get the most spend and the best cost per result in our dynamic creative ads?',
            expect: 'needs_change',
            why: "Dynamic creative results per headline, image, video or call to action need Meta's asset breakdowns, which are not offered.",
        },
        {
            id: 'MET-15',
            question:
                'Which landing page URLs and UTM campaign tags receive the most Meta spend and conversions?',
            expect: 'needs_change',
            why: 'Landing URLs and URL tags live on the ad creative, not in Insights, and the Meta live data source can only reach the Insights endpoint. It needs an ads list with creative link and tags, joined to spend by ad id and grouped by URL in DuckDB.',
        },
        {
            id: 'MET-16',
            question:
                'Is Meta spend this month over or under where it was at the same point last month, by campaign?',
            expect: 'answer',
            why: 'Two campaign-level nodes (this month to date, last month to the same day) joined on campaign id in DuckDB. One row per campaign per node.',
        },
    ],
    dashboards: [
        {
            id: 'DB-15',
            name: 'Meta Ads monthly performance',
            purpose:
                'Monthly review of who Meta ads reach, on which devices and markets, and whether frequency is getting too high.',
            charts: [
                {
                    id: 'DB-15.1',
                    title: 'Impressions',
                    detail: 'impressions for the month',
                    expect: 'answer',
                    why: 'Impressions for the date range, one row.',
                },
                {
                    id: 'DB-15.2',
                    title: 'Reach',
                    detail: 'unique people reached in the month (not a sum of daily reach)',
                    expect: 'answer',
                    why: 'Meta computes unique reach for the whole date range, so it is not a sum of days.',
                },
                {
                    id: 'DB-15.3',
                    title: 'Amount spent',
                    detail: 'spend for the month',
                    expect: 'answer',
                    why: 'Spend for the date range.',
                },
                {
                    id: 'DB-15.4',
                    title: 'Frequency',
                    detail: 'average times each person saw an ad',
                    expect: 'answer',
                    why: 'Meta computes frequency for the whole range.',
                },
                {
                    id: 'DB-15.5',
                    title: 'Performance by age and gender',
                    detail: 'results by age group and gender',
                    expect: 'answer',
                    why: 'Age and gender are breakdowns; purchases, leads and spend are metrics.',
                },
                {
                    id: 'DB-15.6',
                    title: 'Performance by device',
                    detail: 'Android tablet, iPad, desktop, iPhone, Android smartphone',
                    expect: 'needs_change',
                    why: 'A device breakdown is not offered.',
                },
                {
                    id: 'DB-15.7',
                    title: 'Performance by country',
                    detail: 'geographic map of results',
                    expect: 'answer',
                    why: 'Country is a breakdown and returns two-letter codes a map can use.',
                },
                {
                    id: 'DB-15.8',
                    title: 'Campaign and ad set effectiveness',
                    detail: 'spend and results per campaign and ad set',
                    expect: 'answer',
                    why: 'Campaign name and ad set name with spend and results.',
                },
            ],
        },
        {
            id: 'DB-16',
            name: 'Meta Ads creatives',
            purpose:
                'Creative review: which ads earn reach and engagement cheaply, and which to pause or iterate on.',
            charts: [
                {
                    id: 'DB-16.1',
                    title: 'Impressions vs. CPM',
                    detail: 'impressions and CPM over time',
                    expect: 'answer',
                    why: 'Date with impressions and CPM; Meta computes CPM per day.',
                },
                {
                    id: 'DB-16.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    expect: 'answer',
                    why: 'Date with clicks and CPC.',
                },
                {
                    id: 'DB-16.3',
                    title: 'Spend Dynamics',
                    detail: 'daily spend',
                    expect: 'answer',
                    why: 'Date with spend.',
                },
                {
                    id: 'DB-16.4',
                    title: 'Creative reach and engagement',
                    detail: 'impressions, clicks, post engagements by creative',
                    expect: 'needs_change',
                    why: 'Impressions, clicks and reach per ad work; post engagements is not offered as a metric.',
                },
                {
                    id: 'DB-16.5',
                    title: 'Creative cost efficiency',
                    detail: 'CPC, CTR, CPM by creative',
                    expect: 'answer',
                    why: 'CPC, CTR and CPM per ad, with Meta sorting on the chosen metric. A creative is shown as its ad.',
                },
                {
                    id: 'DB-16.6',
                    title: 'Breakdown by campaign and ad name',
                    detail: 'the same metrics grouped by campaign and ad name',
                    expect: 'answer',
                    why: 'Campaign name and ad name with the same metrics; the ad ID has to be included because ad names repeat.',
                },
            ],
        },
        {
            id: 'DB-17',
            name: 'Facebook Ads campaign report',
            purpose:
                'Daily check on campaign trend, budget, cost efficiency and frequency against the previous period.',
            charts: [
                {
                    id: 'DB-17.1',
                    title: 'Engagements by day',
                    detail: 'daily engagements across campaigns',
                    expect: 'needs_change',
                    why: 'Engagements is not offered; clicks (all) is the nearest field.',
                },
                {
                    id: 'DB-17.2',
                    title: 'Top campaigns by impressions',
                    detail: 'campaigns ranked by impressions',
                    expect: 'answer',
                    why: 'Campaign name with impressions; Meta sorts by impressions.',
                },
                {
                    id: 'DB-17.3',
                    title: 'Cost per click by campaign',
                    detail: 'campaigns with the lowest CPC',
                    expect: 'answer',
                    why: 'Campaign name with CPC, sorted ascending by Meta.',
                },
                {
                    id: 'DB-17.4',
                    title: 'Clicks',
                    detail: 'total clicks vs previous period',
                    expect: 'answer',
                    why: 'Two account-level nodes, one per period, compared in DuckDB. The periods are fixed in the tile and do not follow the dashboard date filter.',
                },
                {
                    id: 'DB-17.5',
                    title: 'Amount spent',
                    detail: 'spend vs previous period: under or over budget',
                    expect: 'answer',
                    why: 'Spend for two periods compared in DuckDB. Budget is not a field, so "under or over budget" needs a number from elsewhere.',
                },
                {
                    id: 'DB-17.6',
                    title: 'Cost per result by campaign',
                    detail: 'most cost-efficient campaigns',
                    expect: 'answer',
                    why: 'Spend and results per campaign from one node; cost per result and the ranking are a DuckDB step.',
                },
                {
                    id: 'DB-17.7',
                    title: 'Frequency',
                    detail: 'overall frequency vs previous period',
                    expect: 'answer',
                    why: "Meta computes frequency separately for each period's node; DuckDB compares the two.",
                },
                {
                    id: 'DB-17.8',
                    title: 'Impressions',
                    detail: 'impressions vs previous period',
                    expect: 'answer',
                    why: 'Impressions for two periods compared in DuckDB.',
                },
            ],
        },
    ],
};
