// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const linkedInAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'LIN-01',
            question:
                'How have LinkedIn impressions, clicks, CPM, CPC and spend trended month by month over the last year?',
            possible: true,
        },
        {
            id: 'LIN-02',
            question:
                'Which LinkedIn campaigns generate the most leads, and which have the lowest cost per lead?',
            possible: true,
        },
        {
            id: 'LIN-03',
            question:
                'Where do we lose people in the LinkedIn lead gen form funnel: impressions to clicks to form opens to submitted leads, and what is the form completion rate per campaign?',
            possible: true,
        },
        {
            id: 'LIN-04',
            question:
                'Which job titles are seeing and clicking our LinkedIn ads, and what share of impressions goes to titles outside our target persona?',
            possible: false,
        },
        {
            id: 'LIN-05',
            question:
                'Which companies saw and engaged with our LinkedIn ads most last quarter, ranked by impressions, clicks and CTR?',
            possible: false,
        },
        {
            id: 'LIN-06',
            question:
                'Which companies received LinkedIn ad impressions even though they are not on the target account list for that campaign?',
            possible: false,
        },
        {
            id: 'LIN-07',
            question:
                'How do click-through rate and cost per click differ by seniority, job function, industry and company size?',
            possible: false,
        },
        {
            id: 'LIN-08',
            question:
                'Which LinkedIn ad creatives drive the most leads and conversions, and what does each cost per click and per lead?',
            possible: false,
        },
        {
            id: 'LIN-09',
            question:
                "Which countries and regions take most of each LinkedIn campaign's spend and clicks each month?",
            possible: false,
        },
        {
            id: 'LIN-10',
            question:
                'How many LinkedIn website conversions were post-click versus view-through for each campaign and conversion action?',
            possible: false,
        },
        {
            id: 'LIN-11',
            question:
                "What share of each campaign's target audience have we actually reached on LinkedIn, and at what average frequency?",
            possible: false,
        },
        {
            id: 'LIN-12',
            question:
                'LinkedIn cost per lead rose this month versus last month: is that from a higher CPM, a lower click-through rate or a lower lead form completion rate?',
            possible: true,
        },
        {
            id: 'LIN-13',
            question:
                'What share of LinkedIn leads have a valid work email or were marked qualified, and what is the cost per qualified lead by campaign?',
            possible: false,
        },
        {
            id: 'LIN-14',
            question:
                'How much has the Q4 Enterprise ABM campaign group spent so far against its total budget?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'DB-18',
            name: 'LinkedIn Ads monthly performance',
            purpose:
                'Monthly B2B paid social review: spend, reach and where the lead form loses people.',
            charts: [
                {
                    id: 'DB-18.1',
                    title: 'Spend',
                    detail: 'spend for the month',
                    possible: true,
                },
                {
                    id: 'DB-18.2',
                    title: 'Reach',
                    detail: 'unique members reached (approximate, not additive)',
                    possible: true,
                },
                {
                    id: 'DB-18.3',
                    title: 'Frequency',
                    detail: 'average impressions per member reached',
                    possible: true,
                },
                {
                    id: 'DB-18.4',
                    title: 'Monthly trends',
                    detail: 'impressions, clicks, CPM, CPC and spend by month',
                    possible: true,
                },
                {
                    id: 'DB-18.5',
                    title: 'Engagement by campaign and campaign group',
                    detail: 'engagement per campaign and campaign group',
                    possible: false,
                },
                {
                    id: 'DB-18.6',
                    title: 'Lead form funnel',
                    detail: 'impressions, lead form opens, completed leads',
                    possible: true,
                },
                {
                    id: 'DB-18.7',
                    title: 'Cost per lead',
                    detail: 'spend divided by leads',
                    possible: true,
                },
                {
                    id: 'DB-18.8',
                    title: 'Form completion rate',
                    detail: 'completed leads divided by lead form opens',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-19',
            name: 'LinkedIn Ads leads',
            purpose:
                'Lead generation review: which campaigns produce the cheapest and most leads and where prospects drop out.',
            charts: [
                {
                    id: 'DB-19.1',
                    title: 'Cost per lead',
                    detail: 'spend divided by leads',
                    possible: true,
                },
                {
                    id: 'DB-19.2',
                    title: 'Leads',
                    detail: 'lead volume',
                    possible: true,
                },
                {
                    id: 'DB-19.3',
                    title: 'Conversion rate',
                    detail: 'click-to-lead rate',
                    possible: true,
                },
                {
                    id: 'DB-19.4',
                    title: 'Lead funnel',
                    detail: 'drop-off from impressions to qualified leads',
                    possible: false,
                },
                {
                    id: 'DB-19.5',
                    title: 'Campaign ranking',
                    detail: 'campaigns ranked by CPL and lead volume',
                    possible: true,
                },
                {
                    id: 'DB-19.6',
                    title: 'Daily and weekly spend patterns',
                    detail: 'spend by day and week',
                    possible: true,
                },
                {
                    id: 'DB-19.7',
                    title: 'CPM vs. impression growth',
                    detail: 'CPM against impressions over time',
                    possible: true,
                },
                {
                    id: 'DB-19.8',
                    title: 'Lead form completion rate',
                    detail: 'completed leads divided by form opens',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-20',
            name: 'LinkedIn Ads creatives',
            purpose:
                'Creative review for B2B audiences: which ads generate leads and how efficiently each one buys reach.',
            charts: [
                {
                    id: 'DB-20.1',
                    title: 'Spend Dynamics',
                    detail: 'daily spend',
                    possible: true,
                },
                {
                    id: 'DB-20.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    possible: true,
                },
                {
                    id: 'DB-20.3',
                    title: 'Impressions vs. CPM',
                    detail: 'impressions and CPM over time',
                    possible: true,
                },
                {
                    id: 'DB-20.4',
                    title: 'Creative performance',
                    detail: 'engagements, CTR, CPM, CPC, conversions and spend per creative',
                    possible: false,
                },
                {
                    id: 'DB-20.5',
                    title: 'Leads and conversions by creative',
                    detail: 'conversions and lead gen per creative',
                    possible: false,
                },
            ],
        },
    ],
};

export const linkedInAdsSpec: LiveIntegrationSpec = {
    auth: {
        description:
            "Needs Advertising API approval: Development tier first, then Standard tier to read customers' ad accounts.",
        testWith: 'paid_account',
        needs: ['gmail', 'phone', 'card', 'real_person', 'vendor_approval'],
        token: false,
        oauth: 'needs_review',
    },
    useCases: linkedInAdsUseCases,
};
