import { FilterOperator } from '@lightdash/common';
import { card, heatmapByDay, trend } from './chartBuilders';
import { peopleNoActivitySections } from './peopleNoActivityCharts';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

// The People dashboard: who is using Lightdash and who is not. It keeps the slug of the Adoption
// dashboard it grew out of, because Settings shows it on the Adoption tab where the Adoption data app
// is not available. A feature's own numbers live on that feature's dashboard; this one holds only
// counts of people across features, with one headline card for each main feature.

// The surfaces a person views a data app on: the same definition as the Data apps dashboard
const appViewingSurfaces: NonNullable<UsageChartSpec['filters']> = [
    {
        field: 'data_app_reach_view_context',
        values: ['standalone', 'dashboard'],
    },
];
const dashboardKey = 'lightdash-analytics-adoption';
const activityDay = 'user_activity_activity_date_day';

export const adoptionChartSpecs: UsageChartSpec[] = [
    card({
        key: 'adoption-active-people-latest-day',
        name: 'Active people',
        description:
            'People with any recorded activity on the latest day in the selected period, including scheduled and automated runs in their name. The same count as on Overview.',
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_unique_users',
        latestDay: true,
    }),
    card({
        key: 'adoption-dashboard-viewers-latest-day',
        name: 'People viewing dashboards',
        description:
            'People who viewed a dashboard on the latest day in the selected period. Content has the detail.',
        explore: 'content_reach',
        day: 'content_reach_event_ts_day',
        metric: 'content_reach_distinct_viewers',
        filters: [
            { field: 'content_reach_content_type', values: ['dashboard'] },
        ],
        latestDay: true,
    }),
    card({
        key: 'adoption-app-viewers-latest-day',
        name: 'People loading data apps',
        description:
            'People who loaded a data app from a standalone page or dashboard on the latest day in the selected period. The same count as Data app viewers on Data apps.',
        explore: 'data_app_reach',
        day: 'data_app_reach_event_ts_day',
        metric: 'data_app_reach_distinct_viewers',
        filters: appViewingSurfaces,
        latestDay: true,
    }),
    trend({
        key: 'adoption-active-people-day',
        name: 'Daily active people',
        description:
            'Distinct identified people with recorded activity each day. This is not a count of logins or the share of people with access.',
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_unique_users',
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
        fieldLabels: {
            user_activity_unique_users: 'Active people',
            user_activity_activity_date_week: 'Week',
        },
    }),
    heatmapByDay({
        key: 'adoption-activity-by-person-and-day',
        name: 'Recorded activity by person and day',
        description:
            'The 15 people with the most recorded activity in the selected period, leaving out activity with no person recorded. Recent activity does not mean a recent login.',
        explore: 'user_activity',
        day: activityDay,
        metric: 'user_activity_total_events',
        category: 'user_activity_user_name',
        identity: ['user_activity_user_id'],
        top: 15,
        filters: [
            {
                field: 'user_activity_user_id',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        titles: { category: 'Person', metric: 'Activities' },
    }),
];

export const adoptionDashboardSpec: UsageDashboardSpec = {
    key: dashboardKey,
    name: 'People',
    description: 'Who is using Lightdash, and who is not.',
    tabs: [
        {
            // Every tile here follows the Date filter
            key: 'active-people',
            name: 'Active people',
            sections: [
                {
                    title: 'How many people are using Lightdash?',
                    description:
                        'People on the latest day of the selected period, in all and by the two main things they open. Each feature has its own dashboard.',
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
            ],
        },
        {
            // Nothing here follows the Date filter: these are states, not periods
            key: 'inactive',
            name: 'People who have not used Lightdash',
            sections: peopleNoActivitySections,
        },
    ],
};
