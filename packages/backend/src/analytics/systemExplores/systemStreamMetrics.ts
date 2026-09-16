import { FilterOperator, MetricType, type Metric } from '@lightdash/common';

type SystemMetricDefinition = Pick<
    Metric,
    'name' | 'description' | 'percentile' | 'filters'
> & {
    type: MetricType;
    column: string;
};

export const systemStreamMetrics: Record<
    'query_events' | 'ai_usage' | 'data_app_events',
    SystemMetricDefinition[]
> = {
    data_app_events: [
        {
            name: 'total_events',
            description: 'Total number of data app activity events',
            type: MetricType.COUNT,
            column: 'event_name',
        },
        {
            name: 'total_views',
            description:
                'Data app HTML loads, including builder previews and reloads',
            type: MetricType.COUNT,
            column: 'event_name',
            filters: [
                {
                    id: 'data-app-views',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['data_app.view'],
                },
            ],
        },
        {
            name: 'unique_viewers',
            description: 'Distinct users with a data app view event',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
            filters: [
                {
                    id: 'data-app-viewers',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['data_app.view'],
                },
            ],
        },
        {
            name: 'unique_apps',
            description: 'Distinct data apps with any activity event',
            type: MetricType.COUNT_DISTINCT,
            column: 'app_id',
        },
    ],
    query_events: [
        {
            name: 'total_queries',
            description: 'Total number of queries executed',
            type: MetricType.COUNT,
            column: 'query_id',
        },
        {
            name: 'unique_users',
            description: 'Number of distinct users',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
        {
            name: 'avg_warehouse_execution_time_ms',
            description: 'Average warehouse execution time in milliseconds',
            type: MetricType.AVERAGE,
            column: 'warehouse_execution_time_ms',
        },
        {
            name: 'p90_warehouse_execution_time_ms',
            description:
                '90th percentile warehouse execution time in milliseconds',
            type: MetricType.PERCENTILE,
            column: 'warehouse_execution_time_ms',
            percentile: 90,
        },
    ],
    ai_usage: [
        {
            name: 'total_ai_calls',
            description: 'Total number of AI model calls',
            type: MetricType.COUNT,
            column: 'event_name',
        },
        {
            name: 'unique_users',
            description: 'Number of distinct users',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
        {
            name: 'total_tokens_used',
            description: 'Total tokens used across all AI model calls',
            type: MetricType.SUM,
            column: 'total_tokens',
        },
        {
            name: 'total_input_tokens',
            description: 'Total input (prompt) tokens',
            type: MetricType.SUM,
            column: 'input_tokens',
        },
        {
            name: 'total_output_tokens',
            description: 'Total output (completion) tokens',
            type: MetricType.SUM,
            column: 'output_tokens',
        },
        {
            name: 'total_cache_read_tokens',
            description: 'Total cached input tokens read',
            type: MetricType.SUM,
            column: 'cache_read_tokens',
        },
        {
            name: 'total_cache_write_tokens',
            description: 'Total cached input tokens written',
            type: MetricType.SUM,
            column: 'cache_write_tokens',
        },
        {
            name: 'total_reasoning_tokens',
            description: 'Total reasoning (thinking) tokens',
            type: MetricType.SUM,
            column: 'reasoning_tokens',
        },
    ],
};
