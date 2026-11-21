// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const googleAdsSpec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'paid_account',
        needs: ['gmail', 'card'],
        oauthReview:
            'Needs Google verification plus a Google Ads access level: Explorer, then Basic or Standard for real customer volume.',
    },
    api: {
        description:
            'Google Ads API, GAQL search reports. Reuses Google sign-in. Access belongs to the Google Cloud project that owns the OAuth client.',
        serverSideTotals:
            'Yes. GAQL reports return totals by the segments you pick (date, campaign, ad group).',
        vendorLimit:
            "Daily operations shared by every connection of the server's Google client (2,880 at Explorer access).",
        paging: 'One call, up to 9,999 rows.',
        whyOurLimits: "So one source can't use up the shared daily operations.",
    },
    questions: [
        {
            id: 'GAD-01',
            question:
                'How have Google Ads spend, clicks, conversions and cost per conversion trended day by day over the last 90 days?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_google_ads',
        },
        {
            id: 'GAD-02',
            question:
                'Which 10 Google Ads campaigns spent the most last month, and what did a conversion cost in each?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://www.coupler.io/dashboard-examples/google-ads-dashboard',
        },
        {
            id: 'GAD-03',
            question:
                'Which search terms got clicks but no conversions in the last 30 days and are not yet excluded as negative keywords?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/2472708?hl=en',
        },
        {
            id: 'GAD-04',
            question:
                'What is the current daily budget, bidding strategy and status of our Brand Search campaign?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/table/13845063?hl=en',
        },
        {
            id: 'GAD-05',
            question:
                'Which high-spend keywords have a Quality Score below 5, and is it expected CTR, ad relevance or landing page experience that is holding each one back?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
        {
            id: 'GAD-06',
            question:
                'How has the Quality Score of our top 50 keywords changed week by week over the last six months, and did it move after we rewrote the ads or landing pages?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/6167118?hl=en',
        },
        {
            id: 'GAD-07',
            question:
                'How much search impression share did each campaign lose to budget versus to ad rank last month?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/7103314?hl=en',
        },
        {
            id: 'GAD-08',
            question:
                'Which competitors show up against us most often in search auctions, and whose impression share and outranking share have grown over the last three months?',
            expect: 'api_cant',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/2579754?hl=en',
        },
        {
            id: 'GAD-09',
            question:
                'Which hours of the day and days of the week give us the most conversions and the lowest cost per conversion on Google Ads?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://supermetrics.com/template-gallery/looker-studio-google-ads',
        },
        {
            id: 'GAD-10',
            question:
                'Do certain devices perform better in specific countries: clicks, CPC and conversion rate by device and country?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://supermetrics.com/template-gallery/looker-studio-google-ads',
        },
        {
            id: 'GAD-11',
            question:
                'Which landing pages and UTM campaigns receive the most Google Ads spend, and how do their conversion rates compare?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_google_ads',
        },
        {
            id: 'GAD-12',
            question:
                'How many conversions and how much conversion value did each conversion action (form fill, call, purchase, app install) record per campaign this month?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/table/13845063?hl=en',
        },
        {
            id: 'GAD-13',
            question:
                'For the clicks we bought in each week, what share of their eventual conversions arrived within 1, 7, 14 and 30 days of the click?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/1722023?hl=en',
        },
        {
            id: 'GAD-14',
            question:
                'Which campaigns assist many more conversions than they close as the last click, and how would their credit change under data-driven attribution instead of last click?',
            expect: 'api_cant',
            tags: ['unverified'],
            source: 'https://support.google.com/google-ads/answer/1722023?hl=en',
        },
        {
            id: 'GAD-15',
            question:
                'Which campaigns are currently capped by their daily budget, and what share of budget did each use over the last 7 days?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_google_ads',
        },
        {
            id: 'GAD-16',
            question:
                'Cost per conversion on Google Ads went up this week versus last week: was it higher CPC, a lower conversion rate, or spend shifting towards more expensive campaigns?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
    ],
    dashboards: [
        {
            id: 'DB-12',
            name: 'Google Ads network performance',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-12.1',
                    title: 'Daily spend and efficiency trend',
                    detail: 'spend with CPC / cost per conversion by day',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.2',
                    title: 'Campaign performance',
                    detail: 'impressions, clicks, CTR, CPC, conversions, cost per campaign',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.3',
                    title: 'Device split',
                    detail: 'spend and conversions by device',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.4',
                    title: 'Network split',
                    detail: 'spend and conversions by network (Search, Display, YouTube, partners)',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.5',
                    title: 'Network CPA table',
                    detail: 'cost per acquisition per network',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.6',
                    title: 'Impression share audit',
                    detail: 'search impression share won vs lost to budget vs lost to ad rank, per campaign',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.7',
                    title: 'Conversions by action type',
                    detail: 'conversions per conversion action',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.8',
                    title: 'Video quartile completion',
                    detail: 'video views reaching 25/50/75/100%',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.9',
                    title: 'Performance Max asset ratings',
                    detail: 'PMax assets with their performance rating, low-rated first',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-13',
            name: 'Google Ads quality score analytics',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-13.1',
                    title: 'Quality Score vs. CTR',
                    detail: 'keywords plotted by Quality Score and CTR',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.2',
                    title: 'Impressions & CTR by Quality Score',
                    detail: 'impressions and CTR grouped by Quality Score 1-10',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.3',
                    title: 'Average CPC',
                    detail: 'cost per click for the selected keywords',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.4',
                    title: 'Search impression share',
                    detail: 'search impression share for the selected keywords',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.5',
                    title: 'Landing page experience rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.6',
                    title: 'Ad relevance rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.7',
                    title: 'Expected CTR rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.8',
                    title: 'Keyword quality table',
                    detail: 'keywords with Quality Score, three component ratings, spend and CPC',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-14',
            name: 'Google Ads client report',
            source: 'https://agencyanalytics.com/report-templates/google-ads',
            charts: [
                {
                    id: 'DB-14.1',
                    title: 'Executive summary',
                    detail: 'snapshot of account performance for the reporting period',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.2',
                    title: 'Campaign performance',
                    detail: 'CPC, CTR, conversions and return per campaign',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.3',
                    title: 'Ad groups',
                    detail: 'performance per ad group',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.4',
                    title: 'Ad-level analytics',
                    detail: 'performance per ad, best messaging first',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.5',
                    title: 'Keywords',
                    detail: 'keyword-level performance',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.6',
                    title: 'Ad placements',
                    detail: 'where ads appeared: search results, partner sites, apps',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.7',
                    title: 'Video ads',
                    detail: 'YouTube ad views and engagement',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.8',
                    title: 'Shopping ads',
                    detail: 'performance per product',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.9',
                    title: 'Demographics',
                    detail: 'performance by age, gender, location and device',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.10',
                    title: 'Phone calls',
                    detail: 'call volume, call duration and source of calls from ads',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
