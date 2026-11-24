import { FilterOperator } from '@lightdash/common';
import type { UsageDashboardSpec } from './usageDashboardTypes';

export const usageDashboardSpecs: UsageDashboardSpec[] = [
    {
        key: 'lightdash-analytics-overview',
        name: 'Agents & AI',
        description: 'Agent adoption, request outcomes and token use.',
        tabs: [
            {
                key: 'adoption',
                name: 'Agent adoption',
                sections: [
                    {
                        title: 'Request activity',
                        caption: true,
                        description:
                            'Agent requests and the people who sent them.',
                        charts: [
                            'agent-requests-trend',
                            'agent-requesters-trend',
                        ],
                        layout: 'row',
                        rowHeight: 4,
                    },
                    {
                        title: 'Requests by agent',
                        caption: true,
                        description: 'Which agents are used most, day by day.',
                        charts: ['agent-requests-by-agent-and-day'],
                        layout: 'row',
                        rowHeight: 7,
                    },
                    {
                        title: 'Daily requests per agent',
                        caption: true,
                        description:
                            'One row per agent, each on its own scale.',
                        charts: ['agent-daily-requests-per-agent'],
                        layout: 'row',
                        // Fits seven or eight agent rows of about 70 to 90px.
                        rowHeight: 14,
                    },
                    {
                        title: 'Requests by person',
                        caption: true,
                        description:
                            'Who is asking, and which agents they use.',
                        charts: ['agent-adoption-by-week'],
                    },
                ],
            },
            {
                key: 'outcomes',
                name: 'Outcomes & feedback',
                sections: [
                    {
                        title: 'Technical outcomes',
                        caption: true,
                        description:
                            'Outcomes show whether a request finished, which is a technical result. Pending and unknown outcomes are included.',
                        charts: [
                            'agent-requests-and-completion-by-day',
                            'agent-request-outcomes',
                        ],
                        layout: 'row',
                        rowHeight: 8,
                    },
                    {
                        title: 'Feedback',
                        caption: true,
                        description:
                            'Unrated requests are not positive feedback. Small samples are not reliable rankings.',
                        charts: ['agent-feedback-rating-and-sample-coverage'],
                    },
                ],
            },
            {
                key: 'consumption',
                name: 'Retries & tokens',
                sections: [
                    {
                        title: 'AI consumption',
                        caption: true,
                        description:
                            'Tokens by person and model, and by feature and model. Tokens are not cost.',
                        charts: [
                            'ai-consumption-by-person-feature-and-model',
                            'ai-tokens-by-feature-and-model',
                        ],
                        layout: 'row',
                        rowHeight: 8,
                    },
                    {
                        title: 'Failed requests and retries',
                        caption: true,
                        description:
                            'Tokens spent on agent requests that failed or were cancelled, next to requests and average latency by retry count. Each retry runs the request again with new AI calls, so a request with more retries takes longer and uses more tokens.',
                        charts: [
                            'request-consumption-by-outcome-and-feedback',
                            'agent-retries-latency-and-consumption',
                        ],
                        layout: 'row',
                        widths: [12, 24],
                        rowHeight: 6,
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-query-activity',
        name: 'Queries',
        description: 'Query volume, performance and cache usage.',
        tabs: [
            {
                key: 'monthly-comparison',
                name: 'Monthly comparison',
                sections: [
                    {
                        title: 'How is query usage changing?',
                        description:
                            'Up to the last 12 completed calendar months (UTC), each compared with the month before. The date filter does not change these two tiles.',
                        charts: [
                            'querying-users-month-over-month',
                            'queries-run-month-over-month',
                        ],
                        // Side by side: the table is narrow and at most 12 rows long. A tile cannot grow
                        // with its rows, so this height shows about nine and scrolls for the rest
                        layout: 'row',
                        widths: [16, 20],
                        rowHeight: 7,
                    },
                ],
            },
            {
                key: 'latency',
                name: 'Response time & failures',
                sections: [
                    {
                        title: 'Which dashboards are slow or expensive?',
                        caption: true,
                        description:
                            'P95 response time is how long the backend took to respond, before the browser draws the result. Warehouse time is what the queries cost to run.',
                        charts: [
                            'slow-dashboards-tail-latency-and-demand',
                            'dashboards-warehouse-and-response-time',
                        ],
                        layout: 'row',
                        rowHeight: 9,
                    },
                    {
                        title: 'Failures',
                        description:
                            'Ranked by people affected and failure count. Error messages and causes are not shown here; investigate them separately.',
                        charts: ['query-failures-affected-people'],
                    },
                ],
            },
            {
                key: 'origins',
                name: 'Origins & caching',
                sections: [
                    {
                        title: 'Query origins',
                        description:
                            'Origin is the kind of work, such as interactive, scheduled or data app. Context is where the query was run from, such as a dashboard or an Explore.',
                        charts: ['query-origin-and-initiating-actor'],
                    },
                    {
                        title: 'Caching',
                        description:
                            'Compare queries run on the warehouse with queries served from the cache. Money saved by caching and warehouse cost are not recorded.',
                        charts: ['warehouse-versus-cached-demand'],
                    },
                ],
            },
            {
                key: 'fields',
                name: 'Metrics & dimensions',
                sections: [
                    {
                        title: 'Most-used fields',
                        caption: true,
                        description:
                            'Fields used by queries, including filters and sorting. A query counts once for each field it uses.',
                        charts: ['most-used-fields-cloud', 'most-used-fields'],
                    },
                    {
                        title: 'People and content',
                        description:
                            'See who uses each field, and which charts, dashboards or data apps the queries came from. Queries with no linked content are left out of the content table.',
                        charts: ['people-using-fields', 'content-using-fields'],
                    },
                    {
                        title: 'How complete these numbers are',
                        description:
                            'The tiles above count only queries with a recorded list of fields, so a low share here means they undercount. SQL queries and older queries have no list.',
                        charts: ['field-capture-coverage'],
                        // One number: a short tile, not a tall empty one
                        layout: 'row',
                        rowHeight: 3,
                    },
                ],
            },
        ],
    },
];
