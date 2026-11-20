import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
    UnitOfTime,
} from '@lightdash/common';
import {
    card,
    heatmapByDay,
    ranking,
    seriesByDay,
    trend,
    trendRows,
} from './chartBuilders';
import {
    peopleNoActivityChartSpecs,
    peopleNoActivitySections,
} from './peopleNoActivityCharts';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

// Where a person opens a data app to use it. A custom chart type drawing a chart tile also records a
// load, with the context "chart", but that is a chart being viewed, not a data app being used.
const appViewingSurfaces: NonNullable<UsageChartSpec['filters']> = [
    {
        field: 'data_app_reach_view_context',
        values: ['standalone', 'dashboard'],
    },
];
const askAi: NonNullable<UsageChartSpec['filters']> = [
    { field: 'agent_requests_surface', values: ['web_app'] },
];
const dashboardKey = 'lightdash-analytics-adoption';

// The Date filter reaches only the two outcome charts. Every other chart covers all recorded history.
const allHistory = 5000;
const activityDay = 'user_activity_activity_date_day';
const requestDay = 'agent_requests_requested_at_day';
const reachDay = 'data_app_reach_event_ts_day';
const latestDayNote = 'The Date filter does not apply.';
const appWeek = 'content_health_created_at_week';
const appRunningTotal = {
    name: 'data_apps_running_total',
    displayName: 'Data apps',
    type: TableCalculationType.NUMBER,
    sql: `SUM(\${content_health.total_content}) OVER (ORDER BY \${content_health.created_at_week})`,
    format: { type: CustomFormatType.NUMBER, round: 0 },
};

export const adoptionChartSpecs: UsageChartSpec[] = [
    card({
        key: 'adoption-active-people-latest-day',
        name: 'Active people',
        description: `People with any recorded activity on the latest day in recorded history. ${latestDayNote}`,
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_unique_users',
        latestDay: true,
        history: allHistory,
    }),
    card({
        key: 'adoption-dashboard-viewers-latest-day',
        name: 'People viewing dashboards',
        description: `People who viewed a dashboard on the latest day in recorded history. ${latestDayNote}`,
        explore: 'content_reach',
        day: 'content_reach_event_ts_day',
        metric: 'content_reach_distinct_viewers',
        filters: [
            { field: 'content_reach_content_type', values: ['dashboard'] },
        ],
        latestDay: true,
        history: allHistory,
    }),
    card({
        key: 'adoption-app-viewers-latest-day',
        name: 'People loading data apps',
        description: `People who loaded a data app from a standalone page or dashboard on the latest day in recorded history. ${latestDayNote}`,
        explore: 'data_app_reach',
        day: reachDay,
        metric: 'data_app_reach_distinct_viewers',
        filters: appViewingSurfaces,
        latestDay: true,
        history: allHistory,
    }),
    trend({
        key: 'adoption-active-people-day',
        name: 'Daily active people',
        description:
            'Distinct identified people with recorded activity each day. This is not a count of logins or the share of people with access.',
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_unique_users',
        limit: allHistory,
        fieldLabels: { user_activity_unique_users: 'Active people' },
    }),
    trend({
        key: 'adoption-active-people-week',
        name: 'Weekly active people',
        description:
            'Distinct identified people with recorded activity each week. A person active on several days counts once for the week, so this is not a sum of the daily counts.',
        explore: 'user_activity',
        day: 'user_activity_activity_date_week',
        metric: 'user_activity_unique_users',
        limit: allHistory,
        fieldLabels: {
            user_activity_unique_users: 'Active people',
            user_activity_activity_date_week: 'Week',
        },
    }),
    heatmapByDay({
        key: 'adoption-activity-by-person-and-day',
        name: 'Recorded activity by person and day, last 30 days',
        description:
            'The 15 people with the most recorded activity in the last 30 complete days. Recent activity does not mean a recent login.',
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_total_events',
        category: 'user_activity_user_name',
        identity: ['user_activity_user_id'],
        top: 15,
        filters: [
            {
                field: activityDay,
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
            },
        ],
        titles: { category: 'Person', metric: 'Activities' },
    }),
    ranking({
        key: 'adoption-dashboard-audience',
        name: 'Which dashboards are people viewing?',
        description:
            'Distinct viewers and recorded views for each dashboard. One person can view several dashboards, so viewer counts overlap.',
        explore: 'content_reach',
        by: 'content_reach_content_name',
        dimensions: [
            'content_reach_content_name',
            'content_reach_project_name',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_qualifying_views',
        ],
        extraMetrics: ['content_reach_last_viewed_at'],
        filters: [
            { field: 'content_reach_content_type', values: ['dashboard'] },
        ],
        limit: 30,
        libraryLimit: 30,
        fieldLabels: {
            content_reach_content_name: 'Dashboard',
            content_reach_project_name: 'Project',
            content_reach_last_viewed_at: 'Last recorded view',
            content_reach_distinct_viewers: 'People viewing',
            content_reach_qualifying_views: 'Recorded views',
        },
    }),
    ranking({
        key: 'adoption-app-audience',
        name: 'Which data apps are people loading?',
        description:
            'Recorded data app loads from standalone pages and dashboards, including reloads. Chart tiles drawn by a custom chart type, builder previews, embeds and deliveries are left out.',
        explore: 'data_app_reach',
        by: 'data_app_reach_app_name',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_project_name',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
        ],
        metrics: [
            'data_app_reach_distinct_viewers',
            'data_app_reach_total_loads',
        ],
        extraMetrics: ['data_app_reach_last_loaded_at'],
        filters: appViewingSurfaces,
        limit: 30,
        libraryLimit: 30,
        fieldLabels: {
            data_app_reach_app_name: 'Data app',
            data_app_reach_distinct_viewers: 'Identified viewers',
            data_app_reach_total_loads: 'App loads',
            data_app_reach_last_loaded_at: 'Last app load',
        },
    }),
    {
        // Data apps are created a few times a quarter. A count for each day is a row of lone spikes,
        // so the chart adds them up: it climbs a step each time a data app is created.
        key: 'adoption-apps-created-by-day',
        name: 'Data apps over time',
        description:
            'Data apps in the latest inventory, added up week by week from the day each was created. Includes deleted data apps, not custom chart types.',
        explore: 'content_created',
        dimensions: [appWeek],
        metrics: ['content_health_total_content'],
        filters: [
            { field: appWeek, operator: FilterOperator.NOT_NULL, values: [] },
            { field: 'content_health_content_type', values: ['data_app'] },
        ],
        tableCalculations: [appRunningTotal],
        limit: allHistory,
        sorts: [{ fieldId: appWeek, descending: false }],
        visualization: 'line',
        xField: appWeek,
        yFields: [appRunningTotal.name],
        fieldLabels: { [appWeek]: 'Week', [appRunningTotal.name]: 'Data apps' },
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.0',
            fieldMapping: { x: appWeek, m1: appRunningTotal.name },
            optionValues: {
                seriesType: 'step',
                xAxisType: 'time',
                xTimeFormat: '{MMM} {yyyy}',
                xName: 'Week',
                yName: 'Data apps',
                m1Name: 'Data apps',
            },
            query: null,
        },
    },
    ranking({
        key: 'adoption-app-creators',
        name: 'Who is creating data apps?',
        description:
            'People who created data apps, and the apps they created, by day. Iterations and loads are not counted.',
        explore: 'data_app_events',
        by: 'data_app_events_user_name',
        then: 'data_app_events_app_name',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_app_name',
            'data_app_events_event_ts_day',
            'data_app_events_user_id',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_total_events'],
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.created'],
            },
        ],
        limit: 100,
        fieldLabels: {
            data_app_events_event_ts_day: 'Created',
            data_app_events_user_name: 'Creator',
            data_app_events_total_events: 'Data apps created',
        },
        libraryDescription:
            'Data apps created by each person; open a person to see their data apps. Iterations and loads are not counted.',
    }),
    {
        key: 'adoption-app-reader-trend',
        name: 'Data app loads and viewers by day',
        description:
            'Loads and distinct identified viewers per day, from standalone pages and dashboards. Daily viewer counts cannot be added up across days.',
        explore: 'data_app_reach',
        dimensions: [reachDay],
        metrics: [
            'data_app_reach_distinct_viewers',
            'data_app_reach_total_loads',
        ],
        filters: appViewingSurfaces,
        limit: allHistory,
        sorts: [{ fieldId: reachDay, descending: false }],
        visualization: 'line',
        fieldLabels: {
            data_app_reach_distinct_viewers: 'Identified viewers',
            data_app_reach_total_loads: 'App loads',
        },
        libraryChart: {
            slug: 'vega-trellis',
            minVersion: '0.7.0',
            fieldMapping: {
                x: reachDay,
                value: 'data_app_reach_total_loads',
                panel: 'data_app_reach_view_context',
            },
            optionValues: trendRows(true),
            query: {
                dimensions: [reachDay, 'data_app_reach_view_context'],
                metrics: ['data_app_reach_total_loads'],
                sorts: [
                    {
                        fieldId: 'data_app_reach_view_context',
                        descending: false,
                    },
                    { fieldId: reachDay, descending: false },
                ],
                limit: allHistory,
                description:
                    'Loads per day, with one row for standalone pages and one for dashboards. Each row has its own scale.',
            },
        },
    },
    ranking({
        key: 'adoption-app-reader-detail',
        name: 'Who loads each data app?',
        description:
            'People who loaded data apps from standalone pages and dashboards, by app. The same person can appear for several apps, so rows cannot be added up to count people.',
        explore: 'data_app_reach',
        by: 'data_app_reach_app_name',
        then: 'data_app_reach_user_name',
        dimensions: [
            'data_app_reach_app_name',
            'data_app_reach_user_name',
            'data_app_reach_app_id',
            'data_app_reach_project_id',
            'data_app_reach_user_id',
        ],
        metrics: ['data_app_reach_total_loads'],
        extraMetrics: ['data_app_reach_last_loaded_at'],
        filters: appViewingSurfaces,
        limit: 100,
        fieldLabels: {
            data_app_reach_app_name: 'Data app',
            data_app_reach_user_name: 'Person',
            data_app_reach_total_loads: 'App loads',
            data_app_reach_last_loaded_at: 'Last app load',
        },
    }),
    ranking({
        key: 'adoption-app-first-audience',
        name: 'Where are data apps being loaded?',
        description:
            'All recorded data app loads by surface, including chart tiles drawn by a custom chart type, builder previews, embeds, deliveries and loads with unknown context. Viewers of embeds are not identified.',
        explore: 'data_app_reach',
        by: 'data_app_reach_view_context',
        metrics: [
            'data_app_reach_total_loads',
            'data_app_reach_distinct_viewers',
        ],
        limit: 100,
        fieldLabels: {
            data_app_reach_view_context: 'Surface',
            data_app_reach_total_loads: 'App loads',
            data_app_reach_distinct_viewers: 'Identified viewers',
        },
    }),
    seriesByDay({
        key: 'adoption-app-outcome-trend',
        name: 'Data app errors by day',
        description:
            'Distinct data app page loads each day with a delivery failure or a runtime error, on all surfaces. Daily counts cannot be added up across days.',
        explore: 'data_app_outcomes',
        day: 'data_app_outcomes_event_ts_day',
        series: [
            {
                metric: 'data_app_outcomes_html_error',
                name: 'HTML delivery failures',
            },
            {
                metric: 'data_app_outcomes_runtime_error',
                name: 'Runtime errors',
            },
        ],
        yName: 'Page loads with an error',
        seriesType: 'line',
    }),
    {
        key: 'adoption-app-outcome-detail',
        name: 'Data app outcomes by app and surface',
        description:
            'Page delivery, startup and runtime errors for each data app and surface, counted once for each load of a page. Includes builder previews, embeds and deliveries.',
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
            data_app_outcomes_app_name: 'Data app',
            data_app_outcomes_project_name: 'Project',
            data_app_outcomes_view_context: 'Surface',
            data_app_outcomes_html_loaded: 'HTML delivered',
            data_app_outcomes_sdk_started: 'SDK started',
            data_app_outcomes_html_error: 'HTML delivery failures',
            data_app_outcomes_runtime_error: 'Runtime errors',
            data_app_outcomes_total_signals: 'Signals recorded',
        },
    },
    trend({
        key: 'adoption-ask-ai-questions',
        name: 'Agent requests in the web app by day',
        description:
            'Requests sent to agents in the web app, including follow-ups and requests that are pending or failed. One request can make several AI calls.',
        explore: 'agent_request_starts',
        day: requestDay,
        metric: 'agent_requests_total_requests',
        filters: askAi,
        limit: allHistory,
    }),
    trend({
        key: 'adoption-ask-ai-people',
        name: 'People asking agents in the web app by week',
        description:
            'Distinct identified people who sent an agent request in the web app each week. Using other AI features does not count.',
        explore: 'agent_request_starts',
        day: 'agent_requests_requested_at_week',
        metric: 'agent_requests_distinct_requesters',
        filters: askAi,
        limit: allHistory,
        fieldLabels: {
            agent_requests_distinct_requesters: 'People asking agents',
        },
    }),
    trend({
        key: 'adoption-ask-ai-frequency',
        name: 'Agent requests per person asking, by day',
        description:
            'Agent requests from identified people in the web app, divided by the number of people who asked that day. People who asked nothing are not in the average.',
        explore: 'agent_request_starts',
        day: requestDay,
        metric: 'questions_per_person',
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
        limit: allHistory,
        fieldLabels: {
            questions_per_person: 'Agent requests per person asking',
        },
    }),
    ranking({
        key: 'adoption-ask-ai-users',
        name: 'Who is asking agents?',
        description: 'People ranked by agent requests in the web app.',
        explore: 'agent_request_starts',
        by: 'agent_requests_user_name',
        dimensions: ['agent_requests_user_name', 'agent_requests_user_id'],
        metrics: ['agent_requests_total_requests'],
        filters: askAi,
    }),
    ranking({
        key: 'adoption-ask-ai-agents',
        name: 'Which agents are people asking?',
        description:
            'Agent requests in the web app and distinct people asking, for each agent. One person can use several agents, so the people counts overlap.',
        explore: 'agent_request_starts',
        by: 'agent_requests_agent_name',
        dimensions: ['agent_requests_agent_name', 'agent_requests_agent_id'],
        metrics: [
            'agent_requests_total_requests',
            'agent_requests_distinct_requesters',
        ],
        filters: askAi,
        limit: 30,
        fieldLabels: { agent_requests_distinct_requesters: 'People asking' },
    }),
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
                        'People on the latest day of recorded history, by what they did. These tiles cover all recorded history: the Date filter does not apply.',
                    charts: [
                        'adoption-active-people-latest-day',
                        'adoption-dashboard-viewers-latest-day',
                        'adoption-app-viewers-latest-day',
                    ],
                },
                {
                    title: 'Active people by day',
                    description: '',
                    note: false,
                    charts: [
                        'adoption-active-people-day',
                        'adoption-active-people-week',
                    ],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Activity by person',
                    description: '',
                    note: false,
                    charts: ['adoption-activity-by-person-and-day'],
                    layout: 'row',
                    rowHeight: 9,
                },
                {
                    title: 'What are people using?',
                    description:
                        'Dashboard viewers and data app loads are shown separately because they measure different activity. Their audiences overlap; do not add them together.',
                    charts: [
                        'adoption-dashboard-audience',
                        'adoption-app-audience',
                    ],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
        {
            key: 'inactive',
            name: 'People who have not used Lightdash',
            sections: peopleNoActivitySections,
        },
        {
            key: 'data-apps',
            name: 'Data apps',
            sections: [
                {
                    title: 'Who is creating data apps?',
                    description:
                        'Recorded data app creation and the people behind it. Creation does not mean an app is ready or shared.',
                    charts: [
                        'adoption-apps-created-by-day',
                        'adoption-app-creators',
                    ],
                    layout: 'row',
                    // Room for eight creators beside the chart, with no blank block under a short list
                    rowHeight: 6,
                },
                {
                    title: 'Who is loading data apps, and where?',
                    description:
                        'Trends and named viewers cover standalone pages and dashboards. The surface breakdown adds custom chart tiles, builder previews, embeds, deliveries and unknown context.',
                    charts: ['adoption-app-reader-trend'],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    title: 'Viewers and surfaces',
                    description: '',
                    note: false,
                    charts: [
                        'adoption-app-reader-detail',
                        'adoption-app-first-audience',
                    ],
                    layout: 'row',
                    rowHeight: 8,
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
                        'Technical signals from every surface, counted once for each load of a data app page. The Date, Data app and Surface filters change only the tiles on this tab.',
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
                        'Agent requests sent in the web app, including follow-ups. Slack, embeds and conversations that build data apps are left out.',
                    charts: ['adoption-ask-ai-questions'],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Requests per person',
                    description: '',
                    note: false,
                    charts: [
                        'adoption-ask-ai-people',
                        'adoption-ask-ai-frequency',
                    ],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Who is using agents?',
                    description:
                        'Agent requests by person and by agent. A missing name does not necessarily mean anonymous use.',
                    charts: ['adoption-ask-ai-users', 'adoption-ask-ai-agents'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
    ],
};
