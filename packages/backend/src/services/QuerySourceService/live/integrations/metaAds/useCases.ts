// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const metaAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'MET-01',
            question:
                'How are spend, results and cost per result trending day by day for each Meta campaign?',
            possible: true,
        },
        {
            id: 'MET-02',
            question:
                'Which ad sets that spent over $500 this month have the lowest cost per result?',
            possible: true,
        },
        {
            id: 'MET-03',
            question:
                'How many unique people did we reach on Meta this month across all campaigns, and what was the average frequency?',
            possible: true,
        },
        {
            id: 'MET-04',
            question:
                'How has our cumulative unique reach grown week by week since the campaign launched, and is new reach flattening out?',
            possible: true,
        },
        {
            id: 'MET-05',
            question:
                'For each ad, how did CTR and cost per result change in the weeks after launch as frequency built up, and which ads are now fatigued?',
            possible: false,
        },
        {
            id: 'MET-06',
            question:
                'How many people saw our ads once, twice, 3 to 5 times and 6 or more times this month?',
            possible: false,
        },
        {
            id: 'MET-07',
            question:
                'Which age and gender groups have the lowest cost per purchase on Meta, and where is spend going to groups that do not convert?',
            possible: true,
        },
        {
            id: 'MET-08',
            question:
                'Which placements (Facebook Feed, Instagram Stories, Reels, Audience Network) give the lowest CPM and CPC, and how has spend shifted between them week to week?',
            possible: true,
        },
        {
            id: 'MET-09',
            question:
                'Which countries and regions get the most Meta spend, and what is the cost per result in each?',
            possible: false,
        },
        {
            id: 'MET-10',
            question:
                "At what time of day, in the viewer's local time, do our Meta ads get the best click-through rate and cost per result?",
            possible: false,
        },
        {
            id: 'MET-11',
            question:
                'How many of the purchases Meta reports per campaign are 1-day view-through versus 1-day click versus 7-day click?',
            possible: false,
        },
        {
            id: 'MET-12',
            question:
                'Where do people drop off between link click, landing page view, add to cart, checkout and purchase for each campaign?',
            possible: true,
        },
        {
            id: 'MET-13',
            question:
                'Which video ads hold attention best: what share of viewers reach 25%, 50%, 75% and 100% of each video?',
            possible: false,
        },
        {
            id: 'MET-14',
            question:
                'Which headline, image or video and call-to-action variations get the most spend and the best cost per result in our dynamic creative ads?',
            possible: false,
        },
        {
            id: 'MET-15',
            question:
                'Which landing page URLs and UTM campaign tags receive the most Meta spend and conversions?',
            possible: false,
        },
        {
            id: 'MET-16',
            question:
                'Is Meta spend this month over or under where it was at the same point last month, by campaign?',
            possible: true,
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
                    possible: true,
                },
                {
                    id: 'DB-15.2',
                    title: 'Reach',
                    detail: 'unique people reached in the month (not a sum of daily reach)',
                    possible: true,
                },
                {
                    id: 'DB-15.3',
                    title: 'Amount spent',
                    detail: 'spend for the month',
                    possible: true,
                },
                {
                    id: 'DB-15.4',
                    title: 'Frequency',
                    detail: 'average times each person saw an ad',
                    possible: true,
                },
                {
                    id: 'DB-15.5',
                    title: 'Performance by age and gender',
                    detail: 'results by age group and gender',
                    possible: true,
                },
                {
                    id: 'DB-15.6',
                    title: 'Performance by device',
                    detail: 'Android tablet, iPad, desktop, iPhone, Android smartphone',
                    possible: false,
                },
                {
                    id: 'DB-15.7',
                    title: 'Performance by country',
                    detail: 'geographic map of results',
                    possible: true,
                },
                {
                    id: 'DB-15.8',
                    title: 'Campaign and ad set effectiveness',
                    detail: 'spend and results per campaign and ad set',
                    possible: true,
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
                    possible: true,
                },
                {
                    id: 'DB-16.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    possible: true,
                },
                {
                    id: 'DB-16.3',
                    title: 'Spend Dynamics',
                    detail: 'daily spend',
                    possible: true,
                },
                {
                    id: 'DB-16.4',
                    title: 'Creative reach and engagement',
                    detail: 'impressions, clicks, post engagements by creative',
                    possible: false,
                },
                {
                    id: 'DB-16.5',
                    title: 'Creative cost efficiency',
                    detail: 'CPC, CTR, CPM by creative',
                    possible: true,
                },
                {
                    id: 'DB-16.6',
                    title: 'Breakdown by campaign and ad name',
                    detail: 'the same metrics grouped by campaign and ad name',
                    possible: true,
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
                    possible: false,
                },
                {
                    id: 'DB-17.2',
                    title: 'Top campaigns by impressions',
                    detail: 'campaigns ranked by impressions',
                    possible: true,
                },
                {
                    id: 'DB-17.3',
                    title: 'Cost per click by campaign',
                    detail: 'campaigns with the lowest CPC',
                    possible: true,
                },
                {
                    id: 'DB-17.4',
                    title: 'Clicks',
                    detail: 'total clicks vs previous period',
                    possible: true,
                },
                {
                    id: 'DB-17.5',
                    title: 'Amount spent',
                    detail: 'spend vs previous period: under or over budget',
                    possible: true,
                },
                {
                    id: 'DB-17.6',
                    title: 'Cost per result by campaign',
                    detail: 'most cost-efficient campaigns',
                    possible: true,
                },
                {
                    id: 'DB-17.7',
                    title: 'Frequency',
                    detail: 'overall frequency vs previous period',
                    possible: true,
                },
                {
                    id: 'DB-17.8',
                    title: 'Impressions',
                    detail: 'impressions vs previous period',
                    possible: true,
                },
            ],
        },
    ],
};
