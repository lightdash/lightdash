import { FilterOperator } from '@lightdash/common';
import { peopleNoActivitySections } from './peopleNoActivityCharts';
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
                        title: 'Observed request activity',
                        caption: true,
                        description:
                            'Requests by agent, person and day. This is not the share of eligible people who use agents, and it does not compare with external assistants. Shows the selected period. Activity before recording began can be missing.',
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
                        description: 'Requests by agent and day.',
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
                        description: 'Requests by person and agent.',
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
                            "Outcomes show whether a request finished technically, not whether the answer solved the person's problem. Pending and unknown outcomes are shown. A request counts once, however many steps the agent takes.",
                        charts: [
                            'agent-requests-and-completion-by-day',
                            'agent-request-outcomes',
                        ],
                        layout: 'row',
                        rowHeight: 8,
                    },
                    {
                        title: 'Feedback coverage',
                        caption: true,
                        description:
                            'Read ratings together with how many requests were rated and how many have a known outcome. Unrated requests are not positive feedback. Small samples are not reliable rankings.',
                        charts: ['agent-feedback-rating-and-sample-coverage'],
                    },
                ],
            },
            {
                key: 'consumption',
                name: 'Retries & tokens',
                sections: [
                    {
                        title: 'Retries',
                        caption: true,
                        description:
                            'Requests and average request latency by retry count. The exact tokens added by each attempt are not recorded.',
                        charts: ['agent-retries-latency-and-consumption'],
                        layout: 'row',
                        rowHeight: 7,
                    },
                    {
                        title: 'AI consumption',
                        caption: true,
                        description:
                            'Tokens by person and model, and by feature and model. Tokens are not cost. Team history, model pricing and spend on external assistants are not included. Shows the selected period. Activity before recording began can be missing.',
                        charts: [
                            'ai-consumption-by-person-feature-and-model',
                            'ai-tokens-by-feature-and-model',
                        ],
                        layout: 'row',
                        rowHeight: 8,
                    },
                    {
                        title: 'Consumption by outcome',
                        caption: true,
                        description:
                            'Tokens linked to requests, by technical outcome. Some AI calls cannot be linked to a request. Do not read that as zero tokens.',
                        charts: ['request-consumption-by-outcome-and-feedback'],
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
                        noteHeight: 3,
                        description:
                            'Last 12 completed calendar months (UTC). The current month is left out. Each change compares a month with the month before. ∅ means there is no data for the month before, or it was zero. Months with no data are left out, and history can be incomplete. Missing history is not zero activity. The date filter does not change these two tiles.',
                        charts: [
                            'querying-users-month-over-month',
                            'queries-run-month-over-month',
                        ],
                    },
                ],
            },
            {
                key: 'latency',
                name: 'Response time & failures',
                sections: [
                    {
                        title: 'Response latency',
                        caption: true,
                        description:
                            'P95 response time is the time the backend took to respond. It does not include rendering in the browser. Older queries can have no timing: blank means unknown, not instant. Shows the selected period. Activity before recording began can be missing.',
                        charts: ['slow-dashboards-tail-latency-and-demand'],
                        layout: 'row',
                        rowHeight: 9,
                    },
                    {
                        title: 'Failures',
                        description:
                            'Ranked by users affected and failure count. Error messages and causes are not shown here; investigate them separately.',
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
                            'Queries by origin, by who or what started them, and by context, where recorded. Origin is the kind of work, such as interactive, scheduled or app. Context is where the query was run from, such as a dashboard or an Explore. Older queries with unknown values are still shown. Shows the selected period. Activity before recording began can be missing.',
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
                            'Fields (metrics and dimensions) used by queries, including in filters and sorting. Each query counts once per field, including cached and failed queries. One query can use several fields, so counts overlap. A field missing here is not proof it is unused. Names are those recorded when the query ran, so a renamed field can appear more than once.',
                        charts: ['most-used-fields-cloud', 'most-used-fields'],
                    },
                    {
                        title: 'People and content',
                        description:
                            'See who uses each field, and which charts, dashboards or apps the queries came from. Rows with no name or no linked content are still shown.',
                        charts: ['people-using-fields', 'content-using-fields'],
                    },
                    {
                        title: 'Queries with field details',
                        description:
                            'Captured: the fields a query used were recorded. Partial: some of them could not be recorded. Unavailable: includes SQL queries. Not captured: includes older history. Recording starts once the feature is enabled and deployed. This is not a complete list of fields.',
                        charts: ['field-capture-coverage'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-people',
        name: 'People',
        description: 'Active people, returning people and channels.',
        tabs: [
            {
                key: 'activity',
                name: 'Activity',
                sections: [
                    {
                        title: 'Active people',
                        description:
                            "People with any recorded activity. Includes scheduled deliveries and other automated runs in the person's name. This does not include everyone with access, and it does not separate business users from the data team. Shows the selected period. Activity before recording began can be missing.",
                        charts: [
                            'observed-active-people',
                            'daily-observed-active-people',
                            'power-users-queries-ai-and-exports',
                        ],
                    },
                ],
            },
            {
                key: 'returning',
                name: 'Returning & inactive people',
                sections: [
                    ...peopleNoActivitySections,
                    {
                        title: 'Activity over time',
                        description:
                            "Any recorded activity, week by week, is a rough sign of people returning. Includes scheduled deliveries and other automated runs in the person's name. This is not a full retention cohort or a history of who was eligible in each period. Shows the selected period. Activity before recording began can be missing.",
                        charts: ['observed-activity-by-person-and-week'],
                    },
                ],
            },
            {
                key: 'channels',
                name: 'Channels & history',
                sections: [
                    {
                        title: 'Google Sheets',
                        description:
                            'Queries run through the Google Sheets integration. This does not count everyone who reads the spreadsheet.',
                        charts: ['google-sheets-query-audience'],
                    },
                    {
                        title: 'Activity history',
                        description:
                            'Recent recorded activity by person and project. This does not show past access or group membership.',
                        charts: [
                            'observed-history-stable-user-and-project-uuids',
                        ],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-content',
        name: 'Content',
        description: 'Content viewers, ownership and inventory.',
        tabs: [
            {
                key: 'audience',
                name: 'Audience & trust',
                sections: [
                    {
                        title: 'Content audience',
                        description:
                            'People who viewed content, alongside recorded views. Reloads can add views. Views served entirely from the browser cache are not counted. Shows the selected period. Activity before recording began can be missing.',
                        charts: [
                            'content-reach-distinct-people-not-just-views',
                            'who-visited-which-dashboard',
                        ],
                    },
                    {
                        title: 'Verified content',
                        description:
                            'Distinct viewers of verified content, divided by viewers of content whose verification status is known. A viewer can also view unverified content. Content with unknown verification status is left out.',
                        charts: ['verified-content-audience-share'],
                    },
                ],
            },
            {
                key: 'adoption',
                name: 'Creation & adoption',
                sections: [
                    {
                        title: 'New content',
                        description:
                            'People who viewed content in its first seven days and came back after those seven days are used as a sign of adoption. Older content may have been created before recording began. Counts include deleted items unless you filter them out.',
                        charts: [
                            'new-content-adoption-creation-week-proxy',
                            'content-creation-by-month',
                        ],
                    },
                ],
            },
            {
                key: 'health',
                name: 'Activity & dependencies',
                sections: [
                    {
                        title: 'Content review',
                        description:
                            'No observed activity is not proof that an item is safe to delete. Known dependencies cover current dashboard tiles and enabled schedules, not every external use.',
                        charts: [
                            'review-candidates-activity-and-known-dependencies',
                        ],
                    },
                ],
            },
            {
                key: 'ownership',
                name: 'Ownership & compute',
                sections: [
                    {
                        title: 'Current ownership',
                        description:
                            'Owner status comes from current Lightdash membership, not employment records. Content with a missing or inactive owner needs review. Schedule ownership is not fully recorded.',
                        charts: ['content-ownership-current-snapshot'],
                    },
                    {
                        title: 'Audience and execution time',
                        description:
                            'Warehouse execution time stands in for compute. It is not cost. The same execution time can be attributed to both a chart and a dashboard.',
                        charts: [
                            'high-compute-dashboards-audience-versus-warehouse-time',
                        ],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-apps',
        name: 'Apps',
        description: 'App usage, audiences and generation activity.',
        tabs: [
            {
                key: 'usage',
                name: 'App usage',
                sections: [
                    {
                        title: 'Observed app use',
                        description:
                            'Recorded app loads, including reloads. Viewer counts exclude anonymous visitors, and preview activity may be incomplete. Shows the selected period. Unknown or removed apps are included.',
                        charts: [
                            'total-loads',
                            'distinct-viewers',
                            'viewed-apps',
                        ],
                    },
                    {
                        title: 'Daily activity',
                        description:
                            'Daily viewer counts cannot be added up across days.',
                        charts: ['daily-trend'],
                    },
                    {
                        title: 'Popular apps',
                        description:
                            'Most-used apps and their projects. Unknown or removed apps remain in totals.',
                        charts: ['top-apps'],
                    },
                ],
            },
            {
                key: 'people',
                name: 'People',
                sections: [
                    {
                        title: 'App audiences',
                        description:
                            'See who uses each app, how often they load it and how many apps they use.',
                        charts: ['top-people', 'user-app-detail'],
                    },
                ],
            },
            {
                key: 'builders',
                name: 'Builders & AI',
                sections: [
                    {
                        title: 'Build activity',
                        description:
                            'Apps created and iterated on, by builder and week. Uploads and views are not counted.',
                        charts: [
                            'data-app-builders-creation-and-iterations-by-week',
                        ],
                    },
                    {
                        title: 'Tokens for app generation',
                        description:
                            'Tokens used to generate apps, by builder, week and model. Tokens are not cost. Tokens cannot yet be linked to individual apps or builds.',
                        charts: ['app-generation-consumption'],
                    },
                ],
            },
            {
                key: 'lifecycle',
                name: 'Lifecycle & adoption',
                sections: [
                    {
                        title: 'Audience and loads',
                        description:
                            'Loads and viewers show that apps are being used. They are not sessions, and not a complete picture of creators versus consumers.',
                        charts: ['apps-loads-and-observed-viewers'],
                    },
                    {
                        title: 'Builds and loads',
                        description:
                            'Builds and loads are a rough sign of adoption. How many previews get published, and the history of build versions, are not yet recorded.',
                        charts: ['app-lifecycle-build-activity-versus-loads'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-tools',
        name: 'Tools & operations',
        description: 'MCP tool usage, exports and outcomes.',
        tabs: [
            {
                key: 'mcp',
                name: 'MCP tools',
                sections: [
                    {
                        title: 'Tool usage',
                        description:
                            'Tool calls by user, client and tool, including service accounts. Error rates leave out calls whose outcome is unknown.',
                        charts: ['mcp-users-clients-tools-and-error-rates'],
                    },
                ],
            },
            {
                key: 'exports',
                name: 'Exports',
                sections: [
                    {
                        title: 'Export activity',
                        description:
                            'Recorded downloads, with who downloaded and the content it came from where known. This does not show who received the file afterwards or how it was used.',
                        charts: ['export-audit-actor-content-and-outcome'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-agent-evaluations',
        name: 'Agent evaluations',
        description: 'Evaluation quality over time, by agent and evaluation.',
        filters: {
            dimensions: [
                { label: 'Agent', fieldId: 'agent_evaluation_runs_agent_name' },
                {
                    label: 'Evaluation',
                    fieldId: 'agent_evaluation_runs_evaluation_name',
                },
            ].map(({ label, fieldId }) => ({
                label,
                target: { fieldId, tableName: 'agent_evaluation_runs' },
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            })),
            metrics: [],
            tableCalculations: [],
        },
        tabs: [
            {
                key: 'quality',
                name: 'Evaluation quality',
                sections: [
                    {
                        title: 'Assessment trends',
                        description:
                            'Filter by agent or evaluation to track quality across runs. Pass rate uses all assessments, not all prompts. Runs still in progress, unassessed results and execution errors do not count as failed assessments.',
                        charts: [
                            'assessment-pass-rate-by-day',
                            'assessment-volume-by-day',
                        ],
                    },
                    {
                        title: 'Results by evaluation and run',
                        description:
                            'Compare evaluations and inspect individual runs. Results reflect the latest nightly refresh and may change if evaluation history is removed.',
                        charts: [
                            'quality-by-evaluation',
                            'recent-evaluation-runs',
                        ],
                    },
                ],
            },
        ],
    },
];
