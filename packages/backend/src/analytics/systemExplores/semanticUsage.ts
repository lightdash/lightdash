import { FilterOperator, MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const semanticUsageColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'user_id',
        'query_id',
        'explore_name',
        'chart_id',
        'dashboard_id',
        'app_id',
        'context',
        'workload_origin',
        'initiating_actor_type',
        'request_id',
        'parent_operation_id',
        'status',
        'lineage_status',
        'field_id',
        'field_name',
        'field_label',
        'table_name',
        'field_kind',
        'field_origin',
        'definition_hash',
        'role',
        'field_identity',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'cache_hit', type: 'BOOLEAN' },
];

// One row per query-field-role. Null-field rows explicitly retain queries whose
// lineage is unavailable (SQL, old capture, or a query without direct fields).
// DISTINCT metrics make roles/fields non-additive without changing query_events.
export const semanticUsageSql = `(WITH queries AS (
    SELECT * FROM query_events
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, query_id ORDER BY event_ts DESC
    ) = 1
), field_references AS (
    SELECT q.org_id, q.project_id, q.user_id, q.query_id, q.event_ts,
        q.explore_name, q.chart_id, q.dashboard_id, q.app_id, q.context,
        q.workload_origin, q.initiating_actor_type, q.request_id,
        q.parent_operation_id, q.status, q.cache_hit,
        COALESCE(q.semantic_lineage_status, 'not_captured') AS lineage_status,
        r.value ->> 'fieldId' AS field_id,
        r.value ->> 'fieldName' AS field_name,
        r.value ->> 'fieldLabel' AS field_label,
        r.value ->> 'tableName' AS table_name,
        r.value ->> 'fieldKind' AS field_kind,
        r.value ->> 'fieldOrigin' AS field_origin,
        r.value ->> 'definitionHash' AS definition_hash,
        r.value ->> 'role' AS role
    FROM queries q
    LEFT JOIN LATERAL json_each(TRY_CAST(q.semantic_field_references AS JSON)) r ON true
)
SELECT *, CASE WHEN field_id IS NOT NULL
    THEN to_json([project_id, table_name, field_id, field_origin])::VARCHAR
    ELSE NULL END AS field_identity
FROM field_references)`;

export const semanticUsageMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_queries',
        description:
            'Distinct completed query attempts, including cache hits and execution errors. Counts are not additive across fields or roles. Null fields indicate unavailable lineage or no direct field references.',
        type: MetricType.COUNT_DISTINCT,
        column: 'query_id',
    },
    ...[
        {
            name: 'unique_users',
            column: 'user_id',
            description:
                'Distinct recorded user IDs, including service accounts; anonymous users are excluded.',
        },
        {
            name: 'unique_fields',
            column: 'field_identity',
            description:
                'Distinct directly referenced fields, scoped to project and origin. Label changes retain identity; renamed field identifiers are separate fields.',
        },
        {
            name: 'unique_charts',
            column: 'chart_id',
            description:
                'Distinct attributed charts using the selected fields.',
        },
        {
            name: 'unique_dashboards',
            column: 'dashboard_id',
            description:
                'Distinct attributed dashboards using the selected fields.',
        },
        {
            name: 'unique_apps',
            column: 'app_id',
            description: 'Distinct attributed apps using the selected fields.',
        },
    ].map((metric) => ({ ...metric, type: MetricType.COUNT_DISTINCT })),
    {
        name: 'failed_queries',
        description:
            'Distinct attempts ending in an execution error after successful compilation.',
        type: MetricType.COUNT_DISTINCT,
        column: 'query_id',
        filters: [
            {
                id: 'failed-semantic-queries',
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: ['error'],
            },
        ],
    },
    {
        name: 'cached_queries',
        description:
            'Distinct attempts served from the result cache; field use is counted even without a new warehouse execution.',
        type: MetricType.COUNT_DISTINCT,
        column: 'query_id',
        filters: [
            {
                id: 'cached-semantic-queries',
                target: { fieldRef: 'cache_hit' },
                operator: FilterOperator.EQUALS,
                values: [true],
            },
        ],
    },
];
