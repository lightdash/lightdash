import { FilterOperator, MetricType, type Metric } from '@lightdash/common';

export type SystemMetricDefinition = Pick<
    Metric,
    'name' | 'description' | 'percentile' | 'filters'
> & {
    type: MetricType;
    column: string;
};

export const systemStreamMetrics: Record<
    | 'query_events'
    | 'ai_usage'
    | 'data_app_events'
    | 'export_events'
    | 'agent_steps'
    | 'mcp_tool_calls',
    SystemMetricDefinition[]
> = {
    mcp_tool_calls: [
        {
            name: 'total_mcp_calls',
            description: 'Captured MCP tool-call events, including errors',
            type: MetricType.COUNT,
            column: 'event_name',
        },
        {
            name: 'unique_users',
            description: 'Distinct registered users making MCP tool calls',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
    ],
    agent_steps: [
        {
            name: 'total_steps',
            description: 'Completed agent loop steps',
            type: MetricType.COUNT,
            column: 'event_name',
            filters: [
                {
                    id: 'agent-steps',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['ai_agent.step_completed'],
                },
            ],
        },
        {
            name: 'total_tool_calls',
            description: 'Completed agent tool calls, including failures',
            type: MetricType.COUNT,
            column: 'event_name',
            filters: [
                {
                    id: 'agent-tools',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['ai_agent.tool_call_completed'],
                },
            ],
        },
        {
            name: 'unique_users',
            description: 'Distinct users with agent activity',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
    ],
    export_events: [
        {
            name: 'total_downloads',
            description: 'Completed result exports; excludes starts and errors',
            type: MetricType.COUNT,
            column: 'event_name',
            filters: [
                {
                    id: 'completed-downloads',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['download_results.completed'],
                },
            ],
        },
        {
            name: 'total_csv_downloads',
            description:
                'Completed CSV result exports; excludes starts and errors',
            type: MetricType.COUNT,
            column: 'event_name',
            filters: [
                {
                    id: 'completed-csv-downloads',
                    target: { fieldRef: 'event_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['download_results.completed'],
                },
                {
                    id: 'csv-format',
                    target: { fieldRef: 'format' },
                    operator: FilterOperator.EQUALS,
                    values: ['csv'],
                },
            ],
        },
        {
            name: 'total_events',
            description:
                'Export lifecycle events, including retries; filter by event_name to count starts, completions or failures',
            type: MetricType.COUNT,
            column: 'event_name',
        },
        {
            name: 'unique_users',
            description: 'Distinct actors with export activity',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
    ],
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

/** Reuse event metric filters so totals and per-user reports have the same meaning. */
export const userActivityMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_events',
        description:
            'Captured events across all streams, including lifecycle events and automated activity',
        type: MetricType.SUM,
        column: 'event_count',
    },
    {
        name: 'unique_users',
        description:
            'Distinct identified users with captured activity; excludes anonymous events',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
    },
    {
        name: 'total_queries',
        description: 'Queries executed, including failed and automated queries',
        type: MetricType.SUM,
        column: 'query_count',
    },
    ...(
        [
            'ai_usage',
            'export_events',
            'data_app_events',
            'agent_steps',
            'mcp_tool_calls',
        ] as const
    ).flatMap((stream) =>
        systemStreamMetrics[stream]
            .filter(
                (metric) =>
                    metric.name !== 'total_events' &&
                    metric.type !== MetricType.COUNT_DISTINCT,
            )
            .map((metric) => ({
                ...metric,
                name:
                    metric.name === 'total_views'
                        ? 'total_data_app_views'
                        : metric.name,
                type: MetricType.SUM,
                column:
                    metric.type === MetricType.COUNT
                        ? 'event_count'
                        : metric.column,
                filters: [
                    ...(metric.filters ?? []),
                    {
                        id: `${stream}-${metric.name}`,
                        target: { fieldRef: 'stream' },
                        operator: FilterOperator.EQUALS,
                        values: [stream],
                    },
                ],
            })),
    ),
];
