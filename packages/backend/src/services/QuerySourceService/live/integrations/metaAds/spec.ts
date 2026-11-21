// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const metaAdsSpec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person'],
        oauthReview:
            'Needs Meta business verification and App Review for ads_read.',
    },
    api: {
        description:
            'Marketing API Insights endpoint (level, time increment, breakdowns). Needs OAuth and app review.',
        serverSideTotals:
            'Yes. Insights returns totals per campaign, ad set, ad and date.',
        vendorLimit:
            'Load counted per app and ad account; Meta publishes no fixed number.',
        paging: '500 rows a page, up to 10 pages (5,000 rows).',
        whyOurLimits:
            "Kept well below what Meta's best-practices page warns about.",
    },
    questions: [
        {
            id: 'MET-01',
            question:
                'How are spend, results and cost per result trending day by day for each Meta campaign?',
            expect: 'answer',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'MET-02',
            question:
                'Which ad sets that spent over $500 this month have the lowest cost per result?',
            expect: 'answer',
        },
        {
            id: 'MET-03',
            question:
                'How many unique people did we reach on Meta this month across all campaigns, and what was the average frequency?',
            expect: 'answer',
        },
        {
            id: 'MET-04',
            question:
                'How has our cumulative unique reach grown week by week since the campaign launched, and is new reach flattening out?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'MET-05',
            question:
                'For each ad, how did CTR and cost per result change in the weeks after launch as frequency built up, and which ads are now fatigued?',
            expect: 'needs_change',
        },
        {
            id: 'MET-06',
            question:
                'How many people saw our ads once, twice, 3 to 5 times and 6 or more times this month?',
            expect: 'needs_change',
        },
        {
            id: 'MET-07',
            question:
                'Which age and gender groups have the lowest cost per purchase on Meta, and where is spend going to groups that do not convert?',
            expect: 'answer',
        },
        {
            id: 'MET-08',
            question:
                'Which placements (Facebook Feed, Instagram Stories, Reels, Audience Network) give the lowest CPM and CPC, and how has spend shifted between them week to week?',
            expect: 'answer',
        },
        {
            id: 'MET-09',
            question:
                'Which countries and regions get the most Meta spend, and what is the cost per result in each?',
            expect: 'needs_change',
        },
        {
            id: 'MET-10',
            question:
                "At what time of day, in the viewer's local time, do our Meta ads get the best click-through rate and cost per result?",
            expect: 'needs_change',
        },
        {
            id: 'MET-11',
            question:
                'How many of the purchases Meta reports per campaign are 1-day view-through versus 1-day click versus 7-day click?',
            expect: 'needs_change',
        },
        {
            id: 'MET-12',
            question:
                'Where do people drop off between link click, landing page view, add to cart, checkout and purchase for each campaign?',
            expect: 'answer',
        },
        {
            id: 'MET-13',
            question:
                'Which video ads hold attention best: what share of viewers reach 25%, 50%, 75% and 100% of each video?',
            expect: 'needs_change',
        },
        {
            id: 'MET-14',
            question:
                'Which headline, image or video and call-to-action variations get the most spend and the best cost per result in our dynamic creative ads?',
            expect: 'needs_change',
        },
        {
            id: 'MET-15',
            question:
                'Which landing page URLs and UTM campaign tags receive the most Meta spend and conversions?',
            expect: 'needs_change',
        },
        {
            id: 'MET-16',
            question:
                'Is Meta spend this month over or under where it was at the same point last month, by campaign?',
            expect: 'answer',
        },
    ],
    dashboards: [
        {
            id: 'DB-15',
            name: 'Meta Ads monthly performance',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-15.1',
                    title: 'Impressions',
                    detail: 'impressions for the month',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.2',
                    title: 'Reach',
                    detail: 'unique people reached in the month (not a sum of daily reach)',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.3',
                    title: 'Amount spent',
                    detail: 'spend for the month',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.4',
                    title: 'Frequency',
                    detail: 'average times each person saw an ad',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.5',
                    title: 'Performance by age and gender',
                    detail: 'results by age group and gender',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.6',
                    title: 'Performance by device',
                    detail: 'Android tablet, iPad, desktop, iPhone, Android smartphone',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-15.7',
                    title: 'Performance by country',
                    detail: 'geographic map of results',
                    expect: 'answer',
                },
                {
                    id: 'DB-15.8',
                    title: 'Campaign and ad set effectiveness',
                    detail: 'spend and results per campaign and ad set',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-16',
            name: 'Meta Ads creatives',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-16.1',
                    title: 'Impressions vs. CPM',
                    detail: 'impressions and CPM over time',
                    expect: 'answer',
                },
                {
                    id: 'DB-16.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    expect: 'answer',
                },
                {
                    id: 'DB-16.3',
                    title: 'Spend Dynamics',
                    detail: 'daily spend',
                    expect: 'answer',
                },
                {
                    id: 'DB-16.4',
                    title: 'Creative reach and engagement',
                    detail: 'impressions, clicks, post engagements by creative',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-16.5',
                    title: 'Creative cost efficiency',
                    detail: 'CPC, CTR, CPM by creative',
                    expect: 'answer',
                },
                {
                    id: 'DB-16.6',
                    title: 'Breakdown by campaign and ad name',
                    detail: 'the same metrics grouped by campaign and ad name',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-17',
            name: 'Facebook Ads campaign report',
            source: 'https://databox.com/dashboard-examples/facebook-ads-ad-sets-overview',
            charts: [
                {
                    id: 'DB-17.1',
                    title: 'Engagements by day',
                    detail: 'daily engagements across campaigns',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-17.2',
                    title: 'Top campaigns by impressions',
                    detail: 'campaigns ranked by impressions',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.3',
                    title: 'Cost per click by campaign',
                    detail: 'campaigns with the lowest CPC',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.4',
                    title: 'Clicks',
                    detail: 'total clicks vs previous period',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.5',
                    title: 'Amount spent',
                    detail: 'spend vs previous period: under or over budget',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.6',
                    title: 'Cost per result by campaign',
                    detail: 'most cost-efficient campaigns',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.7',
                    title: 'Frequency',
                    detail: 'overall frequency vs previous period',
                    expect: 'answer',
                },
                {
                    id: 'DB-17.8',
                    title: 'Impressions',
                    detail: 'impressions vs previous period',
                    expect: 'answer',
                },
            ],
        },
    ],
};
