// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const salesforceUseCases: LiveUseCases = {
    questions: [
        {
            id: 'SFD-01',
            question:
                'What is our open pipeline amount and expected revenue by opportunity stage?',
            possible: true,
        },
        {
            id: 'SFD-02',
            question:
                'How has our open pipeline changed since the first day of the quarter: which opportunities had their amount, stage or close date changed?',
            possible: false,
        },
        {
            id: 'SFD-03',
            question:
                'How many days do opportunities spend in each stage on average, and where do they move backwards to an earlier stage?',
            possible: false,
        },
        {
            id: 'SFD-04',
            question:
                'Which open opportunities have sat in their current stage longer than our allowed number of days, and how much amount is tied up per owner?',
            possible: true,
        },
        {
            id: 'SFD-05',
            question:
                'From which stage do opportunities most often drop straight to closed-lost?',
            possible: false,
        },
        {
            id: 'SFD-06',
            question:
                'Who are the top reps this quarter by won revenue, with their win rate, average deal size and days to close?',
            possible: true,
        },
        {
            id: 'SFD-07',
            question:
                "How do each sales manager's teams compare this quarter on bookings, pipeline created, losses and win rate?",
            possible: false,
        },
        {
            id: 'SFD-08',
            question:
                'How has the average number of days from opportunity creation to close trended by quarter, for new business versus existing business?',
            possible: true,
        },
        {
            id: 'SFD-09',
            question:
                'How is each rep tracking against quota this quarter, and what is their gap to quota after counting commit forecast?',
            possible: false,
        },
        {
            id: 'SFD-10',
            question:
                'How has the committed forecast for this quarter moved week by week, and how does it compare with the same point last year?',
            possible: false,
        },
        {
            id: 'SFD-11',
            question:
                'How do bookings this quarter compare with last quarter, in amount and in number of deals?',
            possible: true,
        },
        {
            id: 'SFD-12',
            question:
                'How many calls, emails and meetings did each account executive log last week, and how many meetings did they book?',
            possible: false,
        },
        {
            id: 'SFD-13',
            question:
                'How do leads created, leads converted, tasks completed and opportunities created trend day by day, and is there a day-of-week pattern?',
            possible: false,
        },
        {
            id: 'SFD-14',
            question:
                'How much closed-won revenue came from each lead source this year, and which sources convert best?',
            possible: true,
        },
        {
            id: 'SFD-15',
            question:
                'Which campaigns delivered the highest ROI and the lowest cost per won opportunity?',
            possible: false,
        },
        {
            id: 'SFD-16',
            question:
                'What share of new leads get converted, broken down by lead source and lead owner?',
            possible: true,
        },
        {
            id: 'SFD-17',
            question:
                'Of the opportunities created in each quarter, what share has been won, lost or is still open today?',
            possible: true,
        },
        {
            id: 'SFD-18',
            question:
                'Which products are most often sold together on the same won opportunity?',
            possible: false,
        },
        {
            id: 'SFD-19',
            question:
                'What stage is a named opportunity in, what is its next step and close date, and who owns it?',
            possible: true,
        },
        {
            id: 'SFD-20',
            question:
                'What is our win rate by account industry, region and opportunity type over the last 12 months?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-05',
            name: 'Sales forecast',
            purpose:
                'Weekly forecast call: quota attainment, remaining gap, pipeline coverage and how the forecast moved since last week.',
            charts: [
                {
                    id: 'DB-05.1',
                    title: 'Quota attainment',
                    detail: 'closed won versus quota for the period',
                    possible: false,
                },
                {
                    id: 'DB-05.2',
                    title: 'Quota remaining',
                    detail: 'quota minus closed won',
                    possible: false,
                },
                {
                    id: 'DB-05.3',
                    title: 'Pipe coverage',
                    detail: 'open pipeline versus remaining quota',
                    possible: false,
                },
                {
                    id: 'DB-05.4',
                    title: 'Forecast',
                    detail: 'forecast amount by forecast category',
                    possible: true,
                },
                {
                    id: 'DB-05.5',
                    title: 'Forecast vs last week',
                    detail: "this week's forecast compared with last week's",
                    possible: false,
                },
                {
                    id: 'DB-05.6',
                    title: 'Top products',
                    detail: 'products ranked by forecast or won amount',
                    possible: false,
                },
                {
                    id: 'DB-05.7',
                    title: 'Opportunity amount by stage',
                    detail: 'open opportunity amount grouped by stage',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-06',
            name: 'Sales team performance',
            purpose:
                "Monthly team review: who is winning, at what rate and deal size, and how each rep's pipeline looks.",
            charts: [
                {
                    id: 'DB-06.1',
                    title: 'Won vs lost amount',
                    detail: 'closed-won and closed-lost amount per rep',
                    possible: true,
                },
                {
                    id: 'DB-06.2',
                    title: 'Won vs lost opportunities',
                    detail: 'count of won and lost opportunities per rep',
                    possible: true,
                },
                {
                    id: 'DB-06.3',
                    title: 'Win rate',
                    detail: 'share of opportunities closed won',
                    possible: true,
                },
                {
                    id: 'DB-06.4',
                    title: 'Top performers',
                    detail: 'reps ranked by won amount',
                    possible: true,
                },
                {
                    id: 'DB-06.5',
                    title: 'Sales pipeline by stage',
                    detail: 'open opportunities by sales funnel stage',
                    possible: true,
                },
                {
                    id: 'DB-06.6',
                    title: 'Opportunity stage breakdown',
                    detail: 'opportunity count and amount per stage',
                    possible: true,
                },
                {
                    id: 'DB-06.7',
                    title: 'Performance by deal type',
                    detail: 'closed deals by opportunity type',
                    possible: true,
                },
                {
                    id: 'DB-06.8',
                    title: 'Won amount by opportunity type',
                    detail: 'won amount split by opportunity type',
                    possible: true,
                },
                {
                    id: 'DB-06.9',
                    title: 'Won opportunities by size',
                    detail: 'won opportunities bucketed by amount',
                    possible: true,
                },
                {
                    id: 'DB-06.10',
                    title: 'Closed tasks and task overview',
                    detail: 'tasks closed per rep and open task status',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-07',
            name: 'Sales stage analysis',
            purpose:
                'Pipeline inspection: where opportunities slow down, stall, get pushed or are neglected.',
            charts: [
                {
                    id: 'DB-07.1',
                    title: 'Days in each stage',
                    detail: 'average days opportunities spend in each stage',
                    possible: false,
                },
                {
                    id: 'DB-07.2',
                    title: 'Opportunity movement from a selected stage',
                    detail: 'where opportunities go next from a chosen stage, including won and lost counts',
                    possible: false,
                },
                {
                    id: 'DB-07.3',
                    title: 'Neglected opportunities',
                    detail: 'open opportunities with no recent activity',
                    possible: true,
                },
                {
                    id: 'DB-07.4',
                    title: 'Stalled opportunities',
                    detail: 'open opportunities more than 30 days in one stage',
                    possible: true,
                },
                {
                    id: 'DB-07.5',
                    title: 'Pushed opportunities',
                    detail: 'count of opportunities whose close date was pushed',
                    possible: true,
                },
                {
                    id: 'DB-07.6',
                    title: 'Deals overview',
                    detail: 'opportunities with close date, forecast category, amount, account and time in stages',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-08',
            name: 'Marketing executive (leads and campaigns)',
            purpose:
                'Monthly marketing review: lead volume, conversion and campaign ROI by channel.',
            charts: [
                {
                    id: 'DB-08.1',
                    title: 'ROI by campaign type',
                    detail: 'campaign return on investment grouped by campaign type',
                    possible: false,
                },
                {
                    id: 'DB-08.2',
                    title: 'Converted leads by month',
                    detail: 'leads converted per month',
                    possible: true,
                },
                {
                    id: 'DB-08.3',
                    title: 'Lead trending',
                    detail: 'lead status counts by month',
                    possible: true,
                },
                {
                    id: 'DB-08.4',
                    title: 'Top marketing channels',
                    detail: 'channels ranked by leads generated',
                    possible: true,
                },
                {
                    id: 'DB-08.5',
                    title: 'Leads by campaign, industry and source',
                    detail: 'lead counts broken down by campaign, industry and lead source',
                    possible: false,
                },
                {
                    id: 'DB-08.6',
                    title: 'Lead conversion summary',
                    detail: 'leads, converted leads and opportunity amount converted',
                    possible: true,
                },
                {
                    id: 'DB-08.7',
                    title: 'Conversion rate',
                    detail: 'share of leads converted',
                    possible: true,
                },
            ],
        },
    ],
};

export const salesforceSpec: LiveIntegrationSpec = {
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: false,
        oauth: 'no_review',
    },
    useCases: salesforceUseCases,
};
