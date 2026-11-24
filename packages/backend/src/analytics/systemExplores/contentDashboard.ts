import {
    CustomFormatType,
    FilterOperator,
    ProjectType,
    TableCalculationType,
} from '@lightdash/common';
import { caution, positive, waiting } from './analyticsChartPresentation';
import { ownerStatusColors } from './analyticsColorPalette';
import { card, numberCard, ranking, stackedByDay } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const day = 'content_reach_event_ts_day';
const allHistory = 'Uses all recorded history; the date filter does not apply.';

const week = 'content_health_created_at_week';
const runningTotal = 'content_running_total';
// Text columns of the two lists an admin acts on
const whereItLives = {
    name: 'where_it_lives',
    displayName: 'Where',
    type: TableCalculationType.STRING,
    // The project, and the space when the inventory has it: two items can share a name
    sql: `concat_ws(' / ', \${content_health.project_name}, \${content_health.space_name})`,
};
const createdOn = {
    name: 'created_on',
    displayName: 'Created',
    type: TableCalculationType.STRING,
    sql: `COALESCE(strftime(\${content_health.created_at_day}, '%b %-d, %Y'), 'Not recorded')`,
};

const cameBack = 'came_back_later';
const cameBackShare = 'came_back_share';

const newContentCalculations: NonNullable<UsageChartSpec['tableCalculations']> =
    [
        {
            // Nobody can have come back after the first week while it is still running
            name: cameBack,
            displayName: 'Came back later',
            type: TableCalculationType.NUMBER,
            sql: `CASE WHEN \${content_reach.created_at_day} > CURRENT_DATE - INTERVAL 7 DAY THEN NULL ELSE \${content_reach.new_content_returning_viewers} END`,
            format: { type: CustomFormatType.NUMBER, round: 0 },
        },
        {
            name: cameBackShare,
            displayName: 'Share who came back',
            type: TableCalculationType.NUMBER,
            // A fraction with a percent format, so the table writes it as 42%
            sql: `CASE WHEN \${content_reach.created_at_day} > CURRENT_DATE - INTERVAL 7 DAY THEN NULL ELSE 1.0 * \${content_reach.new_content_returning_viewers} / NULLIF(\${content_reach.new_content_first_week_viewers}, 0) END`,
            format: { type: CustomFormatType.PERCENT, round: 0 },
        },
    ];

// Charts and dashboards created in the selected period. Overview repeats this card, so both are built
// here: the same measure, filters and window under two keys.
export const contentCreated = {
    name: 'Content created',
    description:
        'Charts and dashboards created in the selected period, including deleted ones. Content in preview projects is left out; Overview and Content show the same count.',
    // The model with a row for every day, so the trend has a point on days with nothing created
    explore: 'content_created' as const,
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
    ] satisfies NonNullable<UsageChartSpec['filters']> as NonNullable<
        UsageChartSpec['filters']
    >,
};

// Charts of the Content dashboard. The verified share and the review list stay with the plain charts in
// usageDashboardCharts.ts.
export const contentChartSpecs: UsageChartSpec[] = [
    card({ key: 'content-created-in-period', ...contentCreated }),
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
            'content_reach_created_at_day',
            'content_reach_content_id',
            'content_reach_project_id',
        ],
        metrics: [
            'content_reach_new_content_first_week_viewers',
            'content_reach_new_content_returning_viewers',
        ],
        tableCalculations: newContentCalculations,
        // The plain table shows the count behind the blank; the calculation replaces it
        hiddenColumns: ['content_reach_new_content_returning_viewers'],
        fieldLabels: {
            content_reach_new_content_first_week_viewers:
                'Viewers in first week',
        },
        limit: 30,
        sorts: [
            {
                fieldId: 'content_reach_new_content_first_week_viewers',
                descending: true,
            },
        ],
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.14.2',
            fieldMapping: {
                rowDimension: 'content_reach_content_name',
                metric: [
                    'content_reach_new_content_first_week_viewers',
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
                    'Viewers in first week,Came back later,Share who came back',
                useFieldFormats: true,
            },
            query: {
                // The day it was created is what the calculations check its age against
                dimensions: [
                    'content_reach_content_name',
                    'content_reach_created_at_day',
                ],
                metrics: [
                    'content_reach_new_content_first_week_viewers',
                    'content_reach_new_content_returning_viewers',
                ],
                sorts: [
                    {
                        fieldId: 'content_reach_new_content_first_week_viewers',
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
        name: 'Content, running total by week',
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
                // The day as well as the month: a tick for each week would repeat the month's name
                xTimeFormat: '{MMM} {d}',
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
                'content_health_content_with_activity',
                'Charts, dashboards and data apps with at least one recorded view, query or load.',
                'Viewed, queried or loaded at least once',
                positive,
            ],
            [
                'content-without-activity-in-use',
                'No recorded activity, still in use',
                'content_health_content_in_use_without_activity',
                'Content with no recorded activity that a dashboard tile or a switched-on schedule still uses.',
                'On a dashboard or a schedule that is switched on',
                waiting,
            ],
            [
                'content-without-activity',
                'No recorded activity',
                'content_health_content_without_activity',
                'Content with no recorded activity and nothing known to use it, which is not proof it is safe to delete.',
                'Nothing known uses it',
                caution,
            ],
        ] as const
    ).map(
        ([key, name, metric, description, meaning, color]): UsageChartSpec => ({
            key,
            name,
            description: `${description} ${allHistory}`,
            explore: 'content_health',
            dimensions: [],
            // The count for this status, then all content: the whole the card's bar measures against
            metrics: [metric, 'content_health_total_content'],
            limit: 1,
            sorts: [],
            visualization: 'number',
            yFields: [metric],
            libraryChart: numberCard(metric, meaning, {
                whole: 'content_health_total_content',
                wholeLabel: 'of {target} items',
                color,
                // The items with nothing known to use them are the ones an admin acts on
                strong: color === caution,
            }),
        }),
    ),
    {
        // A list to act on: one row for each item, the ones nothing uses first and the oldest of those
        // at the top. Text columns, so it is a plain table in both versions.
        key: 'review-candidates-activity-and-known-dependencies',
        name: 'Never viewed: what could be cleaned up?',
        // Two ideas kept apart: nobody has opened any of these, and some are still pointed at
        description:
            'Up to 200 items nobody has viewed, queried or loaded in all recorded history, oldest first. Still linked from says whether a dashboard or a schedule still points at the item, which is a reason to keep it.',
        explore: 'content_health',
        dimensions: [
            'content_health_content_name',
            'content_health_content_type_name',
            'content_health_project_name',
            'content_health_space_name',
            'content_health_created_at_day',
            'content_health_activity_status',
            // What can point at an item depends on what it is
            'content_health_content_type',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: [
            'content_health_total_dashboard_references',
            'content_health_total_enabled_schedules',
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
        tableCalculations: [
            whereItLives,
            createdOn,
            {
                // Not who viewed it: what still points at it. A chart can sit on dashboards and be
                // sent by schedules; a dashboard can only be sent by schedules.
                name: 'linked_from',
                displayName: 'Still linked from',
                type: TableCalculationType.STRING,
                sql: `CASE WHEN \${content_health.content_type} = 'dashboard' THEN COALESCE(CASE WHEN COALESCE(\${content_health.total_enabled_schedules}, 0) = 1 THEN '1 schedule' WHEN COALESCE(\${content_health.total_enabled_schedules}, 0) > 1 THEN CAST(COALESCE(\${content_health.total_enabled_schedules}, 0) AS VARCHAR) || ' schedules' END, 'No schedule') WHEN COALESCE(\${content_health.total_dashboard_references}, 0) = 0 AND COALESCE(\${content_health.total_enabled_schedules}, 0) = 0 THEN 'No dashboard or schedule' ELSE concat_ws(', ', CASE WHEN COALESCE(\${content_health.total_dashboard_references}, 0) = 1 THEN '1 dashboard' WHEN COALESCE(\${content_health.total_dashboard_references}, 0) > 1 THEN CAST(COALESCE(\${content_health.total_dashboard_references}, 0) AS VARCHAR) || ' dashboards' END, CASE WHEN COALESCE(\${content_health.total_enabled_schedules}, 0) = 1 THEN '1 schedule' WHEN COALESCE(\${content_health.total_enabled_schedules}, 0) > 1 THEN CAST(COALESCE(\${content_health.total_enabled_schedules}, 0) AS VARCHAR) || ' schedules' END) END`,
            },
            {
                // Items nothing uses first
                name: 'review_order',
                displayName: 'Order',
                type: TableCalculationType.NUMBER,
                sql: `CASE WHEN \${content_health.activity_status} = 'No activity observed; coverage incomplete' THEN 0 ELSE 1 END`,
            },
        ],
        hiddenColumns: [
            'content_health_project_name',
            'content_health_space_name',
            'content_health_created_at_day',
            'content_health_activity_status',
            'content_health_content_type',
            'content_health_total_dashboard_references',
            'content_health_total_enabled_schedules',
            'review_order',
        ],
        columnOrder: [
            'content_health_content_name',
            'content_health_content_type_name',
            whereItLives.name,
            createdOn.name,
            'linked_from',
            'content_health_project_name',
            'content_health_space_name',
            'content_health_created_at_day',
            'content_health_activity_status',
            'content_health_content_type',
            'content_health_content_id',
            'content_health_project_id',
            'content_health_total_dashboard_references',
            'content_health_total_enabled_schedules',
            'review_order',
        ],
        limit: 200,
        sorts: [
            { fieldId: 'review_order', descending: false },
            { fieldId: 'content_health_created_at_day', descending: false },
            { fieldId: 'content_health_content_name', descending: false },
        ],
        fieldLabels: {
            content_health_content_name: 'Content',
            content_health_content_type_name: 'Type',
        },
    },
    {
        ...ranking({
            key: 'content-ownership-current-snapshot',
            name: 'Dashboard ownership',
            description:
                'Dashboards by the status of their owner. Owner status reflects current Lightdash membership, not whether the person is still employed.',
            explore: 'content_inventory',
            by: 'content_health_owner_status_name',
            dimensions: ['content_health_owner_status_name'],
            metrics: ['content_health_total_content'],
            // Only dashboards have an owner
            filters: [
                { field: 'content_health_content_type', values: ['dashboard'] },
            ],
            limit: 30,
            // Drawn as a donut: see withAnalyticsChartPresentation
            visualization: 'bar',
            fieldLabels: { content_health_total_content: 'Dashboards' },
            libraryDescription:
                'Dashboards by the status of their owner. Owner status reflects current Lightdash membership, not whether the person is still employed.',
        }),
        // A few statuses: one bar each, with the count beside it
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.6',
            fieldMapping: {
                x: 'content_health_owner_status_name',
                m1: 'content_health_total_content',
            },
            optionValues: {
                seriesType: 'bar',
                orientation: 'horizontal',
                m1Name: 'Dashboards',
                showDataLabels: true,
                lightdashLabels: false,
                showAxisTitles: false,
                showLegend: false,
                yIntegerTicks: true,
                // One colour for each status, by its name
                splitColorGroups: Object.entries(ownerStatusColors)
                    .map(([name, color]) => `${name}=${name}=${color}`)
                    .join(';'),
            },
            query: null,
        },
    },
    {
        // One row for each dashboard to fix, most-viewed first: a plain table in both versions
        key: 'content-owners-needing-review',
        name: 'Which dashboards need a new owner?',
        description: `Up to 200 dashboards whose owner is deactivated, not a member, unknown or not set, most-viewed first. ${allHistory}`,
        explore: 'content_health',
        dimensions: [
            'content_health_content_name',
            'content_health_project_name',
            'content_health_space_name',
            'content_health_owner_name',
            'content_health_owner_status',
            'content_health_last_viewed_at_day',
            'content_health_content_id',
            'content_health_project_id',
        ],
        metrics: ['content_health_total_observed_views'],
        filters: [
            {
                field: 'content_health_owner_status',
                // Charts, SQL charts and data apps have no owner, so they are not missing one
                values: ['Active organization member', 'Not recorded'],
                operator: FilterOperator.NOT_EQUALS,
            },
        ],
        tableCalculations: [
            whereItLives,
            {
                name: 'owner_shown',
                displayName: 'Owner',
                type: TableCalculationType.STRING,
                sql: `CASE \${content_health.owner_status} WHEN 'Unassigned' THEN 'No owner' WHEN 'Deactivated' THEN COALESCE(\${content_health.owner_name}, 'Unknown person') || ' (deactivated)' WHEN 'Not an organization member' THEN COALESCE(\${content_health.owner_name}, 'Unknown person') || ' (not a member)' ELSE 'Unknown owner' END`,
            },
            {
                name: 'last_viewed',
                displayName: 'Last viewed',
                type: TableCalculationType.STRING,
                sql: `COALESCE(strftime(\${content_health.last_viewed_at_day}, '%b %-d, %Y'), 'Never')`,
            },
        ],
        hiddenColumns: [
            'content_health_project_name',
            'content_health_space_name',
            'content_health_owner_name',
            'content_health_owner_status',
            'content_health_last_viewed_at_day',
        ],
        columnOrder: [
            'content_health_content_name',
            whereItLives.name,
            'owner_shown',
            'last_viewed',
            'content_health_total_observed_views',
            'content_health_project_name',
            'content_health_space_name',
            'content_health_owner_name',
            'content_health_owner_status',
            'content_health_last_viewed_at_day',
            'content_health_content_id',
            'content_health_project_id',
        ],
        limit: 200,
        sorts: [
            {
                fieldId: 'content_health_total_observed_views',
                descending: true,
            },
            { fieldId: 'content_health_content_name', descending: false },
        ],
        fieldLabels: {
            content_health_content_name: 'Dashboard',
            content_health_total_observed_views: 'Views',
        },
    },
];

export const contentDashboardSpec: UsageDashboardSpec = {
    key: 'lightdash-analytics-content',
    name: 'Content',
    description: 'What content is read, what exists and who owns it.',
    tabs: [
        {
            // Everything here follows the Date filter
            key: 'audience',
            name: 'Audience',
            sections: [
                {
                    title: 'Content audience',
                    description:
                        'People who viewed content, alongside views. Reloads add views, and views served from the browser cache are not counted.',
                    charts: [
                        'content-viewers-latest-day',
                        'content-views',
                        'verified-content-audience-share',
                        'content-created-in-period',
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
                {
                    title: 'New content',
                    description:
                        'People who viewed new content in its first seven days and came back later are a sign of adoption. Content created before the selected period is not listed.',
                    charts: ['new-content-adoption-creation-week-proxy'],
                    layout: 'row',
                    rowHeight: 8,
                },
            ],
        },
        {
            // Nothing here follows the Date filter: it is the content that exists now, over all history
            key: 'inventory',
            name: 'Inventory & clean-up',
            sections: [
                {
                    title: 'All content, whatever the Date filter says',
                    description:
                        'These tiles cover all recorded history. No recorded activity is not proof that an item is safe to delete: a dashboard tile or a schedule may still use it.',
                    charts: [
                        'content-with-activity',
                        'content-without-activity-in-use',
                        'content-without-activity',
                    ],
                    // One compact row of cards
                    layout: 'row',
                    rowHeight: 3,
                },
                {
                    // No text between the cards and the list: the list's title is its question
                    title: 'What could be cleaned up?',
                    description: '',
                    note: false,
                    charts: [
                        'review-candidates-activity-and-known-dependencies',
                    ],
                    layout: 'row',
                    // About ten rows, more by scrolling
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
            key: 'ownership',
            name: 'Ownership',
            sections: [
                {
                    title: 'Who owns the dashboards today',
                    description:
                        'The latest snapshot, whatever the Date filter says. Only dashboards have an owner: give a new one to those listed here.',
                    // A bar for each owner status, then the dashboards to fix, full width
                    charts: ['content-ownership-current-snapshot'],
                    layout: 'row',
                    rowHeight: 4,
                },
                {
                    title: 'Dashboards to fix',
                    description: '',
                    note: false,
                    charts: ['content-owners-needing-review'],
                    layout: 'row',
                    // About eight rows with no blank band under them, more by scrolling
                    rowHeight: 6,
                },
            ],
        },
    ],
};
