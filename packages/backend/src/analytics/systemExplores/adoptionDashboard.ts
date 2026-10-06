import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
} from '@lightdash/common';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const appReaders: NonNullable<UsageChartSpec['filters']> = [
    { field: 'data_app_reach_is_qualifying', values: [true] },
    { field: 'data_app_reach_is_builder', values: [false] },
];
const askAi: NonNullable<UsageChartSpec['filters']> = [
    { field: 'agent_requests_surface', values: ['web_app'] },
];

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
            'lightdash_users_name',
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
            lightdash_users_name: 'Person',
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
        name: 'Which apps are people reading?',
        description:
            'Identified readers other than the app creators and version authors. Includes recorded standalone and dashboard use with startup observed; excludes builder previews, reloads and reported runtime errors. Not proof that someone read every part of an app.',
        explore: 'data_app_reach',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_project_name',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
        ],
        metrics: [
            'data_app_reach_distinct_consumers',
            'data_app_reach_qualifying_views',
            'data_app_reach_last_viewed_at',
        ],
        filters: appReaders,
        limit: 30,
        sorts: [
            { fieldId: 'data_app_reach_distinct_consumers', descending: true },
        ],
        fieldLabels: {
            data_app_reach_distinct_consumers: 'Readers',
            data_app_reach_qualifying_views: 'Recorded reader views',
            data_app_reach_last_viewed_at: 'Last recorded read',
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
            'lightdash_users_name',
            'lightdash_apps_name',
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
            lightdash_users_name: 'Creator',
            lightdash_apps_name: 'App',
        },
    },
    {
        key: 'adoption-app-reader-trend',
        name: 'App readers and returning readers',
        description:
            'Distinct non-builder readers each day. Returning readers used the same app on a later UTC day than their first captured read; they are a subset of readers. Missing earlier history can understate returns.',
        explore: 'data_app_reach',
        dimensions: ['data_app_reach_event_ts_day'],
        metrics: [
            'data_app_reach_distinct_consumers',
            'data_app_reach_returning_consumers',
        ],
        filters: appReaders,
        limit: 5000,
        sorts: [{ fieldId: 'data_app_reach_event_ts_day', descending: false }],
        visualization: 'line',
        fieldLabels: {
            data_app_reach_distinct_consumers: 'Readers',
            data_app_reach_returning_consumers: 'Returning readers',
        },
    },
    {
        key: 'adoption-app-reader-detail',
        name: 'Who reads each app?',
        description:
            'Named non-builder readers by app and week, with their most recent captured read. The same person can appear across apps and weeks; do not add those rows to count distinct people.',
        explore: 'data_app_reach',
        dimensions: [
            'data_app_reach_app_name',
            'lightdash_users_name',
            'data_app_reach_event_ts_week',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
            'data_app_reach_user_id',
        ],
        metrics: [
            'data_app_reach_qualifying_views',
            'data_app_reach_last_viewed_at',
        ],
        filters: appReaders,
        limit: 100,
        sorts: [
            { fieldId: 'data_app_reach_event_ts_week', descending: true },
            { fieldId: 'data_app_reach_qualifying_views', descending: true },
        ],
        fieldLabels: {
            data_app_reach_qualifying_views: 'Recorded reader views',
            data_app_reach_last_viewed_at: 'Last recorded read',
            data_app_reach_event_ts_week: 'Week',
        },
    },
    {
        key: 'adoption-app-first-audience',
        name: 'Have apps found an audience?',
        description:
            'Apps and their observed first-week adoption, including zero-reader apps. Unknown launch dates and incomplete seven-day windows remain separate. No observed readership is a prompt to investigate, not evidence that an app can safely be deleted.',
        explore: 'data_app_reach',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_project_name',
            'data_app_reach_adoption_status',
            'data_app_reach_is_deleted',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
        ],
        metrics: [
            'data_app_reach_distinct_consumers',
            'data_app_reach_returning_consumers',
        ],
        limit: 100,
        sorts: [
            { fieldId: 'data_app_reach_distinct_consumers', descending: false },
        ],
        fieldLabels: {
            data_app_reach_distinct_consumers: 'Readers',
            data_app_reach_returning_consumers: 'Returning readers',
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
        dimensions: ['lightdash_users_name', 'agent_requests_user_id'],
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
        dimensions: ['lightdash_agents_name', 'agent_requests_agent_id'],
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
    key: 'lightdash-analytics-adoption',
    name: 'Adoption',
    description:
        'See who is active, which apps and dashboards people use, and how Ask AI use develops. Updated nightly; charts use available captured history.',
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
                        'Dashboard viewers and app readers are shown separately because their view definitions differ. Their audiences overlap; do not add them together.',
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
                    title: 'Are apps finding regular readers?',
                    description:
                        'Readers exclude known app builders, previews and reloads. First-week adoption needs a captured launch and seven complete days; missing history stays unknown.',
                    charts: [
                        'adoption-app-reader-trend',
                        'adoption-app-reader-detail',
                        'adoption-app-first-audience',
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
