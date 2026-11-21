// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const hubspotUseCases: LiveUseCases = {
    questions: [
        {
            id: 'HUB-01',
            question:
                'What is our open pipeline value and deal count by deal stage right now?',
            possible: true,
        },
        {
            id: 'HUB-02',
            question:
                'What did our open pipeline look like by stage on the first day of last quarter, compared with today?',
            possible: false,
        },
        {
            id: 'HUB-03',
            question:
                'Which deals had their close date pushed out of this quarter, and how much value moved with them?',
            possible: false,
        },
        {
            id: 'HUB-04',
            question:
                "How did this quarter's pipeline change since the quarter started: how much was created, pushed, pulled in, increased, decreased, won and lost?",
            possible: false,
        },
        {
            id: 'HUB-05',
            question:
                'What is the conversion rate from each deal stage to the next, and how many deals skip a stage?',
            possible: true,
        },
        {
            id: 'HUB-06',
            question:
                'How many days do deals spend in each stage on average, and which reps are slowest at each stage?',
            possible: true,
        },
        {
            id: 'HUB-07',
            question: 'Which reps closed the most won deal revenue this month?',
            possible: false,
        },
        {
            id: 'HUB-08',
            question:
                'What is the win rate and average deal size for each rep and each pipeline this quarter?',
            possible: false,
        },
        {
            id: 'HUB-09',
            question:
                'How has the average number of days from deal creation to closed-won trended month by month over the past year?',
            possible: true,
        },
        {
            id: 'HUB-10',
            question:
                'How much revenue has each rep closed against their quota this quarter, and who is behind pace?',
            possible: false,
        },
        {
            id: 'HUB-11',
            question:
                'How many calls, emails and meetings did each rep log last week compared with the week before?',
            possible: false,
        },
        {
            id: 'HUB-12',
            question:
                'How long does it take each rep to make first contact after a new lead is assigned to them?',
            possible: false,
        },
        {
            id: 'HUB-13',
            question:
                'How much closed-won deal revenue came from each original traffic source this year?',
            possible: true,
        },
        {
            id: 'HUB-14',
            question:
                'What share of leads become MQLs, SQLs and then customers, and where is the biggest drop-off?',
            possible: true,
        },
        {
            id: 'HUB-15',
            question:
                'Of the contacts created in each month, what share reached customer stage within 90 days?',
            possible: true,
        },
        {
            id: 'HUB-16',
            question:
                'Which marketing emails had the highest open and click-through rates last quarter, and which had the worst bounce and unsubscribe rates?',
            possible: false,
        },
        {
            id: 'HUB-17',
            question:
                'Each week, how many tickets were closed within SLA versus out of SLA?',
            possible: false,
        },
        {
            id: 'HUB-18',
            question:
                'How many tickets were open at the end of each day over the past month, split by ticket pipeline stage?',
            possible: false,
        },
        {
            id: 'HUB-19',
            question:
                'When did we last have a call, meeting or email with anyone at a given company, and how many touches has it had in total?',
            possible: true,
        },
        {
            id: 'HUB-20',
            question:
                'Which open deals have had no logged activity in the last 14 days, sorted by amount?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-01',
            name: 'CRM / sales pipeline dashboard',
            purpose:
                'Weekly pipeline review: where open deals sit, which are stalled, and why deals are won or lost.',
            charts: [
                {
                    id: 'DB-01.1',
                    title: 'Sales department KPIs over time',
                    detail: 'headline deal KPIs (deals, closed amount) trended over time',
                    possible: true,
                },
                {
                    id: 'DB-01.2',
                    title: 'Pipeline overview by agent or deal label',
                    detail: 'open deals by stage, split by owner or deal label',
                    possible: true,
                },
                {
                    id: 'DB-01.3',
                    title: 'Open opportunities by probability',
                    detail: 'open deals with amount and close probability; filterable by owner, stage, deal type',
                    possible: true,
                },
                {
                    id: 'DB-01.4',
                    title: 'Deals at each stage by month',
                    detail: 'monthly deal counts per stage from appointment scheduled to closed won',
                    possible: true,
                },
                {
                    id: 'DB-01.5',
                    title: 'Stalled deals by days inactive',
                    detail: 'open deals ranked by days since last activity',
                    possible: true,
                },
                {
                    id: 'DB-01.6',
                    title: 'Top won deals',
                    detail: 'largest won deals by closed amount, with customer and industry',
                    possible: false,
                },
                {
                    id: 'DB-01.7',
                    title: 'Won deal reasons',
                    detail: 'won deals grouped by closed-won reason',
                    possible: true,
                },
                {
                    id: 'DB-01.8',
                    title: 'Lost deal reasons',
                    detail: 'lost deals grouped by closed-lost reason',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-02',
            name: 'Sales activity by rep (weekly)',
            purpose:
                'Weekly 1:1s and team stand-up: are reps making enough calls, emails and meetings against target.',
            charts: [
                {
                    id: 'DB-02.1',
                    title: 'Emails by rep',
                    detail: 'outgoing, incoming and reply counts per rep, against target',
                    possible: false,
                },
                {
                    id: 'DB-02.2',
                    title: 'Calls by rep',
                    detail: 'calls made and received per rep, compared with the previous period',
                    possible: false,
                },
                {
                    id: 'DB-02.3',
                    title: 'Meetings by rep',
                    detail: 'prospect and client meetings per rep per day',
                    possible: false,
                },
                {
                    id: 'DB-02.4',
                    title: 'Team meetings with prospects',
                    detail: 'meetings booked and held across the team in the period, against target',
                    possible: false,
                },
                {
                    id: 'DB-02.5',
                    title: 'Team email volume by day',
                    detail: 'sent, received and replied emails per day to show peak days',
                    possible: false,
                },
                {
                    id: 'DB-02.6',
                    title: 'Call notes logged',
                    detail: 'notes logged by the team and by each rep',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-03',
            name: 'Marketing and sales performance (lead funnel)',
            purpose:
                'Monthly marketing review: which channels produce qualified leads and closed deals, and where the funnel leaks.',
            charts: [
                {
                    id: 'DB-03.1',
                    title: 'Full funnel from subscribers to evangelists',
                    detail: 'contact counts at each lifecycle stage from subscriber to evangelist',
                    possible: true,
                },
                {
                    id: 'DB-03.2',
                    title: 'Conversion rate at each funnel stage',
                    detail: 'stage-to-stage conversion percentages including the marketing-to-sales handoff',
                    possible: true,
                },
                {
                    id: 'DB-03.3',
                    title: 'Qualified leads by channel',
                    detail: 'qualified leads grouped by traffic source',
                    possible: true,
                },
                {
                    id: 'DB-03.4',
                    title: 'Closed deals by channel',
                    detail: 'closed deals grouped by traffic source',
                    possible: true,
                },
                {
                    id: 'DB-03.5',
                    title: 'Deal stages by channel',
                    detail: 'open deals by stage, split by source channel',
                    possible: true,
                },
                {
                    id: 'DB-03.6',
                    title: 'Won vs lost deals by channel',
                    detail: 'won and lost deal counts per source channel',
                    possible: true,
                },
                {
                    id: 'DB-03.7',
                    title: 'Deal progression speed by source',
                    detail: 'how fast deals from each source move through stages',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-04',
            name: 'Help desk / service tickets',
            purpose:
                'Daily support stand-up: ticket load, response and resolution times, and SLA compliance.',
            charts: [
                {
                    id: 'DB-04.1',
                    title: 'Open and closed tickets today',
                    detail: "today's open and closed ticket counts for the team",
                    possible: false,
                },
                {
                    id: 'DB-04.2',
                    title: 'Time to first reply',
                    detail: 'average time reps take to first respond, today and over time',
                    possible: false,
                },
                {
                    id: 'DB-04.3',
                    title: 'Time to close',
                    detail: 'average time to close tickets over time',
                    possible: false,
                },
                {
                    id: 'DB-04.4',
                    title: 'CSAT',
                    detail: 'customer satisfaction score from post-ticket surveys',
                    possible: false,
                },
                {
                    id: 'DB-04.5',
                    title: 'SLA progress',
                    detail: 'tickets that are overdue, due soon or active against time-to-close and first/next response SLAs',
                    possible: false,
                },
                {
                    id: 'DB-04.6',
                    title: 'Time to close SLA completion over time',
                    detail: 'tickets closed on time versus out of SLA per period',
                    possible: false,
                },
                {
                    id: 'DB-04.7',
                    title: 'First response SLA completion over time',
                    detail: 'tickets first responded to on time versus late per period',
                    possible: false,
                },
                {
                    id: 'DB-04.8',
                    title: 'Tickets created over time',
                    detail: 'new tickets per period',
                    possible: false,
                },
                {
                    id: 'DB-04.9',
                    title: 'Tickets by channel',
                    detail: "today's and all open tickets by channel",
                    possible: false,
                },
                {
                    id: 'DB-04.10',
                    title: 'Tickets by priority',
                    detail: 'tickets opened today and total open tickets by priority',
                    possible: false,
                },
            ],
        },
    ],
};
