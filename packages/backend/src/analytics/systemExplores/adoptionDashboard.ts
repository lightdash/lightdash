import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
    UnitOfTime,
} from '@lightdash/common';
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
            description:
                'Distinct identified people with recorded activity in each period. Includes activity attributed to users by background work; this is not a login count or the share of people with access.',
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
            'Recorded activity by person and week. A missing name is retained separately by user identity. Recent activity is not evidence of a recent login.',
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
            'Distinct people and recorded dashboard views. Repeat fetches can add views; visits served entirely from the browser cache are not captured. Viewer counts overlap between dashboards.',
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
        name: 'Which apps are people loading?',
        description:
            'Recorded app loads from standalone pages, dashboards and charts. Reloads and creators using their own apps count. Builder previews, embeds, deliveries and older loads with unknown context are excluded. Loads do not confirm successful rendering or readership.',
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
        name: 'Apps created each week',
        description:
            'Distinct apps with a recorded creation event each week. Creating an app does not mean it has been shared or read. Earlier creation history may be unavailable.',
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
        name: 'Who is creating apps?',
        description:
            'Creators and apps from recorded creation events, grouped by week. Names reflect the latest available lookup. Iterations and reads are excluded.',
        explore: 'data_app_events',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_app_name',
            'data_app_events_event_ts_week',
            'data_app_events_user_id',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_unique_apps'],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.created'],
            },
        ],
        limit: 100,
        sorts: [{ fieldId: 'data_app_events_event_ts_week', descending: true }],
        fieldLabels: {
            data_app_events_unique_apps: 'Apps created',
            data_app_events_event_ts_week: 'Creation week',
            data_app_events_user_name: 'Creator',
            data_app_events_app_name: 'App',
        },
    },
    {
        key: 'adoption-app-reader-trend',
        name: 'App loads and viewers each day',
        description:
            'Recorded loads and distinct identified viewers from standalone pages, dashboards and charts each day. Includes reloads. Older loads with unknown context are shown separately in the surface breakdown. Viewer counts cannot be summed across days.',
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
        name: 'Who loads each app?',
        description:
            'People loading apps from standalone pages, dashboards and charts, grouped by app and week. Includes reloads and creators viewing their own apps. The same person can appear across apps and weeks; do not sum rows to count distinct people.',
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
        name: 'Where are apps being loaded?',
        description:
            'All recorded app loads by surface, including builder previews, embeds, deliveries and older loads with unknown context. Embed viewers are unidentified. Historical unknown context cannot separate viewers from embed token issuers. Apps with no captured loads are absent.',
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
        name: 'Observed app errors each day',
        description:
            'Distinct app navigations with an HTML delivery failure or an observed runtime error each day, across all surfaces. An app can appear in both series. Missing SDK signals are unknown, not evidence of an error.',
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
        name: 'App outcomes by app and surface',
        description:
            'Observed HTML delivery, SDK startup and runtime errors, deduplicated by app navigation. Includes builder previews, embeds and deliveries. Captured signals include repeats and observations that cannot be linked to a navigation; missing SDK signals remain unknown.',
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
        name: 'Ask AI questions each day',
        description:
            'Captured prompts submitted to the AI agent in the web app, including follow-ups and requests still pending or failed. Excludes Slack and embedded requests; one question can cause several AI calls.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_requested_at_day'],
        metrics: ['agent_requests_total_requests'],
        filters: askAi,
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ],
        visualization: 'line',
        fieldLabels: { agent_requests_total_requests: 'Questions' },
    },
    {
        key: 'adoption-ask-ai-people',
        name: 'People asking AI each week',
        description:
            'Distinct identified people submitting web-app AI agent prompts each week. Using other AI-powered features does not count here.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_requested_at_week'],
        metrics: ['agent_requests_distinct_requesters'],
        filters: askAi,
        limit: 5000,
        sorts: [
            { fieldId: 'agent_requests_requested_at_week', descending: false },
        ],
        visualization: 'line',
        fieldLabels: {
            agent_requests_distinct_requesters: 'People asking questions',
        },
    },
    {
        key: 'adoption-ask-ai-frequency',
        name: 'Questions per active AI user each day',
        description:
            'Questions from identified web-app requesters divided by the distinct people asking that day. People who asked nothing are outside this average. No activity is not shown as a zero-person average.',
        explore: 'agent_requests',
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
                displayName: 'Questions per active person',
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
        fieldLabels: { questions_per_person: 'Questions per active person' },
    },
    {
        key: 'adoption-ask-ai-users',
        name: 'Who is asking AI?',
        description:
            'People ranked by captured web-app AI agent questions. Missing names remain separate by identity; this does not count app building or background AI calls.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_user_name', 'agent_requests_user_id'],
        metrics: ['agent_requests_total_requests'],
        filters: askAi,
        limit: 50,
        sorts: [{ fieldId: 'agent_requests_total_requests', descending: true }],
        fieldLabels: { agent_requests_total_requests: 'Questions asked' },
    },
    {
        key: 'adoption-ask-ai-agents',
        name: 'Which agents are people asking?',
        description:
            'Web-app questions and distinct requesters for each AI agent. People can use several agents, so audiences overlap.',
        explore: 'agent_requests',
        dimensions: ['agent_requests_agent_name', 'agent_requests_agent_id'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_distinct_requesters',
        ],
        filters: askAi,
        limit: 30,
        sorts: [{ fieldId: 'agent_requests_total_requests', descending: true }],
        fieldLabels: {
            agent_requests_total_requests: 'Questions asked',
            agent_requests_distinct_requesters: 'People asking',
        },
    },
];

export const adoptionDashboardSpec: UsageDashboardSpec = {
    key: dashboardKey,
    name: 'Adoption',
    description:
        'See who is active, which apps and dashboards people use, and how Ask AI use develops. Updated nightly; charts use available captured history.',
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
                label: 'App',
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
                adoptionChartSpecs.map(({ key, explore }) => [
                    `${dashboardKey}-${key}`,
                    explore === 'data_app_outcomes'
                        ? filter.target
                        : (false as const),
                ]),
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
                {
                    title: 'What are people using?',
                    description:
                        'Dashboard viewers and app loads are shown separately because they measure different activity. Their audiences overlap; do not add them together.',
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
                    title: 'Who is creating apps?',
                    description:
                        'Recorded app creation and the people behind it. Creation does not mean an app is ready or shared.',
                    charts: ['adoption-apps-created', 'adoption-app-creators'],
                },
                {
                    title: 'Who is loading apps, and where?',
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
            name: 'App outcomes',
            sections: [
                {
                    title: 'Are apps loading reliably?',
                    description:
                        'Technical observations across all surfaces, including previews, embeds and deliveries. SDK startup does not confirm complete rendering or readership. Older bundles may have no SDK signals. Counts are per navigation, not people; daily counts should not be summed to deduplicate a longer period.',
                    charts: [
                        'adoption-app-outcome-trend',
                        'adoption-app-outcome-detail',
                    ],
                },
            ],
        },
        {
            key: 'ask-ai',
            name: 'Ask AI',
            sections: [
                {
                    title: 'Are people asking more questions?',
                    description:
                        'Questions sent to the AI agent in the web app, including follow-ups. These charts exclude Slack, embeds, app-building conversations and underlying AI calls.',
                    charts: [
                        'adoption-ask-ai-questions',
                        'adoption-ask-ai-people',
                        'adoption-ask-ai-frequency',
                    ],
                },
                {
                    title: 'Who is using Ask AI?',
                    description:
                        'Named people and agents make it easier to see where usage is growing. Missing names do not necessarily mean anonymous use.',
                    charts: ['adoption-ask-ai-users', 'adoption-ask-ai-agents'],
                },
            ],
        },
    ],
};
