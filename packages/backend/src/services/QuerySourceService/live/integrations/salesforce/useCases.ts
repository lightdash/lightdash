// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const salesforceUseCases: LiveUseCases = {
    questions: [
        {
            id: 'SFD-01',
            question:
                'What is our open pipeline amount and expected revenue by opportunity stage?',
            expect: 'answer',
            why: 'Salesforce totals this itself: one SOQL call groups open opportunities by stage with the sum of Amount and of Expected Revenue.',
        },
        {
            id: 'SFD-02',
            question:
                'How has our open pipeline changed since the first day of the quarter: which opportunities had their amount, stage or close date changed?',
            expect: 'needs_change',
            why: 'Changes to amount, stage and close date are stored in the OpportunityHistory object, which SOQL can query, but a source can only read Opportunity, Account, Lead or Contact.',
        },
        {
            id: 'SFD-03',
            question:
                'How many days do opportunities spend in each stage on average, and where do they move backwards to an earlier stage?',
            expect: 'needs_change',
            why: 'Time in each stage and backward moves come from consecutive OpportunityHistory rows, an object the integration does not offer. Once offered, the rows are read as a list and DuckDB window functions compute durations, since SOQL has no date arithmetic.',
        },
        {
            id: 'SFD-04',
            question:
                'Which open opportunities have sat in their current stage longer than our allowed number of days, and how much amount is tied up per owner?',
            expect: 'answer',
            why: 'Opportunity has a standard last-stage-change date, and the integration pushes AND/OR and empty-value filters, sorts and sums to Salesforce, so one call lists the stuck open opportunities and another totals Amount per owner name.',
        },
        {
            id: 'SFD-05',
            question:
                'From which stage do opportunities most often drop straight to closed-lost?',
            expect: 'needs_change',
            why: 'The stage an opportunity was in just before Closed Lost is only in OpportunityHistory, which is not an offered object.',
        },
        {
            id: 'SFD-06',
            question:
                'Who are the top reps this quarter by won revenue, with their win rate, average deal size and days to close?',
            expect: 'answer',
            why: 'Won revenue, counts and average deal size per owner name are one totalled SOQL call, and win rate is a ratio in a DuckDB step. Days to close needs created and close dates per record, which Salesforce cannot subtract in a total, so those records are read and averaged locally.',
            tags: ['capped'],
        },
        {
            id: 'SFD-07',
            question:
                "How do each sales manager's teams compare this quarter on bookings, pipeline created, losses and win rate?",
            expect: 'needs_change',
            why: "Bookings, pipeline created, losses and win rate per owner are one call each, but the owner's manager or role is not offered: lookups add only the name of the linked record, and User is not an offered object.",
        },
        {
            id: 'SFD-08',
            question:
                'How has the average number of days from opportunity creation to close trended by quarter, for new business versus existing business?',
            expect: 'answer',
            why: 'SOQL cannot subtract two dates inside a total, so the agent reads closed opportunities (type, created date, close date) and DuckDB averages the days per quarter and type.',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'SFD-09',
            question:
                'How is each rep tracking against quota this quarter, and what is their gap to quota after counting commit forecast?',
            expect: 'needs_change',
            why: 'Closed-won and commit amounts per owner are one totalled call, but quotas sit in the ForecastingQuota object, which is not one of the four offered objects. A quota table uploaded to Lightdash could be joined in the composer as a workaround.',
        },
        {
            id: 'SFD-10',
            question:
                'How has the committed forecast for this quarter moved week by week, and how does it compare with the same point last year?',
            expect: 'needs_change',
            why: 'Salesforce stores only the current forecast, so past weeks have to be rebuilt from OpportunityHistory (forecast category, amount and close date at each change), which is not an offered object. Manager adjustments to the forecast are not in that history at all.',
        },
        {
            id: 'SFD-11',
            question:
                'How do bookings this quarter compare with last quarter, in amount and in number of deals?',
            expect: 'answer',
            why: 'One call returns won amount and count grouped by close-date quarter for the two quarters; the built-in period-over-period feature is refused, but the two rows are the comparison and a DuckDB step can add the change.',
        },
        {
            id: 'SFD-12',
            question:
                'How many calls, emails and meetings did each account executive log last week, and how many meetings did they book?',
            expect: 'needs_change',
            why: 'Calls, emails and meetings are Task and Event records, and a source can only read Opportunity, Account, Lead or Contact.',
        },
        {
            id: 'SFD-13',
            question:
                'How do leads created, leads converted, tasks completed and opportunities created trend day by day, and is there a day-of-week pattern?',
            expect: 'needs_change',
            why: 'Leads created, leads converted and opportunities created per day are one totalled call each on their own source, and DuckDB lines the days up and derives day of week. Tasks completed are missing because Task is not an offered object.',
        },
        {
            id: 'SFD-14',
            question:
                'How much closed-won revenue came from each lead source this year, and which sources convert best?',
            expect: 'answer',
            why: "One call groups this year's closed opportunities by lead source and won flag with sum of Amount and count; a DuckDB step turns that into revenue and win rate per source.",
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'SFD-15',
            question:
                'Which campaigns delivered the highest ROI and the lowest cost per won opportunity?',
            expect: 'needs_change',
            why: "Won amount per primary campaign name is available from Opportunity today, but campaign cost, and Salesforce's own campaign roll-ups of won amount and won count, are fields of the Campaign object, which is not offered.",
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'SFD-16',
            question:
                'What share of new leads get converted, broken down by lead source and lead owner?',
            expect: 'answer',
            why: 'One call on the Lead source counts leads by lead source, owner name and converted flag; a DuckDB step computes the share.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'SFD-17',
            question:
                'Of the opportunities created in each quarter, what share has been won, lost or is still open today?',
            expect: 'answer',
            why: 'One call counts opportunities by created quarter, closed flag and won flag; a DuckDB step turns the counts into shares.',
        },
        {
            id: 'SFD-18',
            question:
                'Which products are most often sold together on the same won opportunity?',
            expect: 'needs_change',
            why: 'Products on an opportunity are OpportunityLineItem records, which are not offered. Once offered, pairing products needs a self-join that only DuckDB can do, over listed line items.',
        },
        {
            id: 'SFD-19',
            question:
                'What stage is a named opportunity in, what is its next step and close date, and who owns it?',
            expect: 'answer',
            why: 'A name filter on the Opportunity source returns the stage, next step, close date, owner name and account name in one call.',
        },
        {
            id: 'SFD-20',
            question:
                'What is our win rate by account industry, region and opportunity type over the last 12 months?',
            expect: 'answer',
            why: "Win rate by opportunity type is one call, but industry and region are Account fields and the Opportunity explore offers only the account's name, so the answer needs a DuckDB join of an Opportunity source and an Account source, which fits only while all accounts fit in one read. Adding Account.Industry and Account.BillingCountry as lookup fields would make it one call at any size.",
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
                    expect: 'needs_change',
                    why: 'Closed won is one total, but quota sits in the ForecastingQuota object, which is not one of the four offered objects.',
                },
                {
                    id: 'DB-05.2',
                    title: 'Quota remaining',
                    detail: 'quota minus closed won',
                    expect: 'needs_change',
                    why: 'Needs quota from ForecastingQuota, which is not offered.',
                },
                {
                    id: 'DB-05.3',
                    title: 'Pipe coverage',
                    detail: 'open pipeline versus remaining quota',
                    expect: 'needs_change',
                    why: 'Open pipeline is one total, but remaining quota needs ForecastingQuota, which is not offered.',
                },
                {
                    id: 'DB-05.4',
                    title: 'Forecast',
                    detail: 'forecast amount by forecast category',
                    expect: 'answer',
                    why: 'One SOQL total of Amount grouped by forecast category for the period.',
                },
                {
                    id: 'DB-05.5',
                    title: 'Forecast vs last week',
                    detail: "this week's forecast compared with last week's",
                    expect: 'needs_change',
                    why: "Last week's forecast has to be rebuilt from OpportunityHistory, which is not an offered object.",
                },
                {
                    id: 'DB-05.6',
                    title: 'Top products',
                    detail: 'products ranked by forecast or won amount',
                    expect: 'needs_change',
                    why: 'Products are OpportunityLineItem records, which are not offered.',
                },
                {
                    id: 'DB-05.7',
                    title: 'Opportunity amount by stage',
                    detail: 'open opportunity amount grouped by stage',
                    expect: 'answer',
                    why: 'One SOQL total of Amount grouped by stage for open opportunities.',
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
                    expect: 'answer',
                    why: 'One SOQL total of Amount by owner name and won flag for closed opportunities.',
                },
                {
                    id: 'DB-06.2',
                    title: 'Won vs lost opportunities',
                    detail: 'count of won and lost opportunities per rep',
                    expect: 'answer',
                    why: 'One SOQL count by owner name and won flag.',
                },
                {
                    id: 'DB-06.3',
                    title: 'Win rate',
                    detail: 'share of opportunities closed won',
                    expect: 'answer',
                    why: 'One SOQL count by won flag; the ratio is a DuckDB step because table calculations are refused on live explores.',
                },
                {
                    id: 'DB-06.4',
                    title: 'Top performers',
                    detail: 'reps ranked by won amount',
                    expect: 'answer',
                    why: 'One SOQL total of won Amount by owner name, sorted by Salesforce.',
                },
                {
                    id: 'DB-06.5',
                    title: 'Sales pipeline by stage',
                    detail: 'open opportunities by sales funnel stage',
                    expect: 'answer',
                    why: 'One SOQL count of open opportunities by stage.',
                },
                {
                    id: 'DB-06.6',
                    title: 'Opportunity stage breakdown',
                    detail: 'opportunity count and amount per stage',
                    expect: 'answer',
                    why: 'One SOQL total with count and Amount by stage.',
                },
                {
                    id: 'DB-06.7',
                    title: 'Performance by deal type',
                    detail: 'closed deals by opportunity type',
                    expect: 'answer',
                    why: 'One SOQL total of closed opportunities by type.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-06.8',
                    title: 'Won amount by opportunity type',
                    detail: 'won amount split by opportunity type',
                    expect: 'answer',
                    why: 'One SOQL total of won Amount by type.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-06.9',
                    title: 'Won opportunities by size',
                    detail: 'won opportunities bucketed by amount',
                    expect: 'answer',
                    why: 'Amount is offered only as a metric, not as a field to filter or bucket by, so won opportunities are totalled per record (1,999 rows at most per query) and bucketed in DuckDB; past that the query is refused with a clear message.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-06.10',
                    title: 'Closed tasks and task overview',
                    detail: 'tasks closed per rep and open task status',
                    expect: 'needs_change',
                    why: 'Tasks are not one of the four offered objects.',
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
                    expect: 'needs_change',
                    why: 'Days in each stage come from OpportunityHistory, which is not an offered object.',
                },
                {
                    id: 'DB-07.2',
                    title: 'Opportunity movement from a selected stage',
                    detail: 'where opportunities go next from a chosen stage, including won and lost counts',
                    expect: 'needs_change',
                    why: 'Where opportunities go next from a stage needs consecutive OpportunityHistory rows, which are not offered; a sankey also needs a custom chart type.',
                },
                {
                    id: 'DB-07.3',
                    title: 'Neglected opportunities',
                    detail: 'open opportunities with no recent activity',
                    expect: 'answer',
                    why: 'A list of open opportunities filtered on last activity date (older than N days or empty), pushed to Salesforce; the field starts hidden and must be switched on.',
                },
                {
                    id: 'DB-07.4',
                    title: 'Stalled opportunities',
                    detail: 'open opportunities more than 30 days in one stage',
                    expect: 'answer',
                    why: 'A list of open opportunities filtered on the standard last stage change date.',
                },
                {
                    id: 'DB-07.5',
                    title: 'Pushed opportunities',
                    detail: 'count of opportunities whose close date was pushed',
                    expect: 'answer',
                    why: 'Pushed close dates are in OpportunityHistory (previous and new close date), which is not offered; orgs that have the PushCount field on Opportunity could count today.',
                },
                {
                    id: 'DB-07.6',
                    title: 'Deals overview',
                    detail: 'opportunities with close date, forecast category, amount, account and time in stages',
                    expect: 'needs_change',
                    why: 'Close date, forecast category, amount and account name list today, but time in stages needs OpportunityHistory.',
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
                    expect: 'needs_change',
                    why: 'Campaign cost and its won-amount roll-ups are fields of the Campaign object, which is not offered.',
                },
                {
                    id: 'DB-08.2',
                    title: 'Converted leads by month',
                    detail: 'leads converted per month',
                    expect: 'answer',
                    why: 'One SOQL count of converted leads by converted-date month.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.3',
                    title: 'Lead trending',
                    detail: 'lead status counts by month',
                    expect: 'answer',
                    why: 'One SOQL count by created month and current lead status (status as it is now, not as it was each month).',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.4',
                    title: 'Top marketing channels',
                    detail: 'channels ranked by leads generated',
                    expect: 'answer',
                    why: 'One SOQL count by lead source, sorted by Salesforce.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-08.5',
                    title: 'Leads by campaign, industry and source',
                    detail: 'lead counts broken down by campaign, industry and lead source',
                    expect: 'needs_change',
                    why: 'Leads by industry and source are one count, but by campaign needs CampaignMember, which is not offered.',
                },
                {
                    id: 'DB-08.6',
                    title: 'Lead conversion summary',
                    detail: 'leads, converted leads and opportunity amount converted',
                    expect: 'answer',
                    why: 'Lead and converted-lead counts are exact; the converted opportunity amount needs a DuckDB join of converted leads (opportunity id) to an Opportunity source, both read as rows.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-08.7',
                    title: 'Conversion rate',
                    detail: 'share of leads converted',
                    expect: 'answer',
                    why: 'One SOQL count by converted flag; the ratio is a DuckDB step.',
                    tags: ['unverified', 'no_data'],
                },
            ],
        },
    ],
};
