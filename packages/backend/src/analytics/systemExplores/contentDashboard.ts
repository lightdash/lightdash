import { card, ranking, stackedByDay } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const day = 'content_reach_event_ts_day';
const allHistory = 'Uses all recorded history; the date filter does not apply.';

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
        splitBy: 'content_reach_content_type',
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
            'content_reach_content_type',
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
    ranking({
        key: 'new-content-adoption-creation-week-proxy',
        name: 'New content adoption after the first week',
        description:
            'Creation date stands in for launch date. Return activity after the first seven days only shows when enough history has been recorded. Older content may have been created before recording began.',
        explore: 'content_reach',
        by: 'content_reach_content_name',
        dimensions: [
            'content_reach_content_name',
            'content_reach_content_created_at_day',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_distinct_viewers',
            'content_reach_first_week_returning_viewers',
        ],
        limit: 30,
        libraryLimit: 30,
    }),
    stackedByDay({
        key: 'content-creation-by-month',
        name: 'Content created by month',
        description:
            'Items in the latest inventory by the month they were created, including deleted items (recoverable). This is not a full history of all content. The date filter does not apply.',
        explore: 'content_inventory',
        day: 'content_health_created_at_month',
        metric: 'content_health_total_content',
        splitBy: 'content_health_content_type',
        yName: 'Content created',
        xAxis: {
            xAxisType: 'time',
            xTimeFormat: '{MMM} {yyyy}',
            xName: 'Month',
        },
        splitDescription:
            'Items in the latest inventory by the month they were created and their type, including deleted items (recoverable). This is not a full history of all content. The date filter does not apply.',
    }),
    ranking({
        key: 'content-by-activity-status',
        name: 'Content by activity status',
        description: `Charts, dashboards and data apps by whether they have any recorded activity. ${allHistory}`,
        explore: 'content_health',
        by: 'content_health_activity_status',
        then: 'content_health_content_type',
        metrics: ['content_health_total_content'],
        libraryDescription: `Charts, dashboards and data apps by whether they have any recorded activity. Open a status to see each type of content. ${allHistory}`,
    }),
    ranking({
        key: 'content-ownership-current-snapshot',
        name: 'Content ownership (current)',
        description:
            'Owner status reflects current Lightdash membership, not whether the person is still employed. Schedule ownership is not fully recorded.',
        explore: 'content_inventory',
        by: 'content_health_owner_status',
        then: 'content_health_content_type',
        dimensions: ['content_health_owner_status'],
        metrics: ['content_health_total_content'],
        limit: 30,
        // Drawn as a donut: see withAnalyticsChartPresentation
        visualization: 'bar',
        libraryDescription:
            'Content by the status of its owner. Open a status to see each type of content. Owner status reflects current Lightdash membership, not whether the person is still employed.',
    }),
    ranking({
        key: 'high-compute-dashboards-audience-versus-warehouse-time',
        name: 'Dashboards by warehouse time (top 25)',
        description:
            'Top 25 dashboards by warehouse execution time (ms), across all recorded history. The date filter does not apply. Each point is a dashboard; open the underlying results to see names.',
        explore: 'content_health',
        by: 'content_health_content_name',
        dimensions: [
            'content_health_content_name',
            'content_health_observed_viewers',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_warehouse_execution_time_ms',
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
        yFields: ['content_health_total_warehouse_execution_time_ms'],
        libraryDescription: `Top 25 dashboards by warehouse execution time (ms), with the queries they ran. ${allHistory}`,
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
                        'People who viewed content in its first seven days and came back later are a sign of adoption. Counts include deleted items.',
                    charts: ['new-content-adoption-creation-week-proxy'],
                    layout: 'row',
                    rowHeight: 8,
                },
                {
                    title: 'Content created',
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
                    charts: ['content-by-activity-status'],
                    layout: 'row',
                    rowHeight: 6,
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
                        'Owner status comes from current Lightdash membership. Content with a missing or inactive owner needs review.',
                    charts: ['content-ownership-current-snapshot'],
                    layout: 'row',
                    rowHeight: 7,
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
