// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const googleAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GAD-01',
            question:
                'How have Google Ads spend, clicks, conversions and cost per conversion trended day by day over the last 90 days?',
            expect: 'answer',
            why: 'Date with cost, clicks, conversions and cost per conversion is one query on the Google Ads explore: 90 rows, with ratios computed by Google per day.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-02',
            question:
                'Which 10 Google Ads campaigns spent the most last month, and what did a conversion cost in each?',
            expect: 'answer',
            why: 'Campaign name with cost and cost per conversion, sorted by cost and limited to 10; Google applies the sort and the limit.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-03',
            question:
                'Which search terms got clicks but no conversions in the last 30 days and are not yet excluded as negative keywords?',
            expect: 'needs_change',
            why: "The explore stops at ad group level, so search terms are not offered. Google has a search term report that already carries each term's added or excluded status, and can filter on clicks and conversions and sort itself.",
            tags: ['unverified'],
        },
        {
            id: 'GAD-04',
            question:
                'What is the current daily budget, bidding strategy and status of our Brand Search campaign?',
            expect: 'needs_change',
            why: 'Status and bidding strategy type are explore fields, but the budget amount is not, and a campaign with no impressions in the date range drops out of the result.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-05',
            question:
                'Which high-spend keywords have a Quality Score below 5, and is it expected CTR, ad relevance or landing page experience that is holding each one back?',
            expect: 'needs_change',
            why: 'There is no keyword level and no Quality Score field today. Google reports Quality Score and its three components per keyword next to cost, and can filter and sort by cost itself.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-06',
            question:
                'How has the Quality Score of our top 50 keywords changed week by week over the last six months, and did it move after we rewrote the ads or landing pages?',
            expect: 'needs_change',
            why: 'No keyword explore today. Google does return historical Quality Score per keyword per day, so a keywords explore plus a DuckDB weekly roll-up gives the trend; the dates of ad and landing page rewrites are not available past 30 days of change history, so the user has to supply them.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-07',
            question:
                'How much search impression share did each campaign lose to budget versus to ad rank last month?',
            expect: 'answer',
            why: 'Search lost impression share (budget) and (rank) are explore metrics and Google computes them per campaign for the month; nothing is summed locally. Non-search campaigns come back empty.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-08',
            question:
                'Which competitors show up against us most often in search auctions, and whose impression share and outranking share have grown over the last three months?',
            expect: 'api_cant',
            why: 'Auction insights (competitor domains, their impression share and outranking share) are not available through the Google Ads API to ordinary developer tokens; only allow-listed accounts get those metrics.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-09',
            question:
                'Which hours of the day and days of the week give us the most conversions and the lowest cost per conversion on Google Ads?',
            expect: 'needs_change',
            why: 'Day of week is offered but hour of day is not, so only half the question can be asked today.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-10',
            question:
                'Do certain devices perform better in specific countries: clicks, CPC and conversion rate by device and country?',
            expect: 'needs_change',
            why: 'Device is offered but geography is not: the explore has no country or location field.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-11',
            question:
                'Which landing pages and UTM campaigns receive the most Google Ads spend, and how do their conversion rates compare?',
            expect: 'needs_change',
            why: 'Landing pages and ad URLs are not in the explore. Google has a landing page report with cost and conversions; UTM campaign has to be parsed out of the expanded URL in a DuckDB step and is only there if the account tags URLs rather than relying on auto-tagging.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-12',
            question:
                'How many conversions and how much conversion value did each conversion action (form fill, call, purchase, app install) record per campaign this month?',
            expect: 'needs_change',
            why: 'Conversions come as one total per campaign; the split by conversion action is not offered. Google reports it as a separate segment that cannot be mixed with cost or clicks, which is why it needs its own explore.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-13',
            question:
                'For the clicks we bought in each week, what share of their eventual conversions arrived within 1, 7, 14 and 30 days of the click?',
            expect: 'needs_change',
            why: 'Conversion lag is not offered. Google reports conversions by days-to-conversion bucket against the click date, and the buckets line up with 1, 7, 14 and 30 days, so a conversions explore with that segment plus a DuckDB cumulative share answers it.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-14',
            question:
                'Which campaigns assist many more conversions than they close as the last click, and how would their credit change under data-driven attribution instead of last click?',
            expect: 'api_cant',
            why: 'Assisted conversions, conversion paths and attribution model comparison exist only in the Google Ads interface; the API has no report for them.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-15',
            question:
                'Which campaigns are currently capped by their daily budget, and what share of budget did each use over the last 7 days?',
            expect: 'needs_change',
            why: 'The budget amount is not a field, so share of budget used cannot be computed. Lost impression share to budget is available today as a proxy for "capped", for search campaigns only.',
            tags: ['unverified'],
        },
        {
            id: 'GAD-16',
            question:
                'Cost per conversion on Google Ads went up this week versus last week: was it higher CPC, a lower conversion rate, or spend shifting towards more expensive campaigns?',
            expect: 'answer',
            why: "Two campaign-level nodes (this week, last week) with cost, clicks and conversions, and a DuckDB step that splits the change into CPC, conversion rate and mix. Rows are one per campaign, far under any cap; this week's conversions are still arriving, which the answer should say.",
            tags: ['unverified'],
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
                    expect: 'answer',
                    why: 'Date with cost, average CPC and cost per conversion is one query.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.2',
                    title: 'Campaign performance',
                    detail: 'impressions, clicks, CTR, CPC, conversions, cost per campaign',
                    expect: 'answer',
                    why: 'Campaign name with impressions, clicks, CTR, CPC, conversions and cost; Google sorts and limits.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.3',
                    title: 'Device split',
                    detail: 'spend and conversions by device',
                    expect: 'answer',
                    why: 'Device is a dimension; cost and conversions are metrics.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.4',
                    title: 'Network split',
                    detail: 'spend and conversions by network (Search, Display, YouTube, partners)',
                    expect: 'answer',
                    why: 'Network is a dimension; cost and conversions are metrics.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.5',
                    title: 'Network CPA table',
                    detail: 'cost per acquisition per network',
                    expect: 'answer',
                    why: 'Cost per conversion by network is computed by Google per row.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.6',
                    title: 'Impression share audit',
                    detail: 'search impression share won vs lost to budget vs lost to ad rank, per campaign',
                    expect: 'answer',
                    why: 'The three search impression share metrics per campaign are computed by Google; non-search campaigns are empty and values under 10% are rounded.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.7',
                    title: 'Conversions by action type',
                    detail: 'conversions per conversion action',
                    expect: 'needs_change',
                    why: 'Conversions cannot be split by conversion action today.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.8',
                    title: 'Video quartile completion',
                    detail: 'video views reaching 25/50/75/100%',
                    expect: 'needs_change',
                    why: 'Video views and quartile rates are not offered.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-12.9',
                    title: 'Performance Max asset ratings',
                    detail: 'PMax assets with their performance rating, low-rated first',
                    expect: 'needs_change',
                    why: 'Performance Max assets are not offered, and the explore pattern always needs a date and a metric, which an asset list has not.',
                    tags: ['unverified'],
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
                    expect: 'needs_change',
                    why: 'No keyword level or Quality Score field today.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.2',
                    title: 'Impressions & CTR by Quality Score',
                    detail: 'impressions and CTR grouped by Quality Score 1-10',
                    expect: 'needs_change',
                    why: 'No keyword explore; grouping by score also has to be done in DuckDB because Google returns one row per keyword.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.3',
                    title: 'Average CPC',
                    detail: 'cost per click for the selected keywords',
                    expect: 'needs_change',
                    why: 'Account-wide average CPC exists, but it includes non-keyword campaigns; a keyword-only figure needs the keyword rows.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.4',
                    title: 'Search impression share',
                    detail: 'search impression share for the selected keywords',
                    expect: 'needs_change',
                    why: 'Impression share cannot be added up across keywords; today it is available only for the account, a campaign or an ad group.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.5',
                    title: 'Landing page experience rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    why: 'Landing page experience rating per keyword is not offered; the share of keywords per rating is a count over keyword rows.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.6',
                    title: 'Ad relevance rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    why: 'Ad relevance rating per keyword is not offered; same counting as tile 5.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.7',
                    title: 'Expected CTR rating',
                    detail: 'share of keywords below average / average / above average',
                    expect: 'needs_change',
                    why: 'Expected CTR rating per keyword is not offered; same counting as tile 5.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-13.8',
                    title: 'Keyword quality table',
                    detail: 'keywords with Quality Score, three component ratings, spend and CPC',
                    expect: 'needs_change',
                    why: 'No keyword explore today; once added, Google sorts by spend and limits the table itself.',
                    tags: ['unverified'],
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
                    expect: 'answer',
                    why: 'Account totals for cost, clicks, impressions, conversions and their ratios are one query.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.2',
                    title: 'Campaign performance',
                    detail: 'CPC, CTR, conversions and return per campaign',
                    expect: 'answer',
                    why: 'CPC, CTR, conversions and conversion value per campaign are explore fields; return as a ratio (value over cost) is not a field and needs a DuckDB step.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.3',
                    title: 'Ad groups',
                    detail: 'performance per ad group',
                    expect: 'answer',
                    why: 'Ad group name with campaign name and the same metrics.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.4',
                    title: 'Ad-level analytics',
                    detail: 'performance per ad, best messaging first',
                    expect: 'needs_change',
                    why: 'No ad level today.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.5',
                    title: 'Keywords',
                    detail: 'keyword-level performance',
                    expect: 'needs_change',
                    why: 'No keyword level today.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.6',
                    title: 'Ad placements',
                    detail: 'where ads appeared: search results, partner sites, apps',
                    expect: 'needs_change',
                    why: 'Network (search, search partners, display, YouTube) works today; apps and sites as placement types are not offered.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.7',
                    title: 'Video ads',
                    detail: 'YouTube ad views and engagement',
                    expect: 'needs_change',
                    why: 'Video views and view rate are not offered.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.8',
                    title: 'Shopping ads',
                    detail: 'performance per product',
                    expect: 'needs_change',
                    why: 'No product level today.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.9',
                    title: 'Demographics',
                    detail: 'performance by age, gender, location and device',
                    expect: 'needs_change',
                    why: 'Device works today; age, gender and location are not offered.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-14.10',
                    title: 'Phone calls',
                    detail: 'call volume, call duration and source of calls from ads',
                    expect: 'needs_change',
                    why: 'Call counts, durations and sources are not offered.',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
