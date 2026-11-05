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
        name: 'Querying users · month over month',
        metric: 'unique_users',
        label: 'Querying users',
        description:
            'Distinct recorded user IDs across each whole month, including service accounts. Missing user IDs are excluded. A person querying on several days counts once per month.',
    },
    {
        key: 'queries-run-month-over-month',
        name: 'Queries run · month over month',
        metric: 'total_queries',
        label: 'Queries run',
        description:
            'Recorded completed query attempts, including cache hits and execution errors. Excludes preview projects and failures before execution.',
    },
].map(({ metric, label, ...spec }) => {
    const value = `\${query_events.${metric}}`;
    const previous = `LAG(${value}) OVER (ORDER BY ${month})`;
    return {
        ...spec,
        description: `${spec.description} Last 12 completed UTC calendar months. Changes compare adjacent months only; missing history is not zero activity. Percentage change is unavailable when the previous value is zero. Capture and retention can leave months incomplete.`,
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
