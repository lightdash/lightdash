// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const pylonUseCases: LiveUseCases = {
    questions: [
        {
            id: 'PYL-01',
            question:
                'How many support issues were created versus closed each week over the last quarter?',
            expect: 'answer',
            why: 'The issues explore has no count and no week grain, so the answer comes from reading every issue created (and, in a second node, resolved) in the quarter and counting by week in DuckDB. That is right while a quarter of issues fits in one read.',
            tags: ['capped'],
        },
        {
            id: 'PYL-02',
            question:
                'How has our open issue backlog changed week by week over the last 12 weeks, split by status?',
            expect: 'api_cant',
            why: "The total backlog per week can be rebuilt from created and resolved days (issues open now plus issues resolved in the last 12 weeks), but the split by status at each past week needs status history, and Pylon's API returns only today's status.",
        },
        {
            id: 'PYL-03',
            question:
                'How many issues were open on the first day of last quarter, by assignee and channel?',
            expect: 'answer',
            why: "Open on a past day can be rebuilt without history: issues created before that day that are still open, plus issues created before it and resolved after it. Both sets are small. Channel is exact; assignee is today's assignee, not who held the issue then.",
            tags: ['capped'],
        },
        {
            id: 'PYL-04',
            question:
                'What percentage of issues breached their first response, next response and resolution SLAs last month?',
            expect: 'needs_change',
            why: "The issues explore has no SLA fields. Pylon's issue search does return the SLA deadlines and completion times per issue, so adding them lets a composer query work out breach rates; next-response breaches are only known for the latest reply cycle.",
        },
        {
            id: 'PYL-05',
            question:
                'Which issues breached an SLA this week, and which accounts were they for?',
            expect: 'needs_change',
            why: 'A list of breached issues needs the SLA deadline fields, which the explore does not read. Account names are already available.',
        },
        {
            id: 'PYL-06',
            question:
                'What were our median and 90th-percentile first response times each week, counted in business hours?',
            expect: 'needs_change',
            why: 'First response time is offered in calendar minutes only. Pylon also returns the business-hours figure on each issue; once it is a field, a composer query reads the issues and takes the median and 90th percentile per week. The calendar-time version works today within the row cap.',
        },
        {
            id: 'PYL-07',
            question:
                'What are the median and 90th-percentile business-hours resolution times for issues closed this quarter, by priority?',
            expect: 'needs_change',
            why: 'Resolution time is offered in calendar hours only and priority (a custom field in Pylon) is not offered at all. Both come back on each issue from search, so adding them makes this a read-and-total composer query.',
        },
        {
            id: 'PYL-08',
            question:
                'How many open and resolved issues does each support engineer have this month, and what are their median response time and SLA breach rate?',
            expect: 'needs_change',
            why: "Open and resolved counts and median response time per engineer work today by reading the month's issues with assignee and totalling in DuckDB. The SLA breach rate is the missing part: the explore has no SLA fields.",
        },
        {
            id: 'PYL-09',
            question:
                'Which 10 accounts raised the most issues this quarter, and how long did theirs take to resolve on average?',
            expect: 'answer',
            why: "Read the quarter's issues with account name and resolution hours, then rank and average in DuckDB. Correct while the quarter's issues fit in one read; account names cost one extra call per 1,000 accounts.",
            tags: ['capped'],
        },
        {
            id: 'PYL-10',
            question:
                'Which accounts opened noticeably more issues in the last 30 days than in the 30 days before?',
            expect: 'answer',
            why: 'Period over period is refused on the explore, but a composer query reads 60 days of issues with account name and compares the two halves in DuckDB. Sixty days fits comfortably.',
            tags: ['capped'],
        },
        {
            id: 'PYL-11',
            question:
                'What share of the issues we closed last quarter were later reopened, by tag?',
            expect: 'needs_change',
            why: "The explore has no sign of reopening. Pylon returns each issue's first resolution time next to its latest one, so with that field a composer query can flag issues that were closed and then reopened and split them by tag. It gives reopened yes or no, not the number of reopens.",
        },
        {
            id: 'PYL-12',
            question:
                'How have our average CSAT score and survey response rate changed month over month this year?',
            expect: 'api_cant',
            why: 'Average score by month can be worked out from the score on each issue, though a year of issues is more than one read. The response rate needs the number of surveys sent, and no Pylon endpoint we could find reports sends.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'PYL-13',
            question:
                'Of the issues closed last month, how many were sent a CSAT survey, how many customers responded, and how many rated us good?',
            expect: 'api_cant',
            why: "Closed issues, issues with a rating and good ratings can be counted from the issues read. The 'survey sent' step has no data: Pylon's API shows responses, not sends.",
        },
        {
            id: 'PYL-14',
            question:
                'How long do issues typically sit in each status (new, waiting on us, waiting on customer, on hold) before they are closed?',
            expect: 'api_cant',
            why: "Time in each status needs every status change of every issue. Pylon's API returns only the current status and the first response and resolution times.",
        },
        {
            id: 'PYL-15',
            question:
                'For the Acme account, how many issues have we closed, what is their average satisfaction rating and what is our median first response time?',
            expect: 'answer',
            why: 'Filter issues to the one account over all time, read them (a few hundred rows) and total in DuckDB. Easily under the cap; the Created filter must be set wide or only the last 30 days are counted.',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'PYL-16',
            question: 'Which tags drove the most support issues this quarter?',
            expect: 'answer',
            why: "Tags come back as one comma-separated field per issue, so a composer query reads the quarter's issues, splits the tags and counts in DuckDB.",
            tags: ['unverified', 'no_data', 'capped'],
        },
    ],
    dashboards: [
        {
            id: 'DB-35',
            name: 'Support overview',
            purpose:
                'Weekly support review: how much is coming in, from where, how fast we answer and which accounts drive the load.',
            charts: [
                {
                    id: 'DB-35.1',
                    title: 'Issues created, solved and unsolved',
                    detail: 'three totals for the selected period',
                    expect: 'answer',
                    why: "Three totals counted in DuckDB from the issues read; 'solved' needs a wide Created filter or it only counts issues created in the last 30 days.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.2',
                    title: 'Issue volume over time',
                    detail: 'issues created and closed per week',
                    expect: 'answer',
                    why: 'Issues read and grouped by week in DuckDB; there is no count or week grain on the explore.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.3',
                    title: 'Issues by source',
                    detail: 'issue count by channel (Slack, email, chat and others)',
                    expect: 'answer',
                    why: 'Source is a field; the count per source is a DuckDB step over the issues read.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.4',
                    title: 'Issues by tag',
                    detail: 'issue count by tag',
                    expect: 'answer',
                    why: 'Tags are one comma-separated field, split and counted in DuckDB.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-35.5',
                    title: 'Issues by hour of day and day of week',
                    detail: 'issue count by hour created and by weekday',
                    expect: 'needs_change',
                    why: 'Weekday works from the created day, but hour of day does not: the integration cuts every timestamp to a day.',
                },
                {
                    id: 'DB-35.6',
                    title: 'Median response and resolution time',
                    detail: 'median time to first response and time to resolution',
                    expect: 'answer',
                    why: 'First response minutes and resolution hours are fields; the medians are DuckDB over the issues read (calendar time).',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.7',
                    title: 'Reopened tickets',
                    detail: 'count of issues reopened in the period',
                    expect: 'needs_change',
                    why: 'No reopen field is read. Pylon returns first resolution time, which shows that an issue was closed and reopened, but not when or how often.',
                },
                {
                    id: 'DB-35.8',
                    title: 'Mean number of touches per issue',
                    detail: 'average touches per issue, by source',
                    expect: 'answer',
                    why: 'Touches and source are fields; the average is a DuckDB step.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.9',
                    title: 'Median time in each status',
                    detail: 'median time issues spend in each status, per week',
                    expect: 'api_cant',
                    why: "Needs every status change of every issue; Pylon's API returns only the current status.",
                },
                {
                    id: 'DB-35.10',
                    title: 'Top accounts by issue count',
                    detail: 'per account: open, closed and total issues, average resolution time, touches',
                    expect: 'answer',
                    why: 'Account name, state, resolution hours and touches are fields; the per-account table is DuckDB over the issues read.',
                    tags: ['capped'],
                },
            ],
        },
        {
            id: 'DB-36',
            name: 'SLA and response times',
            purpose:
                'Check whether the team is meeting response and resolution targets and where and when breaches happen.',
            charts: [
                {
                    id: 'DB-36.1',
                    title: 'SLA achievement rate',
                    detail: 'share of SLA targets met in the period',
                    expect: 'needs_change',
                    why: 'No SLA fields on the explore; the search result carries SLA deadlines and completion times.',
                },
                {
                    id: 'DB-36.2',
                    title: 'SLA breached tickets and active breached tickets',
                    detail: 'count of issues that breached, and of open issues currently in breach',
                    expect: 'needs_change',
                    why: 'Breached and currently-breached issues need the SLA deadline fields.',
                },
                {
                    id: 'DB-36.3',
                    title: 'Percent issues with first response, resolution and next response time breach',
                    detail: 'breach rate by SLA type',
                    expect: 'needs_change',
                    why: 'Same missing SLA fields; next-response breaches are only known for the latest reply cycle.',
                },
                {
                    id: 'DB-36.4',
                    title: 'Achieved vs breached over time',
                    detail: 'SLA targets achieved and breached per period',
                    expect: 'needs_change',
                    why: 'Same missing SLA fields; the per-period split is then a DuckDB step.',
                },
                {
                    id: 'DB-36.5',
                    title: 'SLA breach rate by hour of day and day of week',
                    detail: 'breach rate by hour and weekday',
                    expect: 'needs_change',
                    why: 'Needs the SLA fields and the hour an issue was created; dates are cut to days today.',
                },
                {
                    id: 'DB-36.6',
                    title: 'Business hours response and resolution time',
                    detail: 'business-hours time to first response and time to resolution per week',
                    expect: 'needs_change',
                    why: 'Only calendar-time response and resolution are fields; Pylon returns the business-hours figures too.',
                },
                {
                    id: 'DB-36.7',
                    title: 'First response time buckets',
                    detail: 'issue count by bucket: <1h, 1-4h, 4-8h, 8-24h, 1-3d, 3d+',
                    expect: 'answer',
                    why: 'First response minutes is a field; the buckets are a DuckDB step over the issues read.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-36.8',
                    title: 'Resolution time buckets',
                    detail: 'issue count by the same time buckets',
                    expect: 'answer',
                    why: 'Resolution hours is a field; the buckets are a DuckDB step over the issues read.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-36.9',
                    title: 'SLA Breached Issues',
                    detail: 'each breached issue: created time, title, time to first response, resolution, next response, account',
                    expect: 'needs_change',
                    why: 'The list needs the SLA fields to pick breached issues and show their times; title, created day and account are there.',
                },
            ],
        },
        {
            id: 'DB-37',
            name: 'CSAT',
            purpose:
                'Track customer satisfaction with support and follow up on bad ratings.',
            charts: [
                {
                    id: 'DB-37.1',
                    title: 'Average CSAT score',
                    detail: 'average survey score in the period',
                    expect: 'answer',
                    why: 'The score sits on each issue; the average is DuckDB over the issues read, dated by the issue rather than the survey.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.2',
                    title: 'Satisfaction rate',
                    detail: 'share of responses that are good',
                    expect: 'answer',
                    why: 'Share of good scores is a DuckDB step over the issues read.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.3',
                    title: 'Survey response rate',
                    detail: 'responses divided by surveys sent',
                    expect: 'api_cant',
                    why: 'Needs the number of surveys sent; no Pylon endpoint we know of reports sends.',
                },
                {
                    id: 'DB-37.4',
                    title: 'Good and bad CSAT surveys',
                    detail: 'counts of good and bad responses',
                    expect: 'answer',
                    why: 'Good and bad counts from the score on each issue, in DuckDB.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.5',
                    title: 'Tickets vs surveys sent vs responses',
                    detail: 'issues, surveys sent and responses by issue creation week',
                    expect: 'api_cant',
                    why: 'Issues and responses per week work, but surveys sent has no data in the API.',
                },
                {
                    id: 'DB-37.6',
                    title: 'Survey feedback',
                    detail: 'responses by sentiment and whether written feedback was left',
                    expect: 'needs_change',
                    why: "The written comment that comes with a score is not read, so 'left feedback' cannot be shown.",
                },
                {
                    id: 'DB-37.7',
                    title: 'Surveys submitted over time',
                    detail: 'survey responses per period',
                    expect: 'answer',
                    why: "Rated issues counted per period in DuckDB, by the issue's day, not the day the survey was submitted.",
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.8',
                    title: 'Average score over time',
                    detail: 'average CSAT score per period',
                    expect: 'answer',
                    why: 'Average score per period in DuckDB, dated by the issue.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.9',
                    title: 'CSAT score distribution',
                    detail: 'response count by score',
                    expect: 'answer',
                    why: 'Count per score value in DuckDB.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.10',
                    title: 'CSAT Issues',
                    detail: 'each rated issue: title, submission time, assignee, score, feedback, account',
                    expect: 'needs_change',
                    why: 'Title, assignee, score and account are fields, but feedback text and submission time are not, and score cannot be filtered, so all issues are read and filtered in DuckDB.',
                },
            ],
        },
        {
            id: 'DB-38',
            name: 'Agent performance',
            purpose:
                "One-to-ones and staffing: compare each support engineer's speed, output and customer ratings.",
            charts: [
                {
                    id: 'DB-38.1',
                    title: 'Teammate assignment to first response',
                    detail: 'time from assignment to first reply, per teammate',
                    expect: 'api_cant',
                    why: "Pylon's API has no assignment time on an issue; only creation to first response is known.",
                },
                {
                    id: 'DB-38.2',
                    title: 'Teammate assignment to subsequent response',
                    detail: 'time from assignment to later replies, per teammate',
                    expect: 'api_cant',
                    why: 'Needs assignment time and every later reply; assignment time is not in the API.',
                },
                {
                    id: 'DB-38.3',
                    title: 'Teammate handling time',
                    detail: 'handling time per conversation, per teammate',
                    expect: 'api_cant',
                    why: "Handling time is not something Pylon's API reports.",
                },
                {
                    id: 'DB-38.4',
                    title: 'Teammate assignment to close',
                    detail: 'time from assignment to close, per teammate',
                    expect: 'api_cant',
                    why: 'Assignment time is not in the API; creation to resolution per assignee is the nearest available and works within the row cap.',
                },
                {
                    id: 'DB-38.5',
                    title: 'Conversations assigned per active hour',
                    detail: 'assigned conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                    why: "Active hours per teammate are not in Pylon's API.",
                },
                {
                    id: 'DB-38.6',
                    title: 'Conversations replied to per active hour',
                    detail: 'replied-to conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                    why: "Active hours per teammate are not in Pylon's API.",
                },
                {
                    id: 'DB-38.7',
                    title: 'Conversations closed per active hour',
                    detail: 'closed conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                    why: "Active hours per teammate are not in Pylon's API.",
                },
                {
                    id: 'DB-38.8',
                    title: 'Teammate CSAT score',
                    detail: 'CSAT score per teammate',
                    expect: 'answer',
                    why: 'Score and assignee are fields; the average per teammate is DuckDB over the issues read.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-38.9',
                    title: 'Teammate conversation ratings',
                    detail: 'rating counts per teammate, by rating',
                    expect: 'answer',
                    why: 'Count per score and assignee in DuckDB.',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-38.10',
                    title: 'Comparison of teammate performance',
                    detail: 'per teammate: conversations assigned, replied to, closed, SLA miss rate, replies sent, notes, mentions',
                    expect: 'needs_change',
                    why: "Assigned and closed counts work today, but replies sent, notes and mentions need every issue's messages and the SLA miss rate needs SLA fields.",
                },
            ],
        },
    ],
};
