// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const googleAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GAD-01',
            question:
                'How have Google Ads spend, clicks, conversions and cost per conversion trended day by day over the last 90 days?',
            possible: true,
        },
        {
            id: 'GAD-02',
            question:
                'Which 10 Google Ads campaigns spent the most last month, and what did a conversion cost in each?',
            possible: true,
        },
        {
            id: 'GAD-03',
            question:
                'Which search terms got clicks but no conversions in the last 30 days and are not yet excluded as negative keywords?',
            possible: false,
        },
        {
            id: 'GAD-04',
            question:
                'What is the current daily budget, bidding strategy and status of our Brand Search campaign?',
            possible: false,
        },
        {
            id: 'GAD-05',
            question:
                'Which high-spend keywords have a Quality Score below 5, and is it expected CTR, ad relevance or landing page experience that is holding each one back?',
            possible: false,
        },
        {
            id: 'GAD-06',
            question:
                'How has the Quality Score of our top 50 keywords changed week by week over the last six months, and did it move after we rewrote the ads or landing pages?',
            possible: false,
        },
        {
            id: 'GAD-07',
            question:
                'How much search impression share did each campaign lose to budget versus to ad rank last month?',
            possible: true,
        },
        {
            id: 'GAD-08',
            question:
                'Which competitors show up against us most often in search auctions, and whose impression share and outranking share have grown over the last three months?',
            possible: false,
        },
        {
            id: 'GAD-09',
            question:
                'Which hours of the day and days of the week give us the most conversions and the lowest cost per conversion on Google Ads?',
            possible: false,
        },
        {
            id: 'GAD-10',
            question:
                'Do certain devices perform better in specific countries: clicks, CPC and conversion rate by device and country?',
            possible: false,
        },
        {
            id: 'GAD-11',
            question:
                'Which landing pages and UTM campaigns receive the most Google Ads spend, and how do their conversion rates compare?',
            possible: false,
        },
        {
            id: 'GAD-12',
            question:
                'How many conversions and how much conversion value did each conversion action (form fill, call, purchase, app install) record per campaign this month?',
            possible: false,
        },
        {
            id: 'GAD-13',
            question:
                'For the clicks we bought in each week, what share of their eventual conversions arrived within 1, 7, 14 and 30 days of the click?',
            possible: false,
        },
        {
            id: 'GAD-14',
            question:
                'Which campaigns assist many more conversions than they close as the last click, and how would their credit change under data-driven attribution instead of last click?',
            possible: false,
        },
        {
            id: 'GAD-15',
            question:
                'Which campaigns are currently capped by their daily budget, and what share of budget did each use over the last 7 days?',
            possible: false,
        },
        {
            id: 'GAD-16',
            question:
                'Cost per conversion on Google Ads went up this week versus last week: was it higher CPC, a lower conversion rate, or spend shifting towards more expensive campaigns?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-12',
            name: 'Google Ads network performance',
            purpose:
                'Weekly account review: which networks, devices and campaigns deliver the best CPA and whether lost impression share comes from budget or ad rank.',
            charts: [
                {
                    id: 'DB-12.1',
                    title: 'Daily spend and efficiency trend',
                    detail: 'spend with CPC / cost per conversion by day',
                    possible: true,
                },
                {
                    id: 'DB-12.2',
                    title: 'Campaign performance',
                    detail: 'impressions, clicks, CTR, CPC, conversions, cost per campaign',
                    possible: true,
                },
                {
                    id: 'DB-12.3',
                    title: 'Device split',
                    detail: 'spend and conversions by device',
                    possible: true,
                },
                {
                    id: 'DB-12.4',
                    title: 'Network split',
                    detail: 'spend and conversions by network (Search, Display, YouTube, partners)',
                    possible: true,
                },
                {
                    id: 'DB-12.5',
                    title: 'Network CPA table',
                    detail: 'cost per acquisition per network',
                    possible: true,
                },
                {
                    id: 'DB-12.6',
                    title: 'Impression share audit',
                    detail: 'search impression share won vs lost to budget vs lost to ad rank, per campaign',
                    possible: true,
                },
                {
                    id: 'DB-12.7',
                    title: 'Conversions by action type',
                    detail: 'conversions per conversion action',
                    possible: false,
                },
                {
                    id: 'DB-12.8',
                    title: 'Video quartile completion',
                    detail: 'video views reaching 25/50/75/100%',
                    possible: false,
                },
                {
                    id: 'DB-12.9',
                    title: 'Performance Max asset ratings',
                    detail: 'PMax assets with their performance rating, low-rated first',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-13',
            name: 'Google Ads quality score analytics',
            purpose:
                'Find the keywords whose Quality Score is costing money and which component (expected CTR, ad relevance, landing page) to fix.',
            charts: [
                {
                    id: 'DB-13.1',
                    title: 'Quality Score vs. CTR',
                    detail: 'keywords plotted by Quality Score and CTR',
                    possible: false,
                },
                {
                    id: 'DB-13.2',
                    title: 'Impressions & CTR by Quality Score',
                    detail: 'impressions and CTR grouped by Quality Score 1-10',
                    possible: false,
                },
                {
                    id: 'DB-13.3',
                    title: 'Average CPC',
                    detail: 'cost per click for the selected keywords',
                    possible: false,
                },
                {
                    id: 'DB-13.4',
                    title: 'Search impression share',
                    detail: 'search impression share for the selected keywords',
                    possible: false,
                },
                {
                    id: 'DB-13.5',
                    title: 'Landing page experience rating',
                    detail: 'share of keywords below average / average / above average',
                    possible: false,
                },
                {
                    id: 'DB-13.6',
                    title: 'Ad relevance rating',
                    detail: 'share of keywords below average / average / above average',
                    possible: false,
                },
                {
                    id: 'DB-13.7',
                    title: 'Expected CTR rating',
                    detail: 'share of keywords below average / average / above average',
                    possible: false,
                },
                {
                    id: 'DB-13.8',
                    title: 'Keyword quality table',
                    detail: 'keywords with Quality Score, three component ratings, spend and CPC',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-14',
            name: 'Google Ads client report',
            purpose:
                'Recurring agency report that walks a client from account summary down to campaigns, ad groups, ads and keywords.',
            charts: [
                {
                    id: 'DB-14.1',
                    title: 'Executive summary',
                    detail: 'snapshot of account performance for the reporting period',
                    possible: true,
                },
                {
                    id: 'DB-14.2',
                    title: 'Campaign performance',
                    detail: 'CPC, CTR, conversions and return per campaign',
                    possible: true,
                },
                {
                    id: 'DB-14.3',
                    title: 'Ad groups',
                    detail: 'performance per ad group',
                    possible: true,
                },
                {
                    id: 'DB-14.4',
                    title: 'Ad-level analytics',
                    detail: 'performance per ad, best messaging first',
                    possible: false,
                },
                {
                    id: 'DB-14.5',
                    title: 'Keywords',
                    detail: 'keyword-level performance',
                    possible: false,
                },
                {
                    id: 'DB-14.6',
                    title: 'Ad placements',
                    detail: 'where ads appeared: search results, partner sites, apps',
                    possible: false,
                },
                {
                    id: 'DB-14.7',
                    title: 'Video ads',
                    detail: 'YouTube ad views and engagement',
                    possible: false,
                },
                {
                    id: 'DB-14.8',
                    title: 'Shopping ads',
                    detail: 'performance per product',
                    possible: false,
                },
                {
                    id: 'DB-14.9',
                    title: 'Demographics',
                    detail: 'performance by age, gender, location and device',
                    possible: false,
                },
                {
                    id: 'DB-14.10',
                    title: 'Phone calls',
                    detail: 'call volume, call duration and source of calls from ads',
                    possible: false,
                },
            ],
        },
    ],
};
