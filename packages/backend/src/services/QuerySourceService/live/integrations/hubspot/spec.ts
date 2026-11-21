// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const hubspotSpec: LiveIntegrationSpec = {
    level: 2,
    auth: {
        testWith: 'test_account',
        needs: ['gmail', 'phone'],
        oauthReview: null,
    },
    api: {
        description:
            'HubSpot CRM Search API, using a private app token or OAuth. Results come 200 per page, up to 10,000 per search, and private apps are limited to about 100 to 190 requests per 10 seconds.',
        serverSideTotals:
            'No. Search filters records, but totals are computed locally after paging, so live queries only work for small filtered slices.',
        vendorLimit:
            'About 5 searches a second per account; private apps 100 to 190 calls per 10 seconds by plan.',
        paging: '200 records a page, up to 5 pages (1,000 rows); counts and lists both page.',
        whyOurLimits:
            'Stays well under 5 searches a second, since one query can page 5 times.',
    },
    questions: [
        {
            id: 'HUB-01',
            question:
                'What is our open pipeline value and deal count by deal stage right now?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'HUB-02',
            question:
                'What did our open pipeline look like by stage on the first day of last quarter, compared with today?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-03',
            question:
                'Which deals had their close date pushed out of this quarter, and how much value moved with them?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-04',
            question:
                "How did this quarter's pipeline change since the quarter started: how much was created, pushed, pulled in, increased, decreased, won and lost?",
            expect: 'needs_change',
        },
        {
            id: 'HUB-05',
            question:
                'What is the conversion rate from each deal stage to the next, and how many deals skip a stage?',
            expect: 'answer',
        },
        {
            id: 'HUB-06',
            question:
                'How many days do deals spend in each stage on average, and which reps are slowest at each stage?',
            expect: 'answer',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'HUB-07',
            question: 'Which reps closed the most won deal revenue this month?',
            expect: 'needs_change',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-08',
            question:
                'What is the win rate and average deal size for each rep and each pipeline this quarter?',
            expect: 'needs_change',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-09',
            question:
                'How has the average number of days from deal creation to closed-won trended month by month over the past year?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'HUB-10',
            question:
                'How much revenue has each rep closed against their quota this quarter, and who is behind pace?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-11',
            question:
                'How many calls, emails and meetings did each rep log last week compared with the week before?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-12',
            question:
                'How long does it take each rep to make first contact after a new lead is assigned to them?',
            expect: 'needs_change',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-13',
            question:
                'How much closed-won deal revenue came from each original traffic source this year?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'HUB-14',
            question:
                'What share of leads become MQLs, SQLs and then customers, and where is the biggest drop-off?',
            expect: 'answer',
        },
        {
            id: 'HUB-15',
            question:
                'Of the contacts created in each month, what share reached customer stage within 90 days?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'HUB-16',
            question:
                'Which marketing emails had the highest open and click-through rates last quarter, and which had the worst bounce and unsubscribe rates?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-17',
            question:
                'Each week, how many tickets were closed within SLA versus out of SLA?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-18',
            question:
                'How many tickets were open at the end of each day over the past month, split by ticket pipeline stage?',
            expect: 'needs_change',
        },
        {
            id: 'HUB-19',
            question:
                'When did we last have a call, meeting or email with anyone at a given company, and how many touches has it had in total?',
            expect: 'answer',
        },
        {
            id: 'HUB-20',
            question:
                'Which open deals have had no logged activity in the last 14 days, sorted by amount?',
            expect: 'answer',
            tags: ['capped'],
        },
    ],
    dashboards: [
        {
            id: 'DB-01',
            name: 'CRM / sales pipeline dashboard',
            charts: [
                {
                    id: 'DB-01.1',
                    title: 'Sales department KPIs over time',
                    detail: 'headline deal KPIs (deals, closed amount) trended over time',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.2',
                    title: 'Pipeline overview by agent or deal label',
                    detail: 'open deals by stage, split by owner or deal label',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-01.3',
                    title: 'Open opportunities by probability',
                    detail: 'open deals with amount and close probability; filterable by owner, stage, deal type',
                    expect: 'answer',
                },
                {
                    id: 'DB-01.4',
                    title: 'Deals at each stage by month',
                    detail: 'monthly deal counts per stage from appointment scheduled to closed won',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.5',
                    title: 'Stalled deals by days inactive',
                    detail: 'open deals ranked by days since last activity',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.6',
                    title: 'Top won deals',
                    detail: 'largest won deals by closed amount, with customer and industry',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-01.7',
                    title: 'Won deal reasons',
                    detail: 'won deals grouped by closed-won reason',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-01.8',
                    title: 'Lost deal reasons',
                    detail: 'lost deals grouped by closed-lost reason',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
            ],
        },
        {
            id: 'DB-02',
            name: 'Sales activity by rep (weekly)',
            charts: [
                {
                    id: 'DB-02.1',
                    title: 'Emails by rep',
                    detail: 'outgoing, incoming and reply counts per rep, against target',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-02.2',
                    title: 'Calls by rep',
                    detail: 'calls made and received per rep, compared with the previous period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-02.3',
                    title: 'Meetings by rep',
                    detail: 'prospect and client meetings per rep per day',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-02.4',
                    title: 'Team meetings with prospects',
                    detail: 'meetings booked and held across the team in the period, against target',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-02.5',
                    title: 'Team email volume by day',
                    detail: 'sent, received and replied emails per day to show peak days',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-02.6',
                    title: 'Call notes logged',
                    detail: 'notes logged by the team and by each rep',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-03',
            name: 'Marketing and sales performance (lead funnel)',
            charts: [
                {
                    id: 'DB-03.1',
                    title: 'Full funnel from subscribers to evangelists',
                    detail: 'contact counts at each lifecycle stage from subscriber to evangelist',
                    expect: 'answer',
                },
                {
                    id: 'DB-03.2',
                    title: 'Conversion rate at each funnel stage',
                    detail: 'stage-to-stage conversion percentages including the marketing-to-sales handoff',
                    expect: 'answer',
                },
                {
                    id: 'DB-03.3',
                    title: 'Qualified leads by channel',
                    detail: 'qualified leads grouped by traffic source',
                    expect: 'answer',
                },
                {
                    id: 'DB-03.4',
                    title: 'Closed deals by channel',
                    detail: 'closed deals grouped by traffic source',
                    expect: 'answer',
                },
                {
                    id: 'DB-03.5',
                    title: 'Deal stages by channel',
                    detail: 'open deals by stage, split by source channel',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-03.6',
                    title: 'Won vs lost deals by channel',
                    detail: 'won and lost deal counts per source channel',
                    expect: 'answer',
                },
                {
                    id: 'DB-03.7',
                    title: 'Deal progression speed by source',
                    detail: 'how fast deals from each source move through stages',
                    expect: 'answer',
                    tags: ['capped'],
                },
            ],
        },
        {
            id: 'DB-04',
            name: 'Help desk / service tickets',
            charts: [
                {
                    id: 'DB-04.1',
                    title: 'Open and closed tickets today',
                    detail: "today's open and closed ticket counts for the team",
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.2',
                    title: 'Time to first reply',
                    detail: 'average time reps take to first respond, today and over time',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.3',
                    title: 'Time to close',
                    detail: 'average time to close tickets over time',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.4',
                    title: 'CSAT',
                    detail: 'customer satisfaction score from post-ticket surveys',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.5',
                    title: 'SLA progress',
                    detail: 'tickets that are overdue, due soon or active against time-to-close and first/next response SLAs',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.6',
                    title: 'Time to close SLA completion over time',
                    detail: 'tickets closed on time versus out of SLA per period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.7',
                    title: 'First response SLA completion over time',
                    detail: 'tickets first responded to on time versus late per period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.8',
                    title: 'Tickets created over time',
                    detail: 'new tickets per period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.9',
                    title: 'Tickets by channel',
                    detail: "today's and all open tickets by channel",
                    expect: 'needs_change',
                },
                {
                    id: 'DB-04.10',
                    title: 'Tickets by priority',
                    detail: 'tickets opened today and total open tickets by priority',
                    expect: 'needs_change',
                },
            ],
        },
    ],
};
