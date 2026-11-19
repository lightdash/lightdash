import { FilterOperator, ProjectType } from '@lightdash/common';
import type { LibraryChartBinding } from './libraryCharts';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

// The first tab of Settings > Lightdash analytics: four headline cards, three daily trends and the most
// active people. Every tile explains itself in its title and description, so no section has text above it.
const anyActivity =
    "Includes scheduled deliveries and other automated runs in the person's name.";

const userActivityLabels = {
    user_activity_activity_date_day: 'Day',
    user_activity_unique_users: 'People',
    user_activity_user_name: 'Person',
    user_activity_total_events: 'Recorded activities',
    user_activity_total_queries: 'Queries',
    user_activity_total_ai_calls: 'AI calls',
};

// A headline card: the plain version is a big number, the library version adds the daily trend behind it.
// A sum is safe to total over days. A distinct count is not, so it shows the latest day in both versions.
const card = ({
    day,
    metric,
    distinct = false,
    description,
    ...spec
}: Pick<UsageChartSpec, 'key' | 'name' | 'explore' | 'filters'> & {
    day: string;
    metric: string;
    distinct?: boolean;
    description: string;
}): UsageChartSpec => ({
    ...spec,
    description,
    // Newest day first: the big number reads the first row, so it shows the latest day.
    dimensions: distinct ? [day] : [],
    metrics: [metric],
    limit: 1,
    sorts: [{ fieldId: distinct ? day : metric, descending: true }],
    visualization: 'number',
    libraryChart: {
        slug: 'big-number-with-sparkline-trend',
        minVersion: distinct ? '0.7.1' : '0.8.0',
        fieldMapping: { value: metric, sparklineMetric: metric, time: day },
        optionValues: {
            ...(distinct
                ? { valueAggregation: 'latest', showComparison: false }
                : {
                      valueAggregation: 'sum',
                      style: 'compact',
                      showComparison: true,
                      comparisonSource: 'previousPeriod',
                  }),
            colorSparklineByTrend: false,
            showSparklineArea: true,
            showLabel: true,
            label: distinct ? 'Latest day' : 'Selected period',
            showCardBorder: false,
            showCardShadow: false,
        },
        query: {
            dimensions: [day],
            metrics: [metric],
            sorts: [{ fieldId: day, descending: false }],
            limit: 500,
            description: distinct
                ? `${description} The line shows each day. A person active on several days is counted on each of those days.`
                : description,
        },
    },
});

// One full-width smooth filled line. Each measure has its own tile and scale: people is a distinct count
// and the others count events, so they cannot share an axis.
const trendRows: LibraryChartBinding['optionValues'] = {
    arrangement: 'rows',
    minPanelHeight: 70,
    sharedY: false,
    markType: 'area',
    curve: 'smooth',
    fillOpacity: 25,
    showLine: true,
    showPoints: false,
};

const trend = ({
    day,
    metric,
    ...spec
}: Pick<
    UsageChartSpec,
    'key' | 'name' | 'description' | 'explore' | 'fieldLabels'
> & {
    day: string;
    metric: string;
}): UsageChartSpec => ({
    ...spec,
    dimensions: [day],
    metrics: [metric],
    limit: 500,
    sorts: [{ fieldId: day, descending: false }],
    visualization: 'line',
    xField: day,
    yFields: [metric],
    libraryChart: {
        slug: 'vega-trellis',
        minVersion: '0.6.2',
        fieldMapping: { x: day, value: metric },
        optionValues: trendRows,
        query: null,
    },
});

const mostActivePeopleMetrics = [
    'user_activity_total_events',
    'user_activity_total_queries',
    'user_activity_total_ai_calls',
];
const mostActivePeopleDescription = `The 10 people with the most recorded activity in the selected period, with their queries and AI calls. ${anyActivity}`;

export const homeChartSpecs: UsageChartSpec[] = [
    card({
        key: 'active-people',
        name: 'Active people',
        description: `People with any recorded activity on the latest day in the selected period. ${anyActivity}`,
        explore: 'user_activity',
        day: 'user_activity_activity_date_day',
        metric: 'user_activity_unique_users',
        distinct: true,
    }),
    card({
        key: 'queries',
        name: 'Queries',
        description:
            'Queries run in the selected period, including failed and scheduled queries.',
        explore: 'query_events',
        day: 'query_events_event_ts_day',
        metric: 'query_events_total_queries',
    }),
    card({
        key: 'agent-requests',
        name: 'Agent requests',
        description:
            'Requests to agents in the selected period. A request counts once, however many steps the agent takes.',
        explore: 'agent_requests',
        day: 'agent_requests_requested_at_day',
        metric: 'agent_requests_total_requests',
    }),
    card({
        key: 'content-created',
        name: 'Content created',
        description:
            'Charts and dashboards created in the selected period, including deleted ones. Content in preview projects is left out.',
        explore: 'content_inventory',
        day: 'content_health_created_at_day',
        metric: 'content_health_total_content',
        filters: [
            {
                field: 'content_health_content_type',
                values: ['saved_chart', 'sql_chart', 'dashboard'],
            },
            {
                field: 'content_health_project_type',
                values: [ProjectType.PREVIEW],
                operator: FilterOperator.NOT_EQUALS,
            },
        ],
    }),
    trend({
        key: 'people-by-day',
        name: 'People with any recorded activity by day',
        description: anyActivity,
        explore: 'user_activity',
        day: 'user_activity_activity_date_day',
        metric: 'user_activity_unique_users',
        fieldLabels: userActivityLabels,
    }),
    trend({
        key: 'queries-by-day',
        name: 'Queries by day',
        description: 'Includes failed and scheduled queries.',
        explore: 'query_events',
        day: 'query_events_event_ts_day',
        metric: 'query_events_total_queries',
    }),
    trend({
        key: 'agent-requests-by-day',
        name: 'Agent requests by day',
        description:
            'A request counts once, however many steps the agent takes.',
        explore: 'agent_requests',
        day: 'agent_requests_requested_at_day',
        metric: 'agent_requests_total_requests',
    }),
    {
        key: 'most-active-people',
        name: 'Most active people (top 10)',
        description: mostActivePeopleDescription,
        explore: 'user_activity',
        dimensions: ['user_activity_user_name', 'user_activity_user_id'],
        metrics: mostActivePeopleMetrics,
        limit: 10,
        sorts: [{ fieldId: 'user_activity_total_events', descending: true }],
        fieldLabels: userActivityLabels,
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: 'user_activity_user_name',
                metric: mostActivePeopleMetrics,
            },
            // Ranked by the query and by the table. A total of ten people is not the total for everyone.
            optionValues: {
                showMiniBars: true,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Person',
                valueNames: 'Recorded activities,Queries,AI calls',
            },
            query: {
                dimensions: ['user_activity_user_name'],
                metrics: mostActivePeopleMetrics,
                sorts: [
                    {
                        fieldId: 'user_activity_total_events',
                        descending: true,
                    },
                ],
                limit: 10,
                description: `${mostActivePeopleDescription} People without a display name are grouped as Unknown user.`,
            },
        },
    },
];

export const homeDashboardSpec: UsageDashboardSpec = {
    key: 'lightdash-analytics-home',
    name: 'Overview',
    description:
        'People, queries, agent requests and new content across Lightdash.',
    tabs: [
        {
            key: 'overview',
            name: 'Overview',
            sections: [
                {
                    title: 'Headlines',
                    description: '',
                    note: false,
                    charts: [
                        'active-people',
                        'queries',
                        'agent-requests',
                        'content-created',
                    ],
                },
                ...[
                    'people-by-day',
                    'queries-by-day',
                    'agent-requests-by-day',
                ].map(
                    (
                        key,
                    ): UsageDashboardSpec['tabs'][number]['sections'][number] => ({
                        title: 'Activity by day',
                        description: '',
                        note: false,
                        charts: [key],
                        layout: 'row',
                        rowHeight: 5,
                    }),
                ),
                {
                    title: 'Most active people',
                    description: '',
                    note: false,
                    charts: ['most-active-people'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
    ],
};
