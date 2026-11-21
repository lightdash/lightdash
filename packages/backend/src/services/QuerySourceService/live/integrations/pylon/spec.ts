// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const pylonSpec: LiveIntegrationSpec = {
    level: 2,
    auth: {
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        oauthReview: null,
    },
    api: {
        description:
            'Pylon REST API (issue search with filters, accounts), with an API key.',
        serverSideTotals:
            'No. Filtered search returns records; totals are computed locally.',
        vendorLimit:
            '120 calls a minute per search endpoint, per workspace; no limit on calls at once.',
        paging: '1,000 records a page, up to 10 pages, plus name lookups (up to 23 calls a query).',
        whyOurLimits:
            'A query can make 23 calls, so 2 at a time keeps a busy dashboard under 120 a minute.',
    },
    questions: [
        {
            id: 'PYL-01',
            question:
                'How many support issues were created versus closed each week over the last quarter?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'PYL-02',
            question:
                'How has our open issue backlog changed week by week over the last 12 weeks, split by status?',
            expect: 'api_cant',
        },
        {
            id: 'PYL-03',
            question:
                'How many issues were open on the first day of last quarter, by assignee and channel?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'PYL-04',
            question:
                'What percentage of issues breached their first response, next response and resolution SLAs last month?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-05',
            question:
                'Which issues breached an SLA this week, and which accounts were they for?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-06',
            question:
                'What were our median and 90th-percentile first response times each week, counted in business hours?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-07',
            question:
                'What are the median and 90th-percentile business-hours resolution times for issues closed this quarter, by priority?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-08',
            question:
                'How many open and resolved issues does each support engineer have this month, and what are their median response time and SLA breach rate?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-09',
            question:
                'Which 10 accounts raised the most issues this quarter, and how long did theirs take to resolve on average?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'PYL-10',
            question:
                'Which accounts opened noticeably more issues in the last 30 days than in the 30 days before?',
            expect: 'answer',
            tags: ['capped'],
        },
        {
            id: 'PYL-11',
            question:
                'What share of the issues we closed last quarter were later reopened, by tag?',
            expect: 'needs_change',
        },
        {
            id: 'PYL-12',
            question:
                'How have our average CSAT score and survey response rate changed month over month this year?',
            expect: 'api_cant',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'PYL-13',
            question:
                'Of the issues closed last month, how many were sent a CSAT survey, how many customers responded, and how many rated us good?',
            expect: 'api_cant',
        },
        {
            id: 'PYL-14',
            question:
                'How long do issues typically sit in each status (new, waiting on us, waiting on customer, on hold) before they are closed?',
            expect: 'api_cant',
        },
        {
            id: 'PYL-15',
            question:
                'For the Acme account, how many issues have we closed, what is their average satisfaction rating and what is our median first response time?',
            expect: 'answer',
            tags: ['unverified', 'no_data', 'capped'],
        },
        {
            id: 'PYL-16',
            question: 'Which tags drove the most support issues this quarter?',
            expect: 'answer',
            tags: ['unverified', 'no_data', 'capped'],
        },
    ],
    dashboards: [
        {
            id: 'DB-35',
            name: 'Support overview',
            charts: [
                {
                    id: 'DB-35.1',
                    title: 'Issues created, solved and unsolved',
                    detail: 'three totals for the selected period',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.2',
                    title: 'Issue volume over time',
                    detail: 'issues created and closed per week',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.3',
                    title: 'Issues by source',
                    detail: 'issue count by channel (Slack, email, chat and others)',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.4',
                    title: 'Issues by tag',
                    detail: 'issue count by tag',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-35.5',
                    title: 'Issues by hour of day and day of week',
                    detail: 'issue count by hour created and by weekday',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-35.6',
                    title: 'Median response and resolution time',
                    detail: 'median time to first response and time to resolution',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.7',
                    title: 'Reopened tickets',
                    detail: 'count of issues reopened in the period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-35.8',
                    title: 'Mean number of touches per issue',
                    detail: 'average touches per issue, by source',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-35.9',
                    title: 'Median time in each status',
                    detail: 'median time issues spend in each status, per week',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-35.10',
                    title: 'Top accounts by issue count',
                    detail: 'per account: open, closed and total issues, average resolution time, touches',
                    expect: 'answer',
                    tags: ['capped'],
                },
            ],
        },
        {
            id: 'DB-36',
            name: 'SLA and response times',
            charts: [
                {
                    id: 'DB-36.1',
                    title: 'SLA achievement rate',
                    detail: 'share of SLA targets met in the period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.2',
                    title: 'SLA breached tickets and active breached tickets',
                    detail: 'count of issues that breached, and of open issues currently in breach',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.3',
                    title: 'Percent issues with first response, resolution and next response time breach',
                    detail: 'breach rate by SLA type',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.4',
                    title: 'Achieved vs breached over time',
                    detail: 'SLA targets achieved and breached per period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.5',
                    title: 'SLA breach rate by hour of day and day of week',
                    detail: 'breach rate by hour and weekday',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.6',
                    title: 'Business hours response and resolution time',
                    detail: 'business-hours time to first response and time to resolution per week',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-36.7',
                    title: 'First response time buckets',
                    detail: 'issue count by bucket: <1h, 1-4h, 4-8h, 8-24h, 1-3d, 3d+',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-36.8',
                    title: 'Resolution time buckets',
                    detail: 'issue count by the same time buckets',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-36.9',
                    title: 'SLA Breached Issues',
                    detail: 'each breached issue: created time, title, time to first response, resolution, next response, account',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-37',
            name: 'CSAT',
            charts: [
                {
                    id: 'DB-37.1',
                    title: 'Average CSAT score',
                    detail: 'average survey score in the period',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.2',
                    title: 'Satisfaction rate',
                    detail: 'share of responses that are good',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.3',
                    title: 'Survey response rate',
                    detail: 'responses divided by surveys sent',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-37.4',
                    title: 'Good and bad CSAT surveys',
                    detail: 'counts of good and bad responses',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.5',
                    title: 'Tickets vs surveys sent vs responses',
                    detail: 'issues, surveys sent and responses by issue creation week',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-37.6',
                    title: 'Survey feedback',
                    detail: 'responses by sentiment and whether written feedback was left',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-37.7',
                    title: 'Surveys submitted over time',
                    detail: 'survey responses per period',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.8',
                    title: 'Average score over time',
                    detail: 'average CSAT score per period',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.9',
                    title: 'CSAT score distribution',
                    detail: 'response count by score',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-37.10',
                    title: 'CSAT Issues',
                    detail: 'each rated issue: title, submission time, assignee, score, feedback, account',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-38',
            name: 'Agent performance',
            charts: [
                {
                    id: 'DB-38.1',
                    title: 'Teammate assignment to first response',
                    detail: 'time from assignment to first reply, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.2',
                    title: 'Teammate assignment to subsequent response',
                    detail: 'time from assignment to later replies, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.3',
                    title: 'Teammate handling time',
                    detail: 'handling time per conversation, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.4',
                    title: 'Teammate assignment to close',
                    detail: 'time from assignment to close, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.5',
                    title: 'Conversations assigned per active hour',
                    detail: 'assigned conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.6',
                    title: 'Conversations replied to per active hour',
                    detail: 'replied-to conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.7',
                    title: 'Conversations closed per active hour',
                    detail: 'closed conversations divided by active hours, per teammate',
                    expect: 'api_cant',
                },
                {
                    id: 'DB-38.8',
                    title: 'Teammate CSAT score',
                    detail: 'CSAT score per teammate',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-38.9',
                    title: 'Teammate conversation ratings',
                    detail: 'rating counts per teammate, by rating',
                    expect: 'answer',
                    tags: ['unverified', 'no_data', 'capped'],
                },
                {
                    id: 'DB-38.10',
                    title: 'Comparison of teammate performance',
                    detail: 'per teammate: conversations assigned, replied to, closed, SLA miss rate, replies sent, notes, mentions',
                    expect: 'needs_change',
                },
            ],
        },
    ],
};
