// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const hubspotUseCases: LiveUseCases = {
    questions: [
        {
            id: 'HUB-01',
            question:
                'What is our open pipeline value and deal count by deal stage right now?',
            expect: 'answer',
            why: 'HubSpot has no server-side sums and its Count cannot be split by a field, so the AI agent lists open deals (stage, amount) and totals them in a DuckDB step. Deal counts per stage can also come from one Count query per stage, which is exact at any size.',
            tags: ['capped'],
        },
        {
            id: 'HUB-02',
            question:
                'What did our open pipeline look like by stage on the first day of last quarter, compared with today?',
            expect: 'needs_change',
            why: 'The integration reads only current property values through the search API, so it cannot say which stage or amount a deal had on a past date. HubSpot does keep property history, but only on record reads (50 records per call), which the integration does not use.',
        },
        {
            id: 'HUB-03',
            question:
                'Which deals had their close date pushed out of this quarter, and how much value moved with them?',
            expect: 'needs_change',
            why: "A pushed close date is only visible in the close date's change history; the deal row holds the current close date alone. The integration does not read property history.",
        },
        {
            id: 'HUB-04',
            question:
                "How did this quarter's pipeline change since the quarter started: how much was created, pushed, pulled in, increased, decreased, won and lost?",
            expect: 'needs_change',
            why: 'Created, won and lost this quarter can be derived from current dates, but pushed, pulled in, increased and decreased need the earlier close date and amount of each deal, which only property history holds.',
        },
        {
            id: 'HUB-05',
            question:
                'What is the conversion rate from each deal stage to the next, and how many deals skip a stage?',
            expect: 'answer',
            why: "HubSpot keeps a 'date entered <stage>' property per stage on every deal, and Count with a filter on those dates is one exact call per stage or stage pair, so the agent can build the stage-to-stage rates and the skips by subtraction in a DuckDB step. An admin must first switch those hs_ properties on, since they start hidden. The AI agent's instructions tell it to decline funnels on live data sources, so it may refuse this wording unless asked for the counts per stage; the same pipeline built through MCP or as code runs.",
        },
        {
            id: 'HUB-06',
            question:
                'How many days do deals spend in each stage on average, and which reps are slowest at each stage?',
            expect: 'answer',
            why: "Each deal carries a 'time in <stage>' property per stage, so the agent lists deals with those values and averages them per stage and per owner in DuckDB. There are no server-side averages, and reps come back as numeric owner ids, not names.",
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'HUB-07',
            question: 'Which reps closed the most won deal revenue this month?',
            expect: 'needs_change',
            why: 'Won deals this month fit under the cap and DuckDB can total amount per owner, but HubSpot returns the owner as a numeric id and the integration does not read the owners list, so the ranking has no rep names.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-08',
            question:
                'What is the win rate and average deal size for each rep and each pipeline this quarter?',
            expect: 'needs_change',
            why: 'Closed deals this quarter can be listed with owner, pipeline, won flag and amount, and DuckDB computes win rate and average size. The per-pipeline half works today under the cap; the per-rep half shows numeric owner ids because owner names are not read.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-09',
            question:
                'How has the average number of days from deal creation to closed-won trended month by month over the past year?',
            expect: 'answer',
            why: "Deals have a 'days to close' property and a close date, so the agent lists won deals month by month (one node per month, since the only date grain is day) and averages in DuckDB.",
            tags: ['capped'],
        },
        {
            id: 'HUB-10',
            question:
                'How much revenue has each rep closed against their quota this quarter, and who is behind pace?',
            expect: 'needs_change',
            why: "Closed revenue per owner works under the cap, but quotas live in HubSpot's goals object, which the integration does not offer, and owners are numeric ids. A quota table uploaded to Lightdash could be joined in the composer as a workaround.",
        },
        {
            id: 'HUB-11',
            question:
                'How many calls, emails and meetings did each rep log last week compared with the week before?',
            expect: 'needs_change',
            why: 'Calls, emails and meetings are separate HubSpot objects and the integration offers only deals, contacts and companies, so no activity can be counted today.',
        },
        {
            id: 'HUB-12',
            question:
                'How long does it take each rep to make first contact after a new lead is assigned to them?',
            expect: 'needs_change',
            why: 'Contacts carry an owner-assigned date and a lead response time property, so the agent can list newly assigned contacts and average the response time per owner without reading activities. The result is keyed by numeric owner id because owner names are not read, and the hs_ property must be switched on first.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'HUB-13',
            question:
                'How much closed-won deal revenue came from each original traffic source this year?',
            expect: 'answer',
            why: 'Deals carry their own original traffic source property, so no join to contacts is needed: the agent lists won deals for the year (split into monthly nodes) and sums amount per source in DuckDB.',
            tags: ['capped'],
        },
        {
            id: 'HUB-14',
            question:
                'What share of leads become MQLs, SQLs and then customers, and where is the biggest drop-off?',
            expect: 'answer',
            why: "Contacts hold a 'became a lead / MQL / SQL / customer' date per lifecycle stage, and Count with a filter on those dates is one exact call each at any contact volume; a DuckDB step turns the counts into shares and finds the largest drop. An admin must switch those hs_ date properties on first. The AI agent's instructions tell it to decline funnels on live data sources, so it may refuse this wording unless asked for the counts per stage; the same pipeline built through MCP or as code runs.",
        },
        {
            id: 'HUB-15',
            question:
                'Of the contacts created in each month, what share reached customer stage within 90 days?',
            expect: 'answer',
            why: 'The cohort size per month is an exact Count, and the contacts in each cohort that became customers are listed with both dates so DuckDB can check the 90 days. That is two nodes per month, close to the 25-node pipeline limit for a year.',
            tags: ['capped'],
        },
        {
            id: 'HUB-16',
            question:
                'Which marketing emails had the highest open and click-through rates last quarter, and which had the worst bounce and unsubscribe rates?',
            expect: 'needs_change',
            why: "Marketing email performance sits in HubSpot's marketing email API, which already returns sends, opens, clicks, bounces and unsubscribes per email. The integration reads only CRM deals, contacts and companies.",
        },
        {
            id: 'HUB-17',
            question:
                'Each week, how many tickets were closed within SLA versus out of SLA?',
            expect: 'needs_change',
            why: 'Tickets, with their SLA status properties, are a HubSpot object the integration does not offer.',
        },
        {
            id: 'HUB-18',
            question:
                'How many tickets were open at the end of each day over the past month, split by ticket pipeline stage?',
            expect: 'needs_change',
            why: "Tickets are not offered, and a daily count of open tickets by the stage they were in on that day needs each ticket's stage history, which the search API does not return.",
        },
        {
            id: 'HUB-19',
            question:
                'When did we last have a call, meeting or email with anyone at a given company, and how many touches has it had in total?',
            expect: 'answer',
            why: 'Company records already carry rolled-up activity properties (last contacted, last activity date, number of times contacted, last logged call and last booked meeting dates), so a filter on the company name returns one row with the answer and no join to activities.',
        },
        {
            id: 'HUB-20',
            question:
                'Which open deals have had no logged activity in the last 14 days, sorted by amount?',
            expect: 'answer',
            why: "Deals have a last-activity-date property and amount sorts on HubSpot's side, but the filter shape cannot ask for 'no activity at all' (no empty-value operator, no OR), so the safe path lists all open deals and filters in DuckDB, which keeps the never-contacted ones.",
            tags: ['capped'],
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
                    expect: 'answer',
                    why: 'Deal counts per month are exact Count calls, but closed amount per month is summed in DuckDB over listed deals, at most 1,000 per node.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.2',
                    title: 'Pipeline overview by agent or deal label',
                    detail: 'open deals by stage, split by owner or deal label',
                    expect: 'answer',
                    why: 'Open deals are listed with stage and owner (or a label property) and counted in DuckDB; owners show as numeric ids.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-01.3',
                    title: 'Open opportunities by probability',
                    detail: 'open deals with amount and close probability; filterable by owner, stage, deal type',
                    expect: 'answer',
                    why: "A plain list of open deals with amount and stage probability, sorted by amount on HubSpot's side, up to 1,000 rows.",
                },
                {
                    id: 'DB-01.4',
                    title: 'Deals at each stage by month',
                    detail: 'monthly deal counts per stage from appointment scheduled to closed won',
                    expect: 'answer',
                    why: "Deals entering each stage per month come from the per-stage 'date entered' properties, read as rows and unpivoted in DuckDB; exact Count calls would need more nodes than one pipeline allows.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.5',
                    title: 'Stalled deals by days inactive',
                    detail: 'open deals ranked by days since last activity',
                    expect: 'answer',
                    why: 'Open deals are read with their last activity date and ranked in DuckDB, which keeps deals that never had activity; a single filtered list would drop those.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-01.6',
                    title: 'Top won deals',
                    detail: 'largest won deals by closed amount, with customer and industry',
                    expect: 'needs_change',
                    why: "The largest won deals sort on HubSpot's side, but the customer's name and industry are company fields and the integration reads no associations, so deals cannot be tied to companies at typical company counts.",
                },
                {
                    id: 'DB-01.7',
                    title: 'Won deal reasons',
                    detail: 'won deals grouped by closed-won reason',
                    expect: 'answer',
                    why: 'Won deals are listed with the closed-won reason and grouped in DuckDB; the reason is free text by default, so groups are only as clean as the entries.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-01.8',
                    title: 'Lost deal reasons',
                    detail: 'lost deals grouped by closed-lost reason',
                    expect: 'answer',
                    why: 'Lost deals are listed with the closed-lost reason and grouped in DuckDB; same limits as the won reasons tile.',
                    tags: ['unverified', 'no_data', 'capped'],
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
                    expect: 'needs_change',
                    why: 'Emails are a separate HubSpot object the integration does not offer, and per-rep targets are not in the CRM objects it reads.',
                },
                {
                    id: 'DB-02.2',
                    title: 'Calls by rep',
                    detail: 'calls made and received per rep, compared with the previous period',
                    expect: 'needs_change',
                    why: 'Calls are a separate HubSpot object the integration does not offer; the previous-period comparison would be a second date-range node.',
                },
                {
                    id: 'DB-02.3',
                    title: 'Meetings by rep',
                    detail: 'prospect and client meetings per rep per day',
                    expect: 'needs_change',
                    why: 'Meetings are a separate HubSpot object the integration does not offer.',
                },
                {
                    id: 'DB-02.4',
                    title: 'Team meetings with prospects',
                    detail: 'meetings booked and held across the team in the period, against target',
                    expect: 'needs_change',
                    why: 'Meetings are not offered; once they are, the team total is two exact Count calls (booked, held).',
                },
                {
                    id: 'DB-02.5',
                    title: 'Team email volume by day',
                    detail: 'sent, received and replied emails per day to show peak days',
                    expect: 'needs_change',
                    why: 'Emails are not offered; a daily series would be one Count per day and direction or a DuckDB step over listed emails.',
                },
                {
                    id: 'DB-02.6',
                    title: 'Call notes logged',
                    detail: 'notes logged by the team and by each rep',
                    expect: 'needs_change',
                    why: 'Notes are a separate HubSpot object the integration does not offer.',
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
                    expect: 'answer',
                    why: 'One exact Count call per lifecycle stage, stacked in a DuckDB step; right at any contact volume.',
                },
                {
                    id: 'DB-03.2',
                    title: 'Conversion rate at each funnel stage',
                    detail: 'stage-to-stage conversion percentages including the marketing-to-sales handoff',
                    expect: 'answer',
                    why: "Stage-to-stage rates come from Count calls filtered on the 'became a ...' date properties, divided in DuckDB; those hs_ properties must be switched on first.",
                },
                {
                    id: 'DB-03.3',
                    title: 'Qualified leads by channel',
                    detail: 'qualified leads grouped by traffic source',
                    expect: 'answer',
                    why: 'One exact Count call per traffic source for contacts at the qualified stages (about 10 sources).',
                },
                {
                    id: 'DB-03.4',
                    title: 'Closed deals by channel',
                    detail: 'closed deals grouped by traffic source',
                    expect: 'answer',
                    why: 'One exact Count call per traffic source for closed deals; deals carry their own original source.',
                },
                {
                    id: 'DB-03.5',
                    title: 'Deal stages by channel',
                    detail: 'open deals by stage, split by source channel',
                    expect: 'answer',
                    why: 'Stage by source is about 80 combinations, too many Count nodes for one pipeline, so open deals are read as rows and counted in DuckDB.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-03.6',
                    title: 'Won vs lost deals by channel',
                    detail: 'won and lost deal counts per source channel',
                    expect: 'answer',
                    why: 'About 20 exact Count calls (source x won or lost), stacked in DuckDB; fits one pipeline.',
                },
                {
                    id: 'DB-03.7',
                    title: 'Deal progression speed by source',
                    detail: 'how fast deals from each source move through stages',
                    expect: 'answer',
                    why: "Speed needs each deal's days to close or time-in-stage values read as rows and averaged per source in DuckDB.",
                    tags: ['capped'],
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
                    expect: 'needs_change',
                    why: 'Tickets are a HubSpot object the integration does not offer; once offered these are two exact Count calls.',
                },
                {
                    id: 'DB-04.2',
                    title: 'Time to first reply',
                    detail: 'average time reps take to first respond, today and over time',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; the average of the time-to-first-reply property would be computed in DuckDB over listed tickets.',
                },
                {
                    id: 'DB-04.3',
                    title: 'Time to close',
                    detail: 'average time to close tickets over time',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; average time to close per period would be computed in DuckDB over listed tickets.',
                },
                {
                    id: 'DB-04.4',
                    title: 'CSAT',
                    detail: 'customer satisfaction score from post-ticket surveys',
                    expect: 'needs_change',
                    why: 'Survey responses are HubSpot feedback submissions, another object the integration does not offer.',
                },
                {
                    id: 'DB-04.5',
                    title: 'SLA progress',
                    detail: 'tickets that are overdue, due soon or active against time-to-close and first/next response SLAs',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; once offered this is a filtered list on the SLA status properties.',
                },
                {
                    id: 'DB-04.6',
                    title: 'Time to close SLA completion over time',
                    detail: 'tickets closed on time versus out of SLA per period',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; on-time versus late per period would be Count calls per period and SLA status.',
                },
                {
                    id: 'DB-04.7',
                    title: 'First response SLA completion over time',
                    detail: 'tickets first responded to on time versus late per period',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; same shape as the time-to-close SLA tile, on the first-response SLA status.',
                },
                {
                    id: 'DB-04.8',
                    title: 'Tickets created over time',
                    detail: 'new tickets per period',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; new tickets per period would be one Count call per period.',
                },
                {
                    id: 'DB-04.9',
                    title: 'Tickets by channel',
                    detail: "today's and all open tickets by channel",
                    expect: 'needs_change',
                    why: 'Tickets are not offered; by channel is one Count call per channel value.',
                },
                {
                    id: 'DB-04.10',
                    title: 'Tickets by priority',
                    detail: 'tickets opened today and total open tickets by priority',
                    expect: 'needs_change',
                    why: 'Tickets are not offered; by priority is one Count call per priority value.',
                },
            ],
        },
    ],
};
