// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const attioSpec: LiveIntegrationSpec = {
    level: 2,
    auth: {
        testWith: 'test_account',
        needs: ['gmail'],
        oauthReview: null,
    },
    api: {
        description:
            'Records are listed through the records query endpoint with filters, sorts and limit/offset paging. Auth is a workspace access token. About 100 reads per second; filter-heavy queries are rate limited more tightly.',
        serverSideTotals:
            'No. Attio has no aggregates, so counts are computed locally.',
        vendorLimit:
            '100 reads a second per workspace; list queries scored by filters and sorts over 10 seconds.',
        paging: '500 records a page, up to 20 pages (9,999 rows).',
        whyOurLimits:
            'Well under the read limit; filter-heavy queries are scored more tightly.',
    },
    questions: [
        {
            id: 'ATT-01',
            question:
                'How many deals are currently in each pipeline stage, split by deal owner?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard',
        },
        {
            id: 'ATT-02',
            question:
                'For deals created this quarter, what is the conversion rate between each stage from Lead to Won?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard',
        },
        {
            id: 'ATT-03',
            question:
                'What is our win rate for deals with enterprise-sized companies compared with all other deals?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard',
        },
        {
            id: 'ATT-04',
            question:
                'How long do won deals spend in each stage on average, and which owner moves deals through fastest?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-time-in-stage-report',
        },
        {
            id: 'ATT-05',
            question:
                'How much deal value moved into Won this quarter compared with last quarter?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-stage-changed-report',
        },
        {
            id: 'ATT-06',
            question:
                'How many deals, and how much deal value, sat in each stage at the end of every month over the past year?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-historical-values-report',
        },
        {
            id: 'ATT-07',
            question:
                'How has total MRR grown month by month over the last year?',
            expect: 'needs_change',
            source: 'https://attio.com/blog/reporting-2-0',
        },
        {
            id: 'ATT-08',
            question:
                'Which deal owner moved the most deals into Won each month this year?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports',
        },
        {
            id: 'ATT-09',
            question: 'From which stage are deals most often marked Lost?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-funnel-report',
        },
        {
            id: 'ATT-10',
            question:
                'Which open deals have been sitting in their current stage for more than 30 days?',
            expect: 'needs_change',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-time-in-stage-report',
        },
        {
            id: 'ATT-11',
            question:
                'When did anyone on our team last email or meet with a given company, and who was involved?',
            expect: 'needs_change',
            source: 'https://github.com/fivetran/dbt_hubspot',
        },
        {
            id: 'ATT-12',
            question:
                'How many meetings and emails did each team member have with prospects per week this quarter?',
            expect: 'api_cant',
            source: 'https://databox.com/dashboard-examples/weekly-sales-activity-sales-rep-view',
        },
        {
            id: 'ATT-13',
            question:
                'Which lead sources produced the most won deal value this year?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite',
        },
        {
            id: 'ATT-14',
            question:
                'Of the deals created in each month, what share was won within 60 days?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://raw.githubusercontent.com/fivetran/dbt_salesforce/main/models/salesforce/salesforce.yml',
        },
    ],
    dashboards: [
        {
            id: 'DB-09',
            name: 'Sales reporting dashboard',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard',
            charts: [
                {
                    id: 'DB-09.1',
                    title: 'Deals in stage',
                    detail: 'count of deals per stage for active stages, optionally split by deal owner or value',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-09.2',
                    title: 'Funnel analysis',
                    detail: 'conversion between each deal stage for deals created in the chosen time frame',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-09.3',
                    title: 'Win rate',
                    detail: 'share of all deals that reached Won',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-09.4',
                    title: 'Average time to close',
                    detail: 'average time won deals spent in each stage before Won, optionally by deal owner',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-09.5',
                    title: 'Deals moving to each stage',
                    detail: 'count of deals entering each stage during the time frame',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-09.6',
                    title: 'Qualified deals each month',
                    detail: 'deals entering the Qualification stage per month against a monthly target',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-10',
            name: 'Revenue overview (ARR / MRR)',
            source: 'https://attio.com/blog/reporting-2-0',
            charts: [
                {
                    id: 'DB-10.1',
                    title: 'Total ARR',
                    detail: 'sum of ARR across customer workspaces',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.2',
                    title: 'ARR growth',
                    detail: 'ARR grouped by current subscription start date',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.3',
                    title: 'MRR growth over the last year',
                    detail: 'total MRR at the end of each month from attribute history',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-10.4',
                    title: 'Revenue by subscription plan',
                    detail: 'ARR segmented by plan',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-10.5',
                    title: 'Customers by location',
                    detail: 'customer count by geography',
                    expect: 'answer',
                    tags: ['capped'],
                },
            ],
        },
        {
            id: 'DB-11',
            name: 'Deal owner performance',
            source: 'https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports',
            charts: [
                {
                    id: 'DB-11.1',
                    title: 'Active deals in each stage',
                    detail: 'count of active deals per stage, split by owner',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-11.2',
                    title: 'Average deal size per owner',
                    detail: 'average deal value grouped by deal owner',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-11.3',
                    title: 'Deals closed per month per owner',
                    detail: 'closed deals by month of close date, split by owner',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-11.4',
                    title: 'Deal value moving into Won each quarter',
                    detail: 'sum of deal value entering Won per quarter',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-11.5',
                    title: 'Stage durations by owner',
                    detail: 'average time in each stage compared between deal owners',
                    expect: 'needs_change',
                },
            ],
        },
    ],
};
