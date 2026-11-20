import {
    CustomFormatType,
    FilterOperator,
    TableCalculationType,
    UnitOfTime,
} from '@lightdash/common';
import type { UsageChartSpec } from './usageDashboardTypes';

const month = '${query_events.event_ts_month}';
export const monthLabel = 'month_label';
const previousMonth = `LAG(${month}) OVER (ORDER BY ${month})`;
const adjacentMonth = `date_diff('month', ${previousMonth}, ${month}) = 1`;

export const monthlyQueryComparisonCharts: UsageChartSpec[] = [
    {
        key: 'querying-users-month-over-month',
        name: 'People running queries by month',
        metric: 'unique_users',
        label: 'People',
        // Newest month first in the table
        newestFirst: true,
        description:
            'People who ran a query in each month, including service accounts. Queries with no user ID are left out. A person who ran queries on several days counts once for the month. ∅ means there is no data for the month before, or it was zero. Months with no data are left out.',
    },
    {
        key: 'queries-run-month-over-month',
        name: 'Queries run by month',
        metric: 'total_queries',
        label: 'Queries run',
        // Oldest month first, so the chart reads left to right
        newestFirst: false,
        description:
            'Completed query attempts, including cache hits and queries that failed during execution. Preview projects and queries that failed before execution are left out. The change axis stops at 200%, so a larger change runs off the top of the chart. ∅ means there is no data for the month before, or it was zero. Months with no data are left out.',
    },
].map(({ metric, label, newestFirst, ...spec }) => {
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
        sorts: [
            {
                fieldId: 'query_events_event_ts_month',
                descending: newestFirst,
            },
        ],
        limit: 12,
        fieldLabels: { [`query_events_${metric}`]: label },
        // The month is shown by its name ("Oct 2026"); the date itself only orders the rows
        hiddenColumns: ['query_events_event_ts_month'],
        columnOrder: [
            monthLabel,
            'query_events_event_ts_month',
            `query_events_${metric}`,
            'monthly_change',
            'monthly_change_percent',
        ],
        tableCalculations: [
            {
                name: monthLabel,
                displayName: 'Month (UTC)',
                type: TableCalculationType.STRING,
                sql: `strftime(${month}, '%b %Y')`,
            },
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
