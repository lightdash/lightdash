// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const pylonUseCases: LiveUseCases = {
    questions: [
        {
            id: 'PYL-01',
            question:
                'How many support issues were created versus closed each week over the last quarter?',
            possible: true,
        },
        {
            id: 'PYL-02',
            question:
                'How has our open issue backlog changed week by week over the last 12 weeks, split by status?',
            possible: false,
        },
        {
            id: 'PYL-03',
            question:
                'How many issues were open on the first day of last quarter, by assignee and channel?',
            possible: true,
        },
        {
            id: 'PYL-04',
            question:
                'What percentage of issues breached their first response, next response and resolution SLAs last month?',
            possible: false,
        },
        {
            id: 'PYL-05',
            question:
                'Which issues breached an SLA this week, and which accounts were they for?',
            possible: false,
        },
        {
            id: 'PYL-06',
            question:
                'What were our median and 90th-percentile first response times each week, counted in business hours?',
            possible: false,
        },
        {
            id: 'PYL-07',
            question:
                'What are the median and 90th-percentile business-hours resolution times for issues closed this quarter, by priority?',
            possible: false,
        },
        {
            id: 'PYL-08',
            question:
                'How many open and resolved issues does each support engineer have this month, and what are their median response time and SLA breach rate?',
            possible: false,
        },
        {
            id: 'PYL-09',
            question:
                'Which 10 accounts raised the most issues this quarter, and how long did theirs take to resolve on average?',
            possible: true,
        },
        {
            id: 'PYL-10',
            question:
                'Which accounts opened noticeably more issues in the last 30 days than in the 30 days before?',
            possible: true,
        },
        {
            id: 'PYL-11',
            question:
                'What share of the issues we closed last quarter were later reopened, by tag?',
            possible: false,
        },
        {
            id: 'PYL-12',
            question:
                'How have our average CSAT score and survey response rate changed month over month this year?',
            possible: false,
        },
        {
            id: 'PYL-13',
            question:
                'Of the issues closed last month, how many were sent a CSAT survey, how many customers responded, and how many rated us good?',
            possible: false,
        },
        {
            id: 'PYL-14',
            question:
                'How long do issues typically sit in each status (new, waiting on us, waiting on customer, on hold) before they are closed?',
            possible: false,
        },
        {
            id: 'PYL-15',
            question:
                'For the Acme account, how many issues have we closed, what is their average satisfaction rating and what is our median first response time?',
            possible: true,
        },
        {
            id: 'PYL-16',
            question: 'Which tags drove the most support issues this quarter?',
            possible: true,
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
                    possible: true,
                },
                {
                    id: 'DB-35.2',
                    title: 'Issue volume over time',
                    detail: 'issues created and closed per week',
                    possible: true,
                },
                {
                    id: 'DB-35.3',
                    title: 'Issues by source',
                    detail: 'issue count by channel (Slack, email, chat and others)',
                    possible: true,
                },
                {
                    id: 'DB-35.4',
                    title: 'Issues by tag',
                    detail: 'issue count by tag',
                    possible: true,
                },
                {
                    id: 'DB-35.5',
                    title: 'Issues by hour of day and day of week',
                    detail: 'issue count by hour created and by weekday',
                    possible: false,
                },
                {
                    id: 'DB-35.6',
                    title: 'Median response and resolution time',
                    detail: 'median time to first response and time to resolution',
                    possible: true,
                },
                {
                    id: 'DB-35.7',
                    title: 'Reopened tickets',
                    detail: 'count of issues reopened in the period',
                    possible: false,
                },
                {
                    id: 'DB-35.8',
                    title: 'Mean number of touches per issue',
                    detail: 'average touches per issue, by source',
                    possible: true,
                },
                {
                    id: 'DB-35.9',
                    title: 'Median time in each status',
                    detail: 'median time issues spend in each status, per week',
                    possible: false,
                },
                {
                    id: 'DB-35.10',
                    title: 'Top accounts by issue count',
                    detail: 'per account: open, closed and total issues, average resolution time, touches',
                    possible: true,
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
                    possible: false,
                },
                {
                    id: 'DB-36.2',
                    title: 'SLA breached tickets and active breached tickets',
                    detail: 'count of issues that breached, and of open issues currently in breach',
                    possible: false,
                },
                {
                    id: 'DB-36.3',
                    title: 'Percent issues with first response, resolution and next response time breach',
                    detail: 'breach rate by SLA type',
                    possible: false,
                },
                {
                    id: 'DB-36.4',
                    title: 'Achieved vs breached over time',
                    detail: 'SLA targets achieved and breached per period',
                    possible: false,
                },
                {
                    id: 'DB-36.5',
                    title: 'SLA breach rate by hour of day and day of week',
                    detail: 'breach rate by hour and weekday',
                    possible: false,
                },
                {
                    id: 'DB-36.6',
                    title: 'Business hours response and resolution time',
                    detail: 'business-hours time to first response and time to resolution per week',
                    possible: false,
                },
                {
                    id: 'DB-36.7',
                    title: 'First response time buckets',
                    detail: 'issue count by bucket: <1h, 1-4h, 4-8h, 8-24h, 1-3d, 3d+',
                    possible: true,
                },
                {
                    id: 'DB-36.8',
                    title: 'Resolution time buckets',
                    detail: 'issue count by the same time buckets',
                    possible: true,
                },
                {
                    id: 'DB-36.9',
                    title: 'SLA Breached Issues',
                    detail: 'each breached issue: created time, title, time to first response, resolution, next response, account',
                    possible: false,
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
                    possible: true,
                },
                {
                    id: 'DB-37.2',
                    title: 'Satisfaction rate',
                    detail: 'share of responses that are good',
                    possible: true,
                },
                {
                    id: 'DB-37.3',
                    title: 'Survey response rate',
                    detail: 'responses divided by surveys sent',
                    possible: false,
                },
                {
                    id: 'DB-37.4',
                    title: 'Good and bad CSAT surveys',
                    detail: 'counts of good and bad responses',
                    possible: true,
                },
                {
                    id: 'DB-37.5',
                    title: 'Tickets vs surveys sent vs responses',
                    detail: 'issues, surveys sent and responses by issue creation week',
                    possible: false,
                },
                {
                    id: 'DB-37.6',
                    title: 'Survey feedback',
                    detail: 'responses by sentiment and whether written feedback was left',
                    possible: false,
                },
                {
                    id: 'DB-37.7',
                    title: 'Surveys submitted over time',
                    detail: 'survey responses per period',
                    possible: true,
                },
                {
                    id: 'DB-37.8',
                    title: 'Average score over time',
                    detail: 'average CSAT score per period',
                    possible: true,
                },
                {
                    id: 'DB-37.9',
                    title: 'CSAT score distribution',
                    detail: 'response count by score',
                    possible: true,
                },
                {
                    id: 'DB-37.10',
                    title: 'CSAT Issues',
                    detail: 'each rated issue: title, submission time, assignee, score, feedback, account',
                    possible: false,
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
                    possible: false,
                },
                {
                    id: 'DB-38.2',
                    title: 'Teammate assignment to subsequent response',
                    detail: 'time from assignment to later replies, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.3',
                    title: 'Teammate handling time',
                    detail: 'handling time per conversation, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.4',
                    title: 'Teammate assignment to close',
                    detail: 'time from assignment to close, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.5',
                    title: 'Conversations assigned per active hour',
                    detail: 'assigned conversations divided by active hours, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.6',
                    title: 'Conversations replied to per active hour',
                    detail: 'replied-to conversations divided by active hours, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.7',
                    title: 'Conversations closed per active hour',
                    detail: 'closed conversations divided by active hours, per teammate',
                    possible: false,
                },
                {
                    id: 'DB-38.8',
                    title: 'Teammate CSAT score',
                    detail: 'CSAT score per teammate',
                    possible: true,
                },
                {
                    id: 'DB-38.9',
                    title: 'Teammate conversation ratings',
                    detail: 'rating counts per teammate, by rating',
                    possible: true,
                },
                {
                    id: 'DB-38.10',
                    title: 'Comparison of teammate performance',
                    detail: 'per teammate: conversations assigned, replied to, closed, SLA miss rate, replies sent, notes, mentions',
                    possible: false,
                },
            ],
        },
    ],
};
