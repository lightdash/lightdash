import { FilterOperator, MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const toolActivityColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'user_id',
        'agent_id',
        'source',
        'tool_call_id',
        'actor_id',
        'actor_type',
        'tool_name',
        'status',
        'client_name',
        'client_version',
        'auth_type',
        'session_id',
        'prompt_id',
        'thread_id',
        'query_id',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'duration_ms', type: 'BIGINT' },
];

// Read the original tool records once; loop steps are not tool invocations.
// Stable identities deduplicate redelivery, not separate attempts. Legacy
// records without an identity are retained rather than guessed to be duplicates.
export const toolActivitySql = `(SELECT * FROM (
    SELECT org_id, project_id, user_id, agent_id, event_ts,
        'mcp' AS source, tool_call_id, actor_id, actor_type, tool_name,
        status, duration_ms, client_name, client_version, auth_type, session_id,
        NULL::VARCHAR AS prompt_id, NULL::VARCHAR AS thread_id, query_id
    FROM mcp_tool_calls
    UNION ALL
    SELECT org_id, project_id, user_id, agent_id, event_ts,
        'agent' AS source, tool_call_id, user_id AS actor_id,
        'unknown' AS actor_type, tool_name,
        CASE tool_status WHEN 'success' THEN 'success' WHEN 'error' THEN 'error'
            ELSE 'unknown' END AS status,
        tool_duration_ms AS duration_ms, NULL::VARCHAR AS client_name,
        NULL::VARCHAR AS client_version, NULL::VARCHAR AS auth_type,
        NULL::VARCHAR AS session_id, prompt_id, thread_id,
        NULL::VARCHAR AS query_id
    FROM (SELECT * FROM agent_steps UNION ALL BY NAME
        SELECT NULL::VARCHAR AS tool_status WHERE false) agent_calls
    WHERE record_type = 'tool_call'
) calls
QUALIFY tool_call_id IS NULL OR ROW_NUMBER() OVER (
    PARTITION BY org_id, source, prompt_id, tool_call_id ORDER BY event_ts
) = 1)`;

export const toolActivityMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_calls',
        description:
            'Observed tool invocations, including failures; stable call IDs deduplicate redelivery',
        type: MetricType.COUNT,
        column: 'source',
    },
    {
        name: 'failed_calls',
        description: 'Tool invocations with an explicit error outcome',
        type: MetricType.COUNT,
        column: 'source',
        filters: [
            {
                id: 'failed-tools',
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: ['error'],
            },
        ],
    },
    {
        name: 'unique_users',
        description:
            'Distinct attributed registered-user UUIDs; excludes service principals and anonymous actors',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
    },
    {
        name: 'unique_actors',
        description:
            'Distinct observed actor identifiers, including service principals',
        type: MetricType.COUNT_DISTINCT,
        column: 'actor_id',
    },
    {
        name: 'avg_duration_ms',
        description: 'Average observed tool-call duration in milliseconds',
        type: MetricType.AVERAGE,
        column: 'duration_ms',
    },
    {
        name: 'p90_duration_ms',
        description: '90th percentile tool-call duration in milliseconds',
        type: MetricType.PERCENTILE,
        column: 'duration_ms',
        percentile: 90,
    },
];
