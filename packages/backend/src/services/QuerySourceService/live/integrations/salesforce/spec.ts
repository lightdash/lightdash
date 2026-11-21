// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const salesforceSpec: LiveIntegrationSpec = {
    level: 4,
    auth: {
        testWith: 'test_account',
        needs: ['gmail'],
        oauthReview: null,
    },
    api: {
        description:
            'SOQL through the Salesforce REST API, with OAuth. Per-user OAuth means each user only sees records their own Salesforce permissions allow; a shared org-level source is an option. Each org has a daily API call allowance.',
        serverSideTotals:
            'Yes. SOQL supports GROUP BY and aggregate functions (COUNT, SUM, AVG), so Salesforce does the work. Results come back in batches of up to 2,000 rows.',
        vendorLimit:
            "API calls per 24 hours per org (15,000 on Developer Edition, 100,000 and up on paid), shared with the org's other apps.",
        paging: 'Records in batches of 2,000, up to 9,999 rows; aggregate queries are one call up to 2,000 groups.',
        whyOurLimits:
            '500 an hour keeps one source under the smallest daily allowance.',
    },
    questions: [
        {
            id: 'SFD-01',
            question:
                'What is our open pipeline amount and expected revenue by opportunity stage?',
            expect: 'answer',
            source: 'https://learn.microsoft.com/en-us/power-bi/connect-data/service-connect-to-salesforce',
        },
        {
            id: 'SFD-02',
            question:
                'How has our open pipeline changed since the first day of the quarter: which opportunities had their amount, stage or close date changed?',
            expect: 'needs_change',
            source: 'https://www.salesforceben.com/the-best-little-known-salesforce-feature-for-opportunities-historical-trending/',
        },
        {
            id: 'SFD-03',
            question:
                'How many days do opportunities spend in each stage on average, and where do they move backwards to an earlier stage?',
            expect: 'needs_change',
            source: 'https://www.salesforceben.com/salesforce-opportunity-history-vs-opportunity-field-history/',
        },
        {
            id: 'SFD-04',
            question:
                'Which open opportunities have sat in their current stage longer than our allowed number of days, and how much amount is tied up per owner?',
            expect: 'answer',
            source: 'https://trailhead.salesforce.com/content/learn/modules/sales-deal-acceleration/identify-stuck-sales-deals',
        },
        {
            id: 'SFD-05',
            question:
                'From which stage do opportunities most often drop straight to closed-lost?',
            expect: 'needs_change',
            source: 'https://www.salesforceben.com/5-salesforce-pipeline-reports-you-need-today/',
        },
        {
            id: 'SFD-06',
            question:
                'Who are the top reps this quarter by won revenue, with their win rate, average deal size and days to close?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://www.coupler.io/dashboard-examples/sales-leaderboard',
        },
        {
            id: 'SFD-07',
            question:
                "How do each sales manager's teams compare this quarter on bookings, pipeline created, losses and win rate?",
            expect: 'needs_change',
            source: 'https://github.com/fivetran/dbt_salesforce',
        },
        {
            id: 'SFD-08',
            question:
                'How has the average number of days from opportunity creation to close trended by quarter, for new business versus existing business?',
            expect: 'answer',
            tags: ['unverified', 'no_data', 'capped'],
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-09',
            question:
                'How is each rep tracking against quota this quarter, and what is their gap to quota after counting commit forecast?',
            expect: 'needs_change',
            source: 'https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/track-sales-forecast-performance',
        },
        {
            id: 'SFD-10',
            question:
                'How has the committed forecast for this quarter moved week by week, and how does it compare with the same point last year?',
            expect: 'needs_change',
            source: 'https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/track-sales-forecast-performance',
        },
        {
            id: 'SFD-11',
            question:
                'How do bookings this quarter compare with last quarter, in amount and in number of deals?',
            expect: 'answer',
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-12',
            question:
                'How many calls, emails and meetings did each account executive log last week, and how many meetings did they book?',
            expect: 'needs_change',
            source: 'https://www.salesforce.com/blog/sales-management-dashboards/',
        },
        {
            id: 'SFD-13',
            question:
                'How do leads created, leads converted, tasks completed and opportunities created trend day by day, and is there a day-of-week pattern?',
            expect: 'needs_change',
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-14',
            question:
                'How much closed-won revenue came from each lead source this year, and which sources convert best?',
            expect: 'answer',
            tags: ['unverified', 'no_data'],
            source: 'https://www.coupler.io/dashboard-examples/win-loss-analysis-dashboard',
        },
        {
            id: 'SFD-15',
            question:
                'Which campaigns delivered the highest ROI and the lowest cost per won opportunity?',
            expect: 'needs_change',
            tags: ['unverified', 'no_data'],
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-16',
            question:
                'What share of new leads get converted, broken down by lead source and lead owner?',
            expect: 'answer',
            tags: ['unverified', 'no_data'],
            source: 'https://databox.com/salesforce-report-types',
        },
        {
            id: 'SFD-17',
            question:
                'Of the opportunities created in each quarter, what share has been won, lost or is still open today?',
            expect: 'answer',
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-18',
            question:
                'Which products are most often sold together on the same won opportunity?',
            expect: 'needs_change',
            source: 'https://github.com/fivetran/dbt_salesforce',
        },
        {
            id: 'SFD-19',
            question:
                'What stage is a named opportunity in, what is its next step and close date, and who owns it?',
            expect: 'answer',
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
        {
            id: 'SFD-20',
            question:
                'What is our win rate by account industry, region and opportunity type over the last 12 months?',
            expect: 'answer',
            source: 'https://www.coupler.io/dashboard-examples/win-loss-analysis-dashboard',
        },
    ],
    dashboards: [
        {
            id: 'DB-05',
            name: 'Sales forecast',
            source: 'https://blog.coupler.io/salesforce-dashboards/',
            charts: [
                {
                    id: 'DB-05.1',
                    title: 'Quota attainment',
                    detail: 'closed won versus quota for the period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-05.2',
                    title: 'Quota remaining',
                    detail: 'quota minus closed won',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-05.3',
                    title: 'Pipe coverage',
                    detail: 'open pipeline versus remaining quota',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-05.4',
                    title: 'Forecast',
                    detail: 'forecast amount by forecast category',
                    expect: 'answer',
                },
                {
                    id: 'DB-05.5',
                    title: 'Forecast vs last week',
                    detail: "this week's forecast compared with last week's",
                    expect: 'needs_change',
                },
                {
                    id: 'DB-05.6',
                    title: 'Top products',
                    detail: 'products ranked by forecast or won amount',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-05.7',
                    title: 'Opportunity amount by stage',
                    detail: 'open opportunity amount grouped by stage',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-06',
            name: 'Sales team performance',
            source: 'https://blog.coupler.io/salesforce-dashboards/',
            charts: [
                {
                    id: 'DB-06.1',
                    title: 'Won vs lost amount',
                    detail: 'closed-won and closed-lost amount per rep',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.2',
                    title: 'Won vs lost opportunities',
                    detail: 'count of won and lost opportunities per rep',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.3',
                    title: 'Win rate',
                    detail: 'share of opportunities closed won',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.4',
                    title: 'Top performers',
                    detail: 'reps ranked by won amount',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.5',
                    title: 'Sales pipeline by stage',
                    detail: 'open opportunities by sales funnel stage',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.6',
                    title: 'Opportunity stage breakdown',
                    detail: 'opportunity count and amount per stage',
                    expect: 'answer',
                },
                {
                    id: 'DB-06.7',
                    title: 'Performance by deal type',
                    detail: 'closed deals by opportunity type',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-06.8',
                    title: 'Won amount by opportunity type',
                    detail: 'won amount split by opportunity type',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-06.9',
                    title: 'Won opportunities by size',
                    detail: 'won opportunities bucketed by amount',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-06.10',
                    title: 'Closed tasks and task overview',
                    detail: 'tasks closed per rep and open task status',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-07',
            name: 'Sales stage analysis',
            source: 'https://blog.coupler.io/salesforce-dashboards/',
            charts: [
                {
                    id: 'DB-07.1',
                    title: 'Days in each stage',
                    detail: 'average days opportunities spend in each stage',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-07.2',
                    title: 'Opportunity movement from a selected stage',
                    detail: 'where opportunities go next from a chosen stage, including won and lost counts',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-07.3',
                    title: 'Neglected opportunities',
                    detail: 'open opportunities with no recent activity',
                    expect: 'answer',
                },
                {
                    id: 'DB-07.4',
                    title: 'Stalled opportunities',
                    detail: 'open opportunities more than 30 days in one stage',
                    expect: 'answer',
                },
                {
                    id: 'DB-07.5',
                    title: 'Pushed opportunities',
                    detail: 'count of opportunities whose close date was pushed',
                    expect: 'answer',
                },
                {
                    id: 'DB-07.6',
                    title: 'Deals overview',
                    detail: 'opportunities with close date, forecast category, amount, account and time in stages',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-08',
            name: 'Marketing executive (leads and campaigns)',
            source: 'https://blog.coupler.io/salesforce-dashboards/',
            charts: [
                {
                    id: 'DB-08.1',
                    title: 'ROI by campaign type',
                    detail: 'campaign return on investment grouped by campaign type',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-08.2',
                    title: 'Converted leads by month',
                    detail: 'leads converted per month',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.3',
                    title: 'Lead trending',
                    detail: 'lead status counts by month',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.4',
                    title: 'Top marketing channels',
                    detail: 'channels ranked by leads generated',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.5',
                    title: 'Leads by campaign, industry and source',
                    detail: 'lead counts broken down by campaign, industry and lead source',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-08.6',
                    title: 'Lead conversion summary',
                    detail: 'leads, converted leads and opportunity amount converted',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-08.7',
                    title: 'Conversion rate',
                    detail: 'share of leads converted',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
            ],
        },
    ],
};
