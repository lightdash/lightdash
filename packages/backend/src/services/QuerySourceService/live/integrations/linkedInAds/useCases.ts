// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const linkedInAdsUseCases: LiveUseCases = {
    questions: [
        {
            id: 'LIN-01',
            question:
                'How have LinkedIn impressions, clicks, CPM, CPC and spend trended month by month over the last year?',
            expect: 'answer',
            why: 'Month with impressions, clicks and cost is one query (12 rows); CPM and CPC are not fields, so a DuckDB step divides.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-02',
            question:
                'Which LinkedIn campaigns generate the most leads, and which have the lowest cost per lead?',
            expect: 'answer',
            why: 'Leads and cost per campaign come back correctly and DuckDB adds cost per lead, but campaigns are identified by numeric ID only: the explore has no campaign names.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-03',
            question:
                'Where do we lose people in the LinkedIn lead gen form funnel: impressions to clicks to form opens to submitted leads, and what is the form completion rate per campaign?',
            expect: 'answer',
            why: 'Impressions, clicks, lead form opens and leads are all metrics; completion rate per campaign is a division in DuckDB. Campaigns are shown by numeric ID, not name.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-04',
            question:
                'Which job titles are seeing and clicking our LinkedIn ads, and what share of impressions goes to titles outside our target persona?',
            expect: 'needs_change',
            why: 'Only account, campaign group and campaign reports are offered; there is no job title breakdown. LinkedIn returns titles as ids that need a name lookup, hides values with very few events, and the target persona has to come from the user.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-05',
            question:
                'Which companies saw and engaged with our LinkedIn ads most last quarter, ranked by impressions, clicks and CTR?',
            expect: 'needs_change',
            why: 'There is no company breakdown today. LinkedIn reports impressions and clicks by member company as ids that need an organisation name lookup.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-06',
            question:
                'Which companies received LinkedIn ad impressions even though they are not on the target account list for that campaign?',
            expect: 'needs_change',
            why: 'Needs impressions by company per campaign (not offered) set against the target account list. LinkedIn does not hand back the companies inside an uploaded list, so the list has to come from the CRM or warehouse and be matched to LinkedIn companies by name.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-07',
            question:
                'How do click-through rate and cost per click differ by seniority, job function, industry and company size?',
            expect: 'needs_change',
            why: 'Seniority, job function, industry and company size breakdowns are not offered, and CTR and CPC are not fields.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-08',
            question:
                'Which LinkedIn ad creatives drive the most leads and conversions, and what does each cost per click and per lead?',
            expect: 'needs_change',
            why: 'There is no creative level today: the finest report is campaign.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-09',
            question:
                "Which countries and regions take most of each LinkedIn campaign's spend and clicks each month?",
            expect: 'needs_change',
            why: "No country or region breakdown today, and the current request takes one pivot, so campaign by country needs LinkedIn's multi-pivot finder or a campaign filter.",
            tags: ['unverified'],
        },
        {
            id: 'LIN-10',
            question:
                'How many LinkedIn website conversions were post-click versus view-through for each campaign and conversion action?',
            expect: 'needs_change',
            why: 'Post-click and post-view conversions per campaign are metrics today (by campaign ID). The split by conversion action is not offered.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-11',
            question:
                "What share of each campaign's target audience have we actually reached on LinkedIn, and at what average frequency?",
            expect: 'needs_change',
            why: "Reach per campaign is offered (for up to 92 days) and frequency is impressions over reach, but the size of each campaign's target audience is not: it needs each campaign's targeting read and then one audience-count call per campaign.",
            tags: ['unverified'],
        },
        {
            id: 'LIN-12',
            question:
                'LinkedIn cost per lead rose this month versus last month: is that from a higher CPM, a lower click-through rate or a lower lead form completion rate?',
            expect: 'answer',
            why: 'One month-grain query returns cost, impressions, clicks, form opens and leads for both months; DuckDB or the agent turns the change in cost per lead into CPM, CTR and completion rate effects. Two rows.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-13',
            question:
                'What share of LinkedIn leads have a valid work email or were marked qualified, and what is the cost per qualified lead by campaign?',
            expect: 'needs_change',
            why: 'Only total leads is offered. LinkedIn reports qualified leads and leads with a valid work email as separate metrics that the explore does not include.',
            tags: ['unverified'],
        },
        {
            id: 'LIN-14',
            question:
                'How much has the Q4 Enterprise ABM campaign group spent so far against its total budget?',
            expect: 'needs_change',
            why: 'Spend per campaign group works by numeric ID, but the group cannot be found by name and its total budget is not a field.',
            tags: ['unverified'],
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
                    expect: 'answer',
                    why: 'Cost for the date range.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.2',
                    title: 'Reach',
                    detail: 'unique members reached (approximate, not additive)',
                    expect: 'answer',
                    why: 'LinkedIn computes approximate reach for the range, up to 92 days.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.3',
                    title: 'Frequency',
                    detail: 'average impressions per member reached',
                    expect: 'answer',
                    why: 'Frequency is impressions over reach from one account-level row, divided in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.4',
                    title: 'Monthly trends',
                    detail: 'impressions, clicks, CPM, CPC and spend by month',
                    expect: 'answer',
                    why: 'Month with impressions, clicks and cost; CPM and CPC are divisions in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.5',
                    title: 'Engagement by campaign and campaign group',
                    detail: 'engagement per campaign and campaign group',
                    expect: 'needs_change',
                    why: 'Campaign and campaign group cannot be shown together, and both are numeric IDs with no names.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.6',
                    title: 'Lead form funnel',
                    detail: 'impressions, lead form opens, completed leads',
                    expect: 'answer',
                    why: 'Impressions, lead form opens and leads are three metrics in one row.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.7',
                    title: 'Cost per lead',
                    detail: 'spend divided by leads',
                    expect: 'answer',
                    why: 'Cost over leads, divided in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-18.8',
                    title: 'Form completion rate',
                    detail: 'completed leads divided by lead form opens',
                    expect: 'answer',
                    why: 'Leads over lead form opens, divided in DuckDB.',
                    tags: ['unverified'],
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
                    expect: 'answer',
                    why: 'Cost over leads, divided in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.2',
                    title: 'Leads',
                    detail: 'lead volume',
                    expect: 'answer',
                    why: 'Leads for the date range.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.3',
                    title: 'Conversion rate',
                    detail: 'click-to-lead rate',
                    expect: 'answer',
                    why: 'Leads over clicks, divided in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.4',
                    title: 'Lead funnel',
                    detail: 'drop-off from impressions to qualified leads',
                    expect: 'needs_change',
                    why: 'Impressions, clicks, form opens and leads work; qualified leads is not offered.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.5',
                    title: 'Campaign ranking',
                    detail: 'campaigns ranked by CPL and lead volume',
                    expect: 'answer',
                    why: 'Leads and cost per campaign with cost per lead from DuckDB; campaigns are shown by numeric ID, not name.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.6',
                    title: 'Daily and weekly spend patterns',
                    detail: 'spend by day and week',
                    expect: 'answer',
                    why: 'Daily spend is one query; the weekly view is the same rows rolled up in DuckDB because there is no week grain.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.7',
                    title: 'CPM vs. impression growth',
                    detail: 'CPM against impressions over time',
                    expect: 'answer',
                    why: 'Date with cost and impressions; CPM is a division in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-19.8',
                    title: 'Lead form completion rate',
                    detail: 'completed leads divided by form opens',
                    expect: 'answer',
                    why: 'Leads over lead form opens, divided in DuckDB.',
                    tags: ['unverified'],
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
                    expect: 'answer',
                    why: 'Date with cost.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.2',
                    title: 'Clicks vs. CPC',
                    detail: 'clicks and CPC over time',
                    expect: 'answer',
                    why: 'Date with clicks and cost; CPC is a division in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.3',
                    title: 'Impressions vs. CPM',
                    detail: 'impressions and CPM over time',
                    expect: 'answer',
                    why: 'Date with impressions and cost; CPM is a division in DuckDB.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.4',
                    title: 'Creative performance',
                    detail: 'engagements, CTR, CPM, CPC, conversions and spend per creative',
                    expect: 'needs_change',
                    why: 'There is no creative level; the finest report is campaign.',
                    tags: ['unverified'],
                },
                {
                    id: 'DB-20.5',
                    title: 'Leads and conversions by creative',
                    detail: 'conversions and lead gen per creative',
                    expect: 'needs_change',
                    why: 'There is no creative level today.',
                    tags: ['unverified'],
                },
            ],
        },
    ],
};
