import { card, ranking, seriesByDay, trend } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const anyActivity =
    "Includes scheduled deliveries and other automated runs in the person's name.";
const day = 'user_activity_activity_date_day';
const googleSheets: NonNullable<UsageChartSpec['filters']> = [
    { field: 'query_events_context', values: ['gsheets'] },
];

export const peopleChartSpecs: UsageChartSpec[] = [
    card({
        key: 'people-active-latest-day',
        name: 'Active people',
        description: `People with any recorded activity on the latest day in the selected period. ${anyActivity}`,
        explore: 'user_activity',
        day,
        metric: 'user_activity_unique_users',
        latestDay: true,
        hero: true,
    }),
    card({
        key: 'people-recorded-activities',
        name: 'Recorded activities',
        description:
            'Queries, views, AI calls, downloads and other recorded activity in the selected period.',
        explore: 'user_activity',
        day,
        metric: 'user_activity_total_events',
    }),
    card({
        key: 'people-queries',
        name: 'Queries',
        description:
            'Queries run in the selected period, including scheduled queries.',
        explore: 'user_activity',
        day,
        metric: 'user_activity_total_queries',
    }),
    trend({
        key: 'daily-observed-active-people',
        name: 'People with any recorded activity by day',
        description: anyActivity,
        explore: 'user_activity',
        day,
        metric: 'user_activity_unique_users',
    }),
    seriesByDay({
        key: 'people-activity-by-type-and-day',
        name: 'Queries, AI calls and downloads by day',
        description: '',
        explore: 'user_activity',
        day,
        series: [
            { metric: 'user_activity_total_queries', name: 'Queries' },
            { metric: 'user_activity_total_ai_calls', name: 'AI calls' },
            { metric: 'user_activity_total_downloads', name: 'Downloads' },
        ],
        yName: 'Recorded activities',
        stacked: true,
    }),
    ranking({
        key: 'power-users-queries-ai-and-exports',
        name: 'Most active people',
        description: `The 20 people with the most recorded activity in the selected period. ${anyActivity}`,
        explore: 'user_activity',
        by: 'user_activity_user_name',
        dimensions: ['user_activity_user_name', 'user_activity_user_id'],
        metrics: [
            'user_activity_total_events',
            'user_activity_total_queries',
            'user_activity_total_ai_calls',
            'user_activity_total_downloads',
        ],
        limit: 20,
        libraryLimit: 20,
        libraryDescription: `The 20 people with the most recorded activity in the selected period. ${anyActivity} People without a display name are grouped as Unknown user.`,
    }),
    trend({
        key: 'people-google-sheets-queries-by-day',
        name: 'Google Sheets queries by day',
        description: '',
        explore: 'query_events',
        day: 'query_events_event_ts_day',
        metric: 'query_events_total_queries',
        filters: googleSheets,
    }),
    ranking({
        key: 'google-sheets-query-audience',
        name: 'Google Sheets queries by person',
        description:
            'Queries each person ran through the Google Sheets integration in the selected period.',
        explore: 'query_events',
        by: 'query_events_user_name',
        dimensions: ['query_events_user_name', 'query_events_user_id'],
        metrics: ['query_events_total_queries'],
        filters: googleSheets,
        limit: 100,
        fieldLabels: { query_events_user_name: 'Person' },
    }),
];

export const peopleDashboardSpec: UsageDashboardSpec = {
    key: 'lightdash-analytics-people',
    name: 'People',
    // People who have not used Lightdash, and activity by person and day, are on the Adoption dashboard
    description: 'Active people and Google Sheets use.',
    tabs: [
        {
            key: 'activity',
            name: 'Activity',
            sections: [
                {
                    title: 'Active people',
                    description: `People with any recorded activity. ${anyActivity}`,
                    charts: [
                        'people-active-latest-day',
                        'people-recorded-activities',
                        'people-queries',
                    ],
                    layout: 'row',
                    rowHeight: 4,
                    widths: [18, 9, 9],
                },
                {
                    title: 'People by day',
                    description: '',
                    note: false,
                    charts: ['daily-observed-active-people'],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Activity by type',
                    description: '',
                    note: false,
                    charts: ['people-activity-by-type-and-day'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Most active people',
                    description: '',
                    note: false,
                    charts: ['power-users-queries-ai-and-exports'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
        {
            key: 'channels',
            name: 'Google Sheets',
            sections: [
                {
                    title: 'Google Sheets',
                    description:
                        'Queries run through the Google Sheets integration. This does not count everyone who reads the spreadsheet.',
                    charts: ['people-google-sheets-queries-by-day'],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Google Sheets queries by person',
                    description: '',
                    note: false,
                    charts: ['google-sheets-query-audience'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
    ],
};
