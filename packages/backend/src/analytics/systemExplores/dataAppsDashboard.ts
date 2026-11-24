import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
} from '@lightdash/common';
import { analyticsColorPalette } from './analyticsColorPalette';
import {
    card,
    ranking,
    seriesByDay,
    stackedByDay,
    trend,
    trendByCategory,
} from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const day = 'data_app_events_event_ts_day';
const appWeek = 'content_health_created_at_week';
const appRunningTotal = {
    name: 'data_apps_running_total',
    displayName: 'Data apps',
    type: TableCalculationType.NUMBER,
    sql: `SUM(\${content_health.total_content}) OVER (ORDER BY \${content_health.created_at_week})`,
    format: { type: CustomFormatType.NUMBER, round: 0 },
};
// One definition of a data app load and of a viewer on every tile of this dashboard: a person opening
// the data app on a standalone page or a dashboard. A builder preview, a delivery, an embed and a chart
// tile drawn by a custom chart type also record a load; they appear only in the breakdown by surface.
const loads: NonNullable<UsageChartSpec['filters']> = [
    { field: 'data_app_events_event_name', values: ['data_app.view'] },
    {
        field: 'data_app_events_view_context',
        values: ['standalone', 'dashboard'],
    },
];
const builds: NonNullable<UsageChartSpec['filters']> = [
    {
        field: 'data_app_events_event_name',
        values: ['data_app.created', 'data_app.iterated'],
    },
];
const generation: NonNullable<UsageChartSpec['filters']> = [
    { field: 'ai_usage_feature', values: ['data-app'] },
];

export const dataAppsChartSpecs: UsageChartSpec[] = [
    card({
        key: 'apps-viewers-latest-day',
        name: 'Data app viewers',
        description:
            'People who loaded a data app from a standalone page or dashboard on the latest day in the selected period. The same count as People loading data apps on People.',
        explore: 'data_app_events',
        day,
        metric: 'data_app_events_unique_viewers',
        filters: loads,
        latestDay: true,
        hero: true,
    }),
    card({
        key: 'total-loads',
        name: 'Data app loads',
        description:
            'Times a data app was opened on a standalone page or a dashboard, including reloads. Builder previews, deliveries, embeds and custom chart tiles are not counted here.',
        explore: 'data_app_events',
        day,
        metric: 'data_app_events_total_views',
        filters: loads,
    }),
    card({
        key: 'apps-loaded-latest-day',
        name: 'Data apps loaded',
        description:
            'Data apps loaded at least once on the latest day in the selected period.',
        explore: 'data_app_events',
        day,
        metric: 'data_app_events_unique_apps',
        filters: loads,
        latestDay: true,
    }),
    trendByCategory({
        key: 'apps-loads-by-app-and-day',
        name: 'Loads by day, one row per data app',
        description:
            'Up to eight of the most-loaded data apps in the selected period. Each data app has its own scale, so row heights cannot be compared.',
        explore: 'data_app_events',
        day,
        metric: 'data_app_events_total_views',
        category: 'data_app_events_app_name',
        identity: ['data_app_events_app_id'],
        top: 8,
        filters: loads,
    }),
    ranking({
        key: 'top-apps',
        name: 'Most-used data apps',
        description: 'Loads and viewers for each data app and project.',
        explore: 'data_app_events',
        by: 'data_app_events_app_name',
        dimensions: [
            'data_app_events_app_name',
            'data_app_events_project_name',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: [
            'data_app_events_total_views',
            'data_app_events_unique_viewers',
        ],
        filters: loads,
        limit: 20,
        libraryLimit: 20,
        libraryDescription:
            'The 20 most-loaded data apps in the selected period, with their viewers. Data apps with the same name are shown as one.',
    }),
    ranking({
        key: 'top-people',
        name: 'Most active data app viewers',
        description:
            'The 20 people who loaded data apps the most, with the number of data apps they loaded.',
        explore: 'data_app_events',
        by: 'data_app_events_user_name',
        dimensions: ['data_app_events_user_name', 'data_app_events_user_id'],
        metrics: ['data_app_events_total_views', 'data_app_events_unique_apps'],
        filters: loads,
        limit: 20,
        libraryLimit: 20,
    }),
    ranking({
        key: 'user-app-detail',
        name: 'Data app loads by person and app',
        description: 'Loads for each person, data app and project.',
        explore: 'data_app_events',
        by: 'data_app_events_user_name',
        then: 'data_app_events_app_name',
        dimensions: [
            'data_app_events_user_name',
            'data_app_events_project_name',
            'data_app_events_user_id',
            'data_app_events_app_name',
            'data_app_events_app_id',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_total_views'],
        filters: loads,
        limit: 5000,
        libraryLimit: 2000,
        libraryDescription:
            'Loads for each person. Open a person to see the data apps they loaded.',
    }),
    stackedByDay({
        key: 'apps-builds-by-type-and-day',
        name: 'Data apps created and iterated on by day',
        description: '',
        explore: 'data_app_events',
        day,
        metric: 'data_app_events_total_events',
        splitBy: 'data_app_events_event_name_name',
        yName: 'Builds',
        filters: builds,
        fieldLabels: { data_app_events_total_events: 'Builds' },
        // The same colour for each kind of build whichever kinds the period holds
        colors: {
            Created: analyticsColorPalette.colors[0],
            Iterated: analyticsColorPalette.colors[1],
        },
        splitDescription:
            'Builds per day, split into data apps created and iterations on existing data apps.',
    }),
    ranking({
        key: 'apps-builders',
        name: 'Builds and data apps by builder',
        description:
            'People who created or iterated on data apps in the selected period, with the number of builds and of data apps.',
        explore: 'data_app_events',
        by: 'data_app_events_user_name',
        dimensions: ['data_app_events_user_name', 'data_app_events_user_id'],
        metrics: [
            'data_app_events_total_events',
            'data_app_events_unique_apps',
        ],
        filters: builds,
        fieldLabels: { data_app_events_total_events: 'Builds' },
    }),
    ranking({
        key: 'app-lifecycle-build-activity-versus-loads',
        name: 'Build activity versus loads by data app',
        description:
            'Number of recorded events for each data app and project, split by event type, such as created, iterated and loaded. Loaded counts standalone pages and dashboards only.',
        explore: 'data_app_events',
        by: 'data_app_events_app_name',
        series: 'data_app_events_event_name_name',
        dimensions: [
            'data_app_events_app_name',
            'data_app_events_project_name',
            'data_app_events_app_id',
            'data_app_events_event_name_name',
            'data_app_events_project_id',
        ],
        metrics: ['data_app_events_total_events'],
        // Load result signals are technical and are not counted as events, so they get no column.
        // Loads are the same loads as on the rest of the dashboard: standalone pages and dashboards.
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view_outcome'],
                operator: FilterOperator.NOT_EQUALS,
            },
            { field: 'data_app_events_counts_as_use', values: [true] },
        ],
        fieldLabels: { data_app_events_total_events: 'Events' },
        libraryDescription:
            'Number of recorded events for each data app, with one column for each event type, such as created, iterated and loaded. Loaded counts standalone pages and dashboards only.',
    }),
    trend({
        key: 'apps-generation-tokens-by-day',
        name: 'Data app generation tokens by day',
        description: 'Tokens are not cost.',
        explore: 'ai_usage',
        day: 'ai_usage_event_ts_day',
        metric: 'ai_usage_total_tokens_used',
        filters: generation,
    }),
    ranking({
        key: 'app-generation-consumption',
        name: 'Data app generation tokens by builder and model',
        description:
            'Tokens used to generate data apps, by builder and model. Tokens cannot yet be linked to individual data apps or builds.',
        explore: 'ai_usage',
        by: 'ai_usage_user_name',
        then: 'ai_usage_model_name',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_model_name',
            'ai_usage_user_id',
        ],
        metrics: ['ai_usage_total_tokens_used', 'ai_usage_total_ai_calls'],
        filters: generation,
        limit: 100,
    }),
    // Moved from the Adoption dashboard, where nobody would look for them
    ranking({
        key: 'apps-loads-by-surface',
        name: 'Where are data apps being loaded?',
        description:
            'Every recorded load in the selected period by where it happened. This is the only tile that counts builder previews, deliveries, embeds and custom chart tiles; every other tile counts standalone pages and dashboards.',
        explore: 'data_app_reach',
        by: 'data_app_reach_view_context_name',
        metrics: [
            'data_app_reach_total_loads',
            'data_app_reach_distinct_viewers',
        ],
        limit: 100,
        fieldLabels: {
            data_app_reach_view_context_name: 'Surface',
            data_app_reach_total_loads: 'Loads',
            data_app_reach_distinct_viewers: 'Viewers',
        },
    }),
    {
        // Data apps are created a few times a quarter. A count for each day is a row of lone spikes,
        // so the chart adds them up: it climbs a step each time a data app is created.
        key: 'apps-running-total-by-week',
        name: 'Data apps, running total by week',
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
        limit: 5000,
        sorts: [{ fieldId: appWeek, descending: false }],
        visualization: 'line',
        xField: appWeek,
        yFields: [appRunningTotal.name],
        fieldLabels: { [appWeek]: 'Week', [appRunningTotal.name]: 'Data apps' },
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.6',
            fieldMapping: { x: appWeek, m1: appRunningTotal.name },
            optionValues: {
                // Filled, like the other trend tiles
                seriesType: 'area',
                xAxisType: 'time',
                // The day as well as the month: a tick for each week would repeat the month's name
                xTimeFormat: '{MMM} {d}',
                xName: 'Week',
                yName: 'Data apps',
                m1Name: 'Data apps',
                yIntegerTicks: true,
            },
            query: null,
        },
    },
    seriesByDay({
        key: 'apps-errors-by-day',
        name: 'Data app errors by day',
        description:
            'Distinct data app page loads each day with a delivery failure or a runtime error, on all surfaces. Daily counts cannot be added up across days.',
        explore: 'data_app_outcomes',
        day: 'data_app_outcomes_event_ts_day',
        series: [
            {
                metric: 'data_app_outcomes_html_error',
                name: 'Failed to deliver',
            },
            {
                metric: 'data_app_outcomes_runtime_error',
                name: 'Errors while running',
            },
        ],
        yName: 'Page loads with an error',
        seriesType: 'line',
        wholeNumbers: true,
    }),
    {
        key: 'apps-outcomes-by-app-and-surface',
        name: 'Data app outcomes by app and surface',
        description:
            'Pages delivered, pages that failed to deliver and pages that hit an error while running, for each data app and surface. Each load of a page counts once, including builder previews, embeds and deliveries.',
        explore: 'data_app_outcomes',
        dimensions: [
            'data_app_outcomes_app_name',
            'data_app_outcomes_project_name',
            'data_app_outcomes_view_context_name',
            'data_app_outcomes_app_id',
            'data_app_outcomes_project_id',
        ],
        metrics: [
            // Start-up is reported only by data apps built on a recent SDK, so a count of it beside
            // pages delivered reads as most loads never starting. It is left out.
            'data_app_outcomes_html_loaded',
            'data_app_outcomes_html_error',
            'data_app_outcomes_runtime_error',
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
            data_app_outcomes_view_context_name: 'Surface',
            data_app_outcomes_html_loaded: 'Pages delivered',
            data_app_outcomes_html_error: 'Failed to deliver',
            data_app_outcomes_runtime_error: 'Errors while running',
        },
    },
];

const dashboardKey = 'lightdash-analytics-apps';

export const dataAppsDashboardSpec: UsageDashboardSpec = {
    key: dashboardKey,
    // Two filters for the Reliability tab only; Date and Project are added for every dashboard
    filters: {
        dimensions: [
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
                    fieldId: 'data_app_outcomes_view_context_name',
                    tableName: 'data_app_outcomes',
                },
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            },
        ].map((filter) => ({
            ...filter,
            tileTargets: Object.fromEntries(
                dataAppsChartSpecs.map(({ key, explore }) => [
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
    name: 'Data apps',
    description:
        'How much data apps are used, by whom, who builds them and whether they load.',
    tabs: [
        {
            key: 'usage',
            name: 'Use',
            sections: [
                {
                    title: 'Data app use',
                    description:
                        'A load is a person opening a data app on a standalone page or a dashboard, reloads included. Viewer counts leave out anonymous visitors.',
                    charts: [
                        'apps-viewers-latest-day',
                        'total-loads',
                        'apps-loaded-latest-day',
                    ],
                    layout: 'row',
                    rowHeight: 4,
                    widths: [18, 9, 9],
                },
                {
                    title: 'Daily activity',
                    description:
                        'Loads by day for up to eight of the most-loaded data apps, each on its own scale.',
                    caption: true,
                    charts: ['apps-loads-by-app-and-day'],
                    layout: 'row',
                    // Fits eight data app rows of about 70 to 90px.
                    rowHeight: 14,
                },
                {
                    // The tile's title says it all
                    title: 'Popular data apps',
                    description: '',
                    note: false,
                    charts: ['top-apps', 'apps-loads-by-surface'],
                    layout: 'row',
                    widths: [24, 12],
                    rowHeight: 6,
                },
            ],
        },
        {
            key: 'people',
            name: 'People',
            sections: [
                {
                    title: 'Data app audiences',
                    description:
                        'See who uses each data app, how often they load it and how many apps they use.',
                    charts: ['top-people', 'user-app-detail'],
                    layout: 'row',
                    rowHeight: 9,
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
                        'Data apps created and iterated on, by day and by builder. Uploads and views are not counted.',
                    charts: ['apps-builds-by-type-and-day'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Builders and data apps',
                    description: '',
                    note: false,
                    charts: [
                        'apps-builders',
                        'app-lifecycle-build-activity-versus-loads',
                    ],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    title: 'Tokens for data app generation',
                    description:
                        'Tokens used to generate data apps, by day and by builder and model. Tokens are not cost.',
                    charts: ['apps-generation-tokens-by-day'],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Tokens by builder',
                    description: '',
                    note: false,
                    charts: ['app-generation-consumption'],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    // Its own section: the one tile on this tab that does not follow the Date filter
                    title: 'All data apps, whatever the Date filter says',
                    description:
                        'Every data app in the latest inventory, added up from the week each was created, over all recorded history.',
                    charts: ['apps-running-total-by-week'],
                    layout: 'row',
                    rowHeight: 6,
                },
            ],
        },
        {
            key: 'reliability',
            name: 'Reliability',
            sections: [
                {
                    title: 'Are data apps loading reliably?',
                    description:
                        'Technical signals from every surface, counted once for each load of a data app page. The Data app and Surface filters change only these two tiles.',
                    charts: [
                        'apps-errors-by-day',
                        'apps-outcomes-by-app-and-surface',
                    ],
                },
            ],
        },
    ],
};
