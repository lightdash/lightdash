import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
    UnitOfTime,
} from '@lightdash/common';
import type { UsageChartSpec } from './usageDashboardTypes';

const month = '${query_events.event_ts_month}';
const previousMonth = `LAG(${month}) OVER (ORDER BY ${month})`;
const adjacentMonth = `date_diff('month', ${previousMonth}, ${month}) = 1`;

export const monthlyQueryComparisonCharts: UsageChartSpec[] = [
    {
        key: 'querying-users-month-over-month',
        name: 'Users running queries by month',
        metric: 'unique_users',
        label: 'Querying users',
        description:
            'Distinct user IDs that ran a query in each month, including service accounts. Queries with no user ID are left out. A user who queried on several days counts once for the month. ∅ means there is no data for the month before, or it was zero. Months with no data are left out.',
    },
    {
        key: 'queries-run-month-over-month',
        name: 'Queries run by month',
        metric: 'total_queries',
        label: 'Queries run',
        description:
            'Completed query attempts, including cache hits and queries that failed during execution. Preview projects and queries that failed before execution are left out. ∅ means there is no data for the month before, or it was zero. Months with no data are left out.',
    },
].map(({ metric, label, ...spec }) => {
    const value = `\${query_events.${metric}}`;
    const previous = `LAG(${value}) OVER (ORDER BY ${month})`;
    return {
        ...spec,
        explore: 'query_events',
        dimensions: ['query_events_event_ts_month'],
        metrics: [`query_events_${metric}`],
        filters: [
            {
                field: 'query_events_event_ts_raw',
                operator: FilterOperator.IN_THE_PAST,
                values: [12],
                settings: { unitOfTime: UnitOfTime.months, completed: true },
            },
        ],
        timezone: 'UTC',
        sorts: [{ fieldId: 'query_events_event_ts_month', descending: true }],
        limit: 12,
        fieldLabels: {
            query_events_event_ts_month: 'Month (UTC)',
            [`query_events_${metric}`]: label,
        },
        tableCalculations: [
            {
                name: 'monthly_change',
                displayName: 'Change vs previous month',
                type: TableCalculationType.NUMBER,
                sql: `CASE WHEN ${adjacentMonth} THEN ${value} - ${previous} END`,
                format: { type: CustomFormatType.NUMBER, round: 0 },
            },
            {
                name: 'monthly_change_percent',
                displayName: 'Change (%)',
                type: TableCalculationType.NUMBER,
                sql: `CASE WHEN ${adjacentMonth} THEN (${value} - ${previous}) * 1.0 / NULLIF(${previous}, 0) END`,
                format: { type: CustomFormatType.PERCENT, round: 1 },
            },
        ],
    };
});
