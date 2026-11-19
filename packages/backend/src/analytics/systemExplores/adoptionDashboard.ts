import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
    UnitOfTime,
} from '@lightdash/common';
import {
    peopleNoActivityChartSpecs,
    peopleNoActivitySections,
} from './peopleNoActivityCharts';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const appViewingSurfaces: NonNullable<UsageChartSpec['filters']> = [
    {
        field: 'data_app_reach_view_context',
        values: ['standalone', 'dashboard', 'chart'],
    },
];
const askAi: NonNullable<UsageChartSpec['filters']> = [
    { field: 'agent_requests_surface', values: ['web_app'] },
];
const dashboardKey = 'lightdash-analytics-adoption';

export const adoptionChartSpecs: UsageChartSpec[] = [
    ...(['day', 'week'] as const).map(
        (period): UsageChartSpec => ({
            key: `adoption-active-people-${period}`,
            name:
                period === 'day'
                    ? 'Daily active people'
                    : 'Weekly active people',
            description: `Distinct identified people with recorded activity each ${period}. Includes activity that background work attributed to a person. This is not a count of logins or the share of people with access.`,
            explore: 'user_activity',
            dimensions: [`user_activity_activity_date_${period}`],
            metrics: ['user_activity_unique_users'],
            limit: 5000,
            sorts: [
                {
                    fieldId: `user_activity_activity_date_${period}`,
                    descending: false,
                },
            ],
            visualization: 'line',
            fieldLabels: { user_activity_unique_users: 'Active people' },
        }),
    ),
    {
        key: 'adoption-people-history',
        name: 'Who is active, and when?',
        description:
            'Recorded activity by person and week. Recent activity does not mean a recent login.',
        explore: 'user_activity',
        dimensions: [
            'user_activity_user_name',
            'user_activity_user_id',
            'user_activity_activity_date_week',
        ],
        metrics: ['user_activity_total_events'],
        limit: 100,
        sorts: [
            { fieldId: 'user_activity_activity_date_week', descending: true },
        ],
        fieldLabels: {
            user_activity_total_events: 'Recorded activities',
            user_activity_activity_date_week: 'Week',
            user_activity_user_name: 'Person',
        },
    },
    {
        key: 'adoption-dashboard-audience',
        name: 'Which dashboards are people viewing?',
        description:
            'Distinct viewers and recorded views for each dashboard. Reloads can add views. Views served entirely from the browser cache are not counted. One person can view several dashboards, so viewer counts overlap.',
        explore: 'content_reach',
        dimensions: [
            'content_reach_content_name',
            'content_reach_project_name',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_qualifying_views',
            'content_reach_last_viewed_at',
        ],
        filters: [
            { field: 'content_reach_content_type', values: ['dashboard'] },
        ],
        limit: 30,
        sorts: [
            { fieldId: 'content_reach_distinct_viewers', descending: true },
        ],
        fieldLabels: {
            content_reach_content_name: 'Dashboard',
            content_reach_project_name: 'Project',
            content_reach_last_viewed_at: 'Last recorded view',
            content_reach_distinct_viewers: 'People viewing',
            content_reach_qualifying_views: 'Recorded views',
        },
    },
    {
        key: 'adoption-app-audience',
        name: 'Which data apps are people loading?',
        description:
            'Recorded data app loads from standalone pages, dashboards and charts. Reloads count, and so do creators using their own apps. Builder previews, embeds, deliveries and older loads with unknown context are left out. A load does not confirm the app rendered or was read.',
        explore: 'data_app_reach',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_project_name',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
        ],
        metrics: [
            'data_app_reach_distinct_viewers',
            'data_app_reach_total_loads',
            'data_app_reach_last_loaded_at',
        ],
        filters: appViewingSurfaces,
        limit: 30,
        sorts: [
            { fieldId: 'data_app_reach_distinct_viewers', descending: true },
        ],
        fieldLabels: {
            data_app_reach_distinct_viewers: 'Identified viewers',
            data_app_reach_total_loads: 'App loads',
            data_app_reach_last_loaded_at: 'Last app load',
        },
    },
    {
        key: 'adoption-apps-created',
        name: 'Data apps created by week',
        description:
            'Distinct data apps created each week. Older creation history may be missing.',
        explore: 'data_app_events',
        dimensions: ['data_app_events_event_ts_week'],
        metrics: ['data_app_events_unique_apps'],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.created'],
            },
        ],
        limit: 5000,
        sorts: [
            { fieldId: 'data_app_events_event_ts_week', descending: false },
        ],
        visualization: 'bar',
        fieldLabels: {
            data_app_events_unique_apps: 'Apps created',
            data_app_events_event_ts_week: 'Creation week',
        },
    },
    {
        key: 'adoption-app-creators',
        name: 'Who is creating data apps?',
        description:
            'People who created data apps, and the apps they created, by week. Names are the latest available. Iterations and loads are not counted.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_app_name',
            'data_app_events_event_ts_week',
            'data_app_events_user_id',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: [],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.created'],
            },
        ],
        limit: 100,
        sorts: [{ fieldId: 'data_app_events_event_ts_week', descending: true }],
        fieldLabels: {
            data_app_events_event_ts_week: 'Creation week',
            data_app_events_user_name: 'Creator',
            data_app_events_app_name: 'App',
        },
    },
    {
        key: 'adoption-app-reader-trend',
        name: 'Data app loads and viewers by day',
        description:
            'Loads and distinct identified viewers per day, from standalone pages, dashboards and charts. Older loads with unknown context appear in the surface breakdown instead. Daily viewer counts cannot be added up across days.',
        explore: 'data_app_reach',
        dimensions: ['data_app_reach_event_ts_day'],
        metrics: [
            'data_app_reach_distinct_viewers',
            'data_app_reach_total_loads',
        ],
        filters: appViewingSurfaces,
        limit: 5000,
        sorts: [{ fieldId: 'data_app_reach_event_ts_day', descending: false }],
        visualization: 'line',
        fieldLabels: {
            data_app_reach_distinct_viewers: 'Identified viewers',
            data_app_reach_total_loads: 'App loads',
        },
    },
    {
        key: 'adoption-app-reader-detail',
        name: 'Who loads each data app?',
        description:
            'People who loaded data apps from standalone pages, dashboards and charts, by app and week. Creators loading their own apps count. The same person can appear for several apps and weeks, so rows cannot be added up to count people.',
        explore: 'data_app_reach',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_user_name',
            'data_app_reach_event_ts_week',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
            'data_app_reach_user_id',
        ],
        metrics: [
            'data_app_reach_total_loads',
            'data_app_reach_last_loaded_at',
        ],
        filters: appViewingSurfaces,
        limit: 100,
        sorts: [
            { fieldId: 'data_app_reach_event_ts_week', descending: true },
            { fieldId: 'data_app_reach_total_loads', descending: true },
        ],
        fieldLabels: {
            data_app_reach_total_loads: 'App loads',
            data_app_reach_last_loaded_at: 'Last app load',
            data_app_reach_event_ts_week: 'Week',
        },
    },
    {
        key: 'adoption-app-first-audience',
        name: 'Where are data apps being loaded?',
        description:
            'All recorded data app loads by surface, including builder previews, embeds, deliveries and older loads with unknown context. Viewers of embeds are not identified. For older loads with unknown context, viewers cannot be told apart from embed token issuers. Apps with no recorded loads are not shown.',
        explore: 'data_app_reach',
        dimensions: ['data_app_reach_view_context'],
        metrics: [
            'data_app_reach_total_loads',
            'data_app_reach_distinct_viewers',
        ],
        limit: 100,
        sorts: [{ fieldId: 'data_app_reach_total_loads', descending: true }],
        fieldLabels: {
            data_app_reach_view_context: 'Surface',
            data_app_reach_total_loads: 'App loads',
            data_app_reach_distinct_viewers: 'Identified viewers',
        },
    },
    {
        key: 'adoption-app-outcome-trend',
        name: 'Data app errors by day',
        description:
            'Distinct data app navigations each day with an HTML delivery failure or a runtime error, on all surfaces. A navigation with both kinds of error is counted in both series.',
        explore: 'data_app_outcomes',
        dimensions: ['data_app_outcomes_event_ts_day'],
        metrics: [
            'data_app_outcomes_html_error',
            'data_app_outcomes_runtime_error',
        ],
        limit: 5000,
        sorts: [
            { fieldId: 'data_app_outcomes_event_ts_day', descending: false },
        ],
        visualization: 'line',
        fieldLabels: {
            data_app_outcomes_html_error: 'HTML delivery failures',
            data_app_outcomes_runtime_error: 'Runtime errors observed',
        },
    },
    {
        key: 'adoption-app-outcome-detail',
        name: 'Data app outcomes by app and surface',
        description:
            'HTML delivery, SDK startup and runtime errors for each data app and surface, each counted once per navigation. Includes builder previews, embeds and deliveries. The Captured signals column is a raw count: it includes repeated signals and signals with no navigation ID.',
        explore: 'data_app_outcomes',
        dimensions: [
            'data_app_outcomes_app_name',
            'data_app_outcomes_project_name',
            'data_app_outcomes_view_context',
            'data_app_outcomes_app_id',
            'data_app_outcomes_project_id',
        ],
        metrics: [
            'data_app_outcomes_html_loaded',
            'data_app_outcomes_sdk_started',
            'data_app_outcomes_html_error',
            'data_app_outcomes_runtime_error',
            'data_app_outcomes_total_signals',
        ],
        limit: 100,
        sorts: [
            { fieldId: 'data_app_outcomes_html_error', descending: true },
            { fieldId: 'data_app_outcomes_runtime_error', descending: true },
            { fieldId: 'data_app_outcomes_app_name', descending: false },
        ],
        fieldLabels: {
            data_app_outcomes_app_name: 'App',
            data_app_outcomes_project_name: 'Project',
            data_app_outcomes_view_context: 'Surface',
            data_app_outcomes_html_loaded: 'HTML delivered',
            data_app_outcomes_sdk_started: 'SDK startup observed',
            data_app_outcomes_html_error: 'HTML delivery failures',
            data_app_outcomes_runtime_error: 'Runtime errors observed',
            data_app_outcomes_total_signals: 'Captured signals',
        },
    },
    {
        key: 'adoption-ask-ai-questions',
        name: 'Agent requests in the web app by day',
        description:
            'Requests sent to agents in the web app, including follow-ups and requests that are pending or failed. One request can make several AI calls.',
        explore: 'agent_request_starts',
        dimensions: ['agent_requests_requested_at_day'],
        metrics: ['agent_requests_total_requests'],
        filters: askAi,
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        visualization: 'line',
        fieldLabels: { agent_requests_total_requests: 'Agent requests' },
    },
    {
        key: 'adoption-ask-ai-people',
        name: 'People asking agents in the web app by week',
        description:
            'Distinct identified people who sent an agent request in the web app each week. Using other AI features does not count.',
        explore: 'agent_request_starts',
        dimensions: ['agent_requests_requested_at_week'],
        metrics: ['agent_requests_distinct_requesters'],
        filters: askAi,
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_week', descending: false },
        ],
        visualization: 'line',
        fieldLabels: {
            agent_requests_distinct_requesters: 'People asking agents',
        },
    },
    {
        key: 'adoption-ask-ai-frequency',
        name: 'Agent requests per person asking, by day',
        description:
            'Agent requests from identified people in the web app, divided by the number of people who asked that day. People who asked nothing are not in the average. Days with no requests show no value, not zero.',
        explore: 'agent_request_starts',
        dimensions: ['agent_requests_requested_at_day'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_distinct_requesters',
        ],
        filters: [
            ...askAi,
            {
                field: 'agent_requests_user_id',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        tableCalculations: [
            {
                name: 'questions_per_person',
                displayName: 'Agent requests per person asking',
                type: TableCalculationType.NUMBER,
                sql: '1.0 * ${agent_requests.total_requests} / NULLIF(${agent_requests.distinct_requesters}, 0)',
                format: { type: CustomFormatType.NUMBER, round: 1 },
            },
        ],
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        visualization: 'line',
        yFields: ['questions_per_person'],
        fieldLabels: {
            questions_per_person: 'Agent requests per person asking',
        },
    },
    {
        key: 'adoption-ask-ai-users',
        name: 'Who is asking agents?',
        description: 'People ranked by agent requests in the web app.',
        explore: 'agent_request_starts',
        dimensions: ['agent_requests_user_name', 'agent_requests_user_id'],
        metrics: ['agent_requests_total_requests'],
        filters: askAi,
        limit: 50,
        sorts: [{ fieldId: 'agent_requests_total_requests', descending: true }],
        fieldLabels: { agent_requests_total_requests: 'Agent requests' },
    },
    {
        key: 'adoption-ask-ai-agents',
        name: 'Which agents are people asking?',
        description:
            'Agent requests in the web app and distinct people asking, for each agent. One person can use several agents, so the people counts overlap.',
        explore: 'agent_request_starts',
        dimensions: ['agent_requests_agent_name', 'agent_requests_agent_id'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_distinct_requesters',
        ],
        filters: askAi,
        limit: 30,
        sorts: [{ fieldId: 'agent_requests_total_requests', descending: true }],
        fieldLabels: {
            agent_requests_total_requests: 'Agent requests',
            agent_requests_distinct_requesters: 'People asking',
        },
    },
];

export const adoptionDashboardSpec: UsageDashboardSpec = {
    key: dashboardKey,
    name: 'Adoption',
    description:
        'Active people, dashboard and data app use, and agent requests.',
    filters: {
        dimensions: [
            {
                label: 'Date',
                target: {
                    fieldId: 'data_app_outcomes_event_ts_day',
                    tableName: 'data_app_outcomes',
                },
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days },
            },
            {
                label: 'Data app',
                target: {
                    fieldId: 'data_app_outcomes_app_name',
                    tableName: 'data_app_outcomes',
                },
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            },
            {
                label: 'Surface',
                target: {
                    fieldId: 'data_app_outcomes_view_context',
                    tableName: 'data_app_outcomes',
                },
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            },
        ].map((filter) => ({
            ...filter,
            tileTargets: Object.fromEntries(
                [...adoptionChartSpecs, ...peopleNoActivityChartSpecs].map(
                    ({ key, explore }) => [
                        `${dashboardKey}-${key}`,
                        explore === 'data_app_outcomes'
                            ? filter.target
                            : (false as const),
                    ],
                ),
            ),
        })),
        metrics: [],
        tableCalculations: [],
    },
    tabs: [
        {
            key: 'people-content',
            name: 'People & content',
            sections: [
                {
                    title: 'Are more people using Lightdash?',
                    description:
                        'Distinct people with recorded activity, counted separately each day and week. Weekly counts are not sums of daily counts.',
                    charts: [
                        'adoption-active-people-day',
                        'adoption-active-people-week',
                        'adoption-people-history',
                    ],
                },
                ...peopleNoActivitySections,
                {
                    title: 'What are people using?',
                    description:
                        'Dashboard viewers and data app loads are shown separately because they measure different activity. Their audiences overlap; do not add them together.',
                    charts: [
                        'adoption-dashboard-audience',
                        'adoption-app-audience',
                    ],
                },
            ],
        },
        {
            key: 'data-apps',
            name: 'Data apps',
            sections: [
                {
                    title: 'Who is creating data apps?',
                    description:
                        'Recorded data app creation and the people behind it. Creation does not mean an app is ready or shared.',
                    charts: ['adoption-apps-created', 'adoption-app-creators'],
                },
                {
                    title: 'Who is loading data apps, and where?',
                    description:
                        'Trends and named viewers cover standalone pages, dashboards and charts. The surface breakdown also includes builder previews, embeds, deliveries and unknown context. Loads include reloads and do not prove readership.',
                    charts: [
                        'adoption-app-reader-trend',
                        'adoption-app-reader-detail',
                        'adoption-app-first-audience',
                    ],
                },
            ],
        },
        {
            key: 'app-outcomes',
            name: 'Data app outcomes',
            sections: [
                {
                    title: 'Are data apps loading reliably?',
                    description:
                        'Technical signals from every surface, including previews, embeds and deliveries. SDK startup does not confirm the app rendered fully or was read. Older app bundles may send no SDK signals: that is unknown, not an error. Counts are per navigation, not per person. A navigation is one load of an app page. Daily counts cannot be added up to get a deduplicated count for a longer period. The Date, Data app and Surface filters change only the tiles on this tab.',
                    charts: [
                        'adoption-app-outcome-trend',
                        'adoption-app-outcome-detail',
                    ],
                },
            ],
        },
        {
            key: 'ask-ai',
            name: 'Agents',
            sections: [
                {
                    title: 'Are people sending more agent requests?',
                    description:
                        'Agent requests sent in the web app, including follow-ups. These charts exclude Slack, embeds, conversations that build data apps and the AI calls behind each request.',
                    charts: [
                        'adoption-ask-ai-questions',
                        'adoption-ask-ai-people',
                        'adoption-ask-ai-frequency',
                    ],
                },
                {
                    title: 'Who is using agents?',
                    description:
                        'Agent requests by person and by agent. A missing name does not necessarily mean anonymous use.',
                    charts: ['adoption-ask-ai-users', 'adoption-ask-ai-agents'],
                },
            ],
        },
    ],
};
