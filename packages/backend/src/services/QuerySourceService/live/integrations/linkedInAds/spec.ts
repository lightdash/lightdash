// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const linkedInAdsSpec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person', 'vendor_approval'],
        oauthReview:
            "Needs Advertising API approval: Development tier first, then Standard tier to read customers' ad accounts.",
    },
    api: {
        description:
            'LinkedIn Marketing API adAnalytics (pivot by campaign or creative, with a time grain). Needs OAuth and Marketing Developer Platform approval.',
        serverSideTotals:
            'Yes. adAnalytics returns totals per pivot and time grain.',
        vendorLimit:
            "Daily per-app and per-member limits shown in LinkedIn's developer portal, not published as fixed numbers.",
        paging: 'One call, up to 14,999 rows.',
        whyOurLimits: 'Same defaults as the other ads integrations.',
    },
    questions: [
        {
            id: 'LIN-01',
            question:
                'How have LinkedIn impressions, clicks, CPM, CPC and spend trended month by month over the last year?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
        {
            id: 'LIN-02',
            question:
                'Which LinkedIn campaigns generate the most leads, and which have the lowest cost per lead?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
        {
            id: 'LIN-03',
            question:
                'Where do we lose people in the LinkedIn lead gen form funnel: impressions to clicks to form opens to submitted leads, and what is the form completion rate per campaign?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
        {
            id: 'LIN-04',
            question:
                'Which job titles are seeing and clicking our LinkedIn ads, and what share of impressions goes to titles outside our target persona?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting',
        },
        {
            id: 'LIN-05',
            question:
                'Which companies saw and engaged with our LinkedIn ads most last quarter, ranked by impressions, clicks and CTR?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://www.coupler.io/dashboard-examples/linkedin-ads-dashboard',
        },
        {
            id: 'LIN-06',
            question:
                'Which companies received LinkedIn ad impressions even though they are not on the target account list for that campaign?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting',
        },
        {
            id: 'LIN-07',
            question:
                'How do click-through rate and cost per click differ by seniority, job function, industry and company size?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema',
        },
        {
            id: 'LIN-08',
            question:
                'Which LinkedIn ad creatives drive the most leads and conversions, and what does each cost per click and per lead?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_linkedin',
        },
        {
            id: 'LIN-09',
            question:
                "Which countries and regions take most of each LinkedIn campaign's spend and clicks each month?",
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_linkedin',
        },
        {
            id: 'LIN-10',
            question:
                'How many LinkedIn website conversions were post-click versus view-through for each campaign and conversion action?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema',
        },
        {
            id: 'LIN-11',
            question:
                "What share of each campaign's target audience have we actually reached on LinkedIn, and at what average frequency?",
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema',
        },
        {
            id: 'LIN-12',
            question:
                'LinkedIn cost per lead rose this month versus last month: is that from a higher CPM, a lower click-through rate or a lower lead form completion rate?',
            expect: 'answer',
            tags: ['unverified'],
            source: 'https://blog.coupler.io/ppc-report-templates/',
        },
        {
            id: 'LIN-13',
            question:
                'What share of LinkedIn leads have a valid work email or were marked qualified, and what is the cost per qualified lead by campaign?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema',
        },
        {
            id: 'LIN-14',
            question:
                'How much has the Q4 Enterprise ABM campaign group spent so far against its total budget?',
            expect: 'needs_change',
            tags: ['unverified'],
            source: 'https://github.com/fivetran/dbt_linkedin',
        },
    ],
    dashboards: [
        {
            id: 'DB-18',
            name: 'LinkedIn Ads monthly performance',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-18.1',
                    title: 'Spend',
                    detail: 'spend for the month',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.2',
                    title: 'Reach',
                    detail: 'unique members reached (approximate, not additive)',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.3',
                    title: 'Frequency',
                    detail: 'average impressions per member reached',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.4',
                    title: 'Monthly trends',
                    detail: 'impressions, clicks, CPM, CPC and spend by month',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.5',
                    title: 'Engagement by campaign and campaign group',
                    detail: 'engagement per campaign and campaign group',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.6',
                    title: 'Lead form funnel',
                    detail: 'impressions, lead form opens, completed leads',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.7',
                    title: 'Cost per lead',
                    detail: 'spend divided by leads',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.8',
                    title: 'Form completion rate',
                    detail: 'completed leads divided by lead form opens',
                    expect: 'answer',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-19',
            name: 'LinkedIn Ads leads',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-19.1',
                    title: 'Cost per lead',
                    detail: 'spend divided by leads',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.2',
                    title: 'Leads',
                    detail: 'lead volume',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.3',
                    title: 'Conversion rate',
                    detail: 'click-to-lead rate',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.4',
                    title: 'Lead funnel',
                    detail: 'drop-off from impressions to qualified leads',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.5',
                    title: 'Campaign ranking',
                    detail: 'campaigns ranked by CPL and lead volume',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.6',
                    title: 'Daily and weekly spend patterns',
                    detail: 'spend by day and week',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.7',
                    title: 'CPM vs. impression growth',
                    detail: 'CPM against impressions over time',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.8',
                    title: 'Lead form completion rate',
                    detail: 'completed leads divided by form opens',
                    expect: 'answer',
                    tags: ['unverified'],
                },
            ],
        },
        {
            id: 'DB-20',
            name: 'LinkedIn Ads creatives',
            source: 'https://blog.coupler.io/ppc-report-templates/',
            charts: [
                {
                    id: 'DB-20.1',
                    title: 'Spend Dynamics',
                    detail: 'daily spend',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.3',
                    title: 'Impressions vs. CPM',
                    detail: 'impressions and CPM over time',
                    expect: 'answer',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.4',
                    title: 'Creative performance',
                    detail: 'engagements, CTR, CPM, CPC, conversions and spend per creative',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.5',
                    title: 'Leads and conversions by creative',
                    detail: 'conversions and lead gen per creative',
                    expect: 'needs_change',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
