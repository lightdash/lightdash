import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
} from '@lightdash/common';
import { card, ranking, stackedByDay } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const day = 'content_reach_event_ts_day';
const allHistory = 'Uses all recorded history; the date filter does not apply.';

const week = 'content_health_created_at_week';
const runningTotal = 'content_running_total';
const cameBack = 'came_back_later';
const cameBackShare = 'came_back_share';

const newContentCalculations: NonNullable<UsageChartSpec['tableCalculations']> =
    [
        {
            // Nobody can have come back after the first week while it is still running
            name: cameBack,
            displayName: 'Came back later',
            type: TableCalculationType.NUMBER,
            sql: `CASE WHEN \${content_reach.content_created_at_day} > CURRENT_DATE - INTERVAL 7 DAY THEN NULL ELSE \${content_reach.first_week_returning_viewers} END`,
            format: { type: CustomFormatType.NUMBER, round: 0 },
        },
        {
            name: cameBackShare,
            displayName: 'Share who came back (%)',
            type: TableCalculationType.NUMBER,
            sql: `CASE WHEN \${content_reach.content_created_at_day} > CURRENT_DATE - INTERVAL 7 DAY THEN NULL ELSE ROUND(100.0 * \${content_reach.first_week_returning_viewers} / NULLIF(\${content_reach.first_week_viewers}, 0)) END`,
            format: { type: CustomFormatType.NUMBER, round: 0 },
        },
    ];

// Charts of the Content dashboard. The verified share and the review list stay with the plain charts in
// usageDashboardCharts.ts.
export const contentChartSpecs: UsageChartSpec[] = [
    card({
        key: 'content-viewers-latest-day',
        name: 'People viewing content',
        description:
            'People who viewed a chart, dashboard or data app on the latest day in the selected period.',
        explore: 'content_reach',
        day,
        metric: 'content_reach_distinct_viewers',
        latestDay: true,
    }),
    card({
        key: 'content-views',
        name: 'Content views',
        description:
            'Views of charts, dashboards and data apps in the selected period. Reloads add views.',
        explore: 'content_reach',
        day,
        metric: 'content_reach_qualifying_views',
    }),
    stackedByDay({
        key: 'content-views-by-type-and-day',
        name: 'Content views by type and day',
        description: '',
        explore: 'content_reach',
        day,
        metric: 'content_reach_qualifying_views',
        splitBy: 'content_reach_content_type_name',
        yName: 'Views',
        splitDescription: 'Views per day, split by the type of content.',
    }),
    ranking({
        key: 'content-reach-distinct-people-not-just-views',
        name: 'Viewers and views by content',
        description:
            'Distinct people who viewed each item, with the number of views.',
        explore: 'content_reach',
        by: 'content_reach_content_name',
        dimensions: [
            'content_reach_content_type_name',
            'content_reach_content_name',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_qualifying_views',
        ],
        libraryLimit: 50,
        libraryDescription:
            'The 50 items with the most viewers in the selected period, with their views. Items with the same name are shown as one.',
    }),
    ranking({
        key: 'who-visited-which-dashboard',
        name: 'Dashboard views by person',
        description: 'Views of each dashboard by each person.',
        explore: 'content_reach',
        by: 'content_reach_content_name',
        then: 'content_reach_user_name',
        dimensions: [
            'content_reach_content_name',
            'content_reach_user_name',
            'content_reach_user_id',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: ['content_reach_qualifying_views'],
        extraMetrics: ['content_reach_last_viewed_at'],
        filters: [
            { field: 'content_reach_content_type', values: ['dashboard'] },
        ],
        limit: 100,
        fieldLabels: { content_reach_content_name: 'Dashboard' },
        libraryDescription:
            'Views of each dashboard, with the people who viewed it. Open a dashboard to see its people.',
    }),
    {
        key: 'new-content-adoption-creation-week-proxy',
        name: 'New content: who came back after the first week',
        description:
            'Content created in the selected period, with the people who viewed it in its first seven days and how many of them viewed it again later. Came back later is blank until the content is a week old.',
        explore: 'content_reach',
        dimensions: [
            'content_reach_content_name',
            'content_reach_content_type_name',
            'content_reach_content_created_at_day',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_first_week_viewers',
            'content_reach_first_week_returning_viewers',
        ],
        tableCalculations: newContentCalculations,
        // The plain table shows the count behind the blank; the calculation replaces it
        hiddenColumns: ['content_reach_first_week_returning_viewers'],
        fieldLabels: {
            content_reach_first_week_viewers: 'Viewers in first week',
        },
        limit: 30,
        sorts: [
            {
                fieldId: 'content_reach_first_week_viewers',
                descending: true,
            },
        ],
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: 'content_reach_content_name',
                metric: [
                    'content_reach_first_week_viewers',
                    cameBack,
                    cameBackShare,
                ],
            },
            optionValues: {
                showMiniBars: true,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Content',
                valueNames:
                    'Viewers in first week,Came back later,Share who came back (%)',
            },
            query: {
                // The day it was created is what the calculations check its age against
                dimensions: [
                    'content_reach_content_name',
                    'content_reach_content_created_at_day',
                ],
                metrics: [
                    'content_reach_first_week_viewers',
                    'content_reach_first_week_returning_viewers',
                ],
                sorts: [
                    {
                        fieldId: 'content_reach_first_week_viewers',
                        descending: true,
                    },
                ],
                limit: 30,
                tableCalculations: newContentCalculations,
                description:
                    'Content created in the selected period, with the people who viewed it in its first seven days and how many of them viewed it again later. Came back later is blank until the content is a week old.',
            },
        },
    },
    {
        // A running total reads well however little content there is: it only ever rises, where bars
        // for each month are a few uneven columns on a small instance
        key: 'content-creation-by-month',
        name: 'Content over time',
        description:
            'Charts, dashboards and data apps in the latest inventory, added up week by week from the day each was created. Includes deleted items; the date filter does not apply.',
        explore: 'content_created',
        dimensions: [week],
        metrics: ['content_health_total_content'],
        filters: [
            {
                field: week,
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        tableCalculations: [
            {
                name: runningTotal,
                displayName: 'Content',
                type: TableCalculationType.NUMBER,
                sql: `SUM(\${content_health.total_content}) OVER (ORDER BY \${content_health.created_at_week})`,
                format: { type: CustomFormatType.NUMBER, round: 0 },
            },
        ],
        limit: 5000,
        sorts: [{ fieldId: week, descending: false }],
        visualization: 'line',
        xField: week,
        yFields: [runningTotal],
        fieldLabels: { [week]: 'Week', [runningTotal]: 'Content' },
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.3',
            fieldMapping: {
                x: week,
                m1: runningTotal,
                splitBy: 'content_health_content_type_name',
            },
            optionValues: {
                seriesType: 'area',
                stack: 'normal',
                splitSort: 'total',
                xAxisType: 'time',
                xTimeFormat: '{MMM} {yyyy}',
                xName: 'Week',
                yName: 'Content',
            },
            query: {
                dimensions: [week, 'content_health_content_type_name'],
                metrics: ['content_health_total_content'],
                sorts: [
                    {
                        fieldId: 'content_health_content_type_name',
                        descending: false,
                    },
                    { fieldId: week, descending: false },
                ],
                limit: 5000,
                tableCalculations: [
                    {
                        name: runningTotal,
                        displayName: 'Content',
                        type: TableCalculationType.NUMBER,
                        sql: `SUM(\${content_health.total_content}) OVER (PARTITION BY \${content_health.content_type_name} ORDER BY \${content_health.created_at_week})`,
                        format: { type: CustomFormatType.NUMBER, round: 0 },
                    },
                ],
                description:
                    'Charts, dashboards and data apps in the latest inventory by type, added up week by week from the day each was created. Includes deleted items; the date filter does not apply.',
            },
        },
    },
    // One count for each activity status, above the list a reader opens to see the items
    ...(
        [
            [
                'content-with-activity',
                'Has recorded activity',
                'Activity observed',
                'Charts, dashboards and data apps with at least one recorded view, query or load.',
            ],
            [
                'content-without-activity-in-use',
                'No recorded activity, still in use',
                'No activity observed; known dependency',
                'Content with no recorded activity that a dashboard tile or a switched-on schedule still uses.',
            ],
            [
                'content-without-activity',
                'No recorded activity',
                'No activity observed; coverage incomplete',
                'Content with no recorded activity and nothing known to use it, which is not proof it is safe to delete.',
            ],
        ] as const
    ).map(
        ([key, name, status, description]): UsageChartSpec => ({
            key,
            name,
            description: `${description} ${allHistory}`,
            explore: 'content_health',
            dimensions: [],
            metrics: ['content_health_total_content'],
            filters: [
                { field: 'content_health_activity_status', values: [status] },
            ],
            limit: 1,
            sorts: [],
            visualization: 'number',
        }),
    ),
    ranking({
        key: 'review-candidates-activity-and-known-dependencies',
        name: 'Content to review, by activity status',
        description: `Content with no recorded activity, with the schedules and dashboards that still use it. ${allHistory}`,
        explore: 'content_health',
        by: 'content_health_activity_status_name',
        then: 'content_health_content_name',
        dimensions: [
            'content_health_activity_status_name',
            'content_health_content_name',
            'content_health_content_type_name',
            'content_health_is_deleted_name',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_content',
            'content_health_total_enabled_schedules',
            'content_health_total_dashboard_references',
        ],
        filters: [
            {
                field: 'content_health_activity_status',
                values: [
                    'No activity observed; known dependency',
                    'No activity observed; coverage incomplete',
                ],
            },
        ],
        limit: 200,
        fieldLabels: {
            content_health_total_content: 'Items',
            content_health_total_enabled_schedules: 'Schedules switched on',
            content_health_total_dashboard_references: 'Dashboards using it',
        },
        libraryDescription: `Content with no recorded activity, by status; open a status to see its items and what still uses them. ${allHistory}`,
    }),
    ranking({
        key: 'content-ownership-current-snapshot',
        name: 'Content ownership (current)',
        description:
            'Owner status reflects current Lightdash membership, not whether the person is still employed. Schedule ownership is not fully recorded.',
        explore: 'content_inventory',
        by: 'content_health_owner_status_name',
        then: 'content_health_content_type_name',
        dimensions: ['content_health_owner_status_name'],
        metrics: ['content_health_total_content'],
        limit: 30,
        // Drawn as a donut: see withAnalyticsChartPresentation
        visualization: 'bar',
        libraryDescription:
            'Content by the status of its owner; open a status to see each type of content. Owner status reflects current Lightdash membership, not whether the person is still employed.',
    }),
    ranking({
        key: 'content-owners-needing-review',
        name: 'Dashboards with a missing or inactive owner',
        description: `Dashboards whose owner is deactivated, not a member, unknown or not set, most-viewed first. ${allHistory}`,
        explore: 'content_health',
        by: 'content_health_owner_status_name',
        then: 'content_health_content_name',
        dimensions: [
            'content_health_owner_status_name',
            'content_health_content_name',
            'content_health_content_type_name',
            'content_health_owner_name',
            'content_health_last_viewed_at_day',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_observed_views',
            'content_health_total_content',
        ],
        filters: [
            {
                field: 'content_health_owner_status',
                // Charts, SQL charts and data apps have no owner, so they are not missing one
                values: ['Active organization member', 'Not recorded'],
                operator: FilterOperator.NOT_EQUALS,
            },
        ],
        limit: 200,
        fieldLabels: {
            content_health_total_observed_views: 'Views',
            content_health_total_content: 'Items',
            content_health_owner_name: 'Owner',
            content_health_last_viewed_at_day: 'Last viewed',
        },
        libraryDescription: `Dashboards whose owner is deactivated, not a member, unknown or not set, by owner status; open a status to see them, most-viewed first. ${allHistory}`,
    }),
    ranking({
        key: 'high-compute-dashboards-audience-versus-warehouse-time',
        name: 'Dashboards by warehouse time (top 25)',
        description:
            'Top 25 dashboards by warehouse execution time (s), across all recorded history. The date filter does not apply.',
        explore: 'content_health',
        by: 'content_health_content_name',
        dimensions: [
            'content_health_content_name',
            'content_health_observed_viewers',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_warehouse_execution_time_s',
            'content_health_total_observed_queries',
        ],
        filters: [
            { field: 'content_health_content_type', values: ['dashboard'] },
        ],
        limit: 25,
        libraryLimit: 25,
        fieldLabels: { content_health_content_name: 'Dashboard' },
        visualization: 'scatter',
        xField: 'content_health_observed_viewers',
        yFields: ['content_health_total_warehouse_execution_time_s'],
        libraryDescription: `Top 25 dashboards by warehouse execution time (s), with the queries they ran. ${allHistory}`,
    }),
];

export const contentDashboardSpec: UsageDashboardSpec = {
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
                        'People who viewed content, alongside views. Reloads add views, and views served from the browser cache are not counted.',
                    charts: [
                        'content-viewers-latest-day',
                        'content-views',
                        'verified-content-audience-share',
                    ],
                },
                {
                    title: 'Views by type',
                    description: '',
                    note: false,
                    charts: ['content-views-by-type-and-day'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Viewers by content',
                    description: '',
                    note: false,
                    charts: [
                        'content-reach-distinct-people-not-just-views',
                        'who-visited-which-dashboard',
                    ],
                    layout: 'row',
                    rowHeight: 9,
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
                        'People who viewed new content in its first seven days and came back later are a sign of adoption. Content created before the selected period is not listed.',
                    charts: ['new-content-adoption-creation-week-proxy'],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    title: 'Content over time',
                    description: '',
                    note: false,
                    charts: ['content-creation-by-month'],
                    layout: 'row',
                    rowHeight: 7,
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
                        'No recorded activity is not proof that an item is safe to delete. Known dependencies are current dashboard tiles and enabled schedules.',
                    charts: [
                        'content-with-activity',
                        'content-without-activity-in-use',
                        'content-without-activity',
                    ],
                },
                {
                    title: 'Review candidates',
                    description: '',
                    note: false,
                    charts: [
                        'review-candidates-activity-and-known-dependencies',
                    ],
                    layout: 'row',
                    rowHeight: 8,
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
                        'Only dashboards have an owner; charts, SQL charts and data apps do not, so there is nothing to fix for those. Give a new owner to the dashboards listed below, whose owner is deactivated, not a member or missing.',
                    charts: ['content-ownership-current-snapshot'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Content to review',
                    description: '',
                    note: false,
                    charts: ['content-owners-needing-review'],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    title: 'Audience and execution time',
                    description:
                        'Time the warehouse spent running queries. The same execution time can be attributed to both a chart and a dashboard.',
                    charts: [
                        'high-compute-dashboards-audience-versus-warehouse-time',
                    ],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
    ],
};
