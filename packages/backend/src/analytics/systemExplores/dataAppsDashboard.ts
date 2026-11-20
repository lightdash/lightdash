import { FilterOperator } from '@lightdash/common';
import {
    card,
    ranking,
    stackedByDay,
    trend,
    trendByCategory,
} from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const day = 'data_app_events_event_ts_day';
// A custom chart type is drawn by a data app behind the scenes, and each chart tile records a load with
// the context "chart". That is a chart being viewed, not a data app being used, so it is left out here.
// Older loads with no recorded context are kept.
const loads: NonNullable<UsageChartSpec['filters']> = [
    { field: 'data_app_events_event_name', values: ['data_app.view'] },
    {
        field: 'data_app_events_view_context',
        values: ['chart'],
        operator: FilterOperator.NOT_EQUALS,
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
            'People who loaded a data app on the latest day in the selected period. Anonymous visitors are not counted.',
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
            'Number of times a data app was loaded. Reloads count. Unknown or deleted data apps are included. Custom chart types shown as chart tiles are not counted.',
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
            'The eight most-loaded data apps in the selected period. Each data app has its own scale, so row heights cannot be compared.',
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
            'Number of recorded events for each data app and project, split by event type, such as created, iterated and loaded. Unknown or deleted apps are included.',
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
        // Load result signals are technical and are not counted as events, so they get no column
        filters: [
            {
                field: 'data_app_events_event_name',
                values: ['data_app.view_outcome'],
                operator: FilterOperator.NOT_EQUALS,
            },
        ],
        fieldLabels: { data_app_events_total_events: 'Events' },
        libraryDescription:
            'Number of recorded events for each data app, with one column for each event type, such as created, iterated and loaded. Unknown or deleted apps are included.',
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
        then: 'ai_usage_model',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_model',
            'ai_usage_user_id',
        ],
        metrics: ['ai_usage_total_tokens_used', 'ai_usage_total_ai_calls'],
        filters: generation,
        limit: 100,
    }),
];

export const dataAppsDashboardSpec: UsageDashboardSpec = {
    key: 'lightdash-analytics-apps',
    name: 'Data apps',
    description: 'Data app usage, audiences and generation activity.',
    tabs: [
        {
            key: 'usage',
            name: 'Data app usage',
            sections: [
                {
                    title: 'Data app use',
                    description:
                        'Data app loads, including reloads. Viewer counts leave out anonymous visitors.',
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
                        'Loads by day for the eight most-loaded data apps, each on its own scale.',
                    caption: true,
                    charts: ['apps-loads-by-app-and-day'],
                    layout: 'row',
                    // Fits eight data app rows of about 70 to 90px.
                    rowHeight: 14,
                },
                {
                    title: 'Popular data apps',
                    description:
                        'Most-used data apps and their projects. Unknown or deleted apps remain in totals.',
                    charts: ['top-apps'],
                    layout: 'row',
                    rowHeight: 8,
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
            ],
        },
    ],
};
