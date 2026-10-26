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

// Rank only duplicate identities so unique events stream their wide JSON.
// Inline the key lookup so joined charts can prune unused lineage columns.
// Null-field rows retain unavailable lineage; distinct metrics stay non-additive.
export const semanticUsageSql = `(WITH duplicate_query_ids AS NOT MATERIALIZED (
    SELECT org_id, query_id FROM query_events
    GROUP BY org_id, query_id HAVING COUNT(*) > 1
), queries AS (
    SELECT * FROM query_events q
    WHERE NOT EXISTS (
        SELECT 1 FROM duplicate_query_ids d
        WHERE d.org_id IS NOT DISTINCT FROM q.org_id
          AND d.query_id IS NOT DISTINCT FROM q.query_id
    )
    UNION ALL
    SELECT * FROM query_events q
    WHERE EXISTS (
        SELECT 1 FROM duplicate_query_ids d
        WHERE d.org_id IS NOT DISTINCT FROM q.org_id
          AND d.query_id IS NOT DISTINCT FROM q.query_id
    )
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, query_id ORDER BY event_ts DESC
    ) = 1
), field_references AS (
    SELECT q.org_id, q.project_id, q.user_id, q.query_id, q.event_ts,
        q.explore_name, q.chart_id, q.dashboard_id, q.app_id, q.context,
        q.workload_origin, q.initiating_actor_type, q.request_id,
        q.parent_operation_id, q.status, q.cache_hit,
        COALESCE(q.semantic_lineage_status, 'not_captured') AS lineage_status,
        q.field_reference.fieldId AS field_id,
        q.field_reference.fieldName AS field_name,
        q.field_reference.fieldLabel AS field_label,
        q.field_reference.tableName AS table_name,
        q.field_reference.fieldKind AS field_kind,
        q.field_reference.fieldOrigin AS field_origin,
        q.field_reference.definitionHash AS definition_hash,
        q.field_reference.role AS role
    FROM (
        SELECT *, unnest(COALESCE(NULLIF(TRY(from_json(semantic_field_references,
            '[{"fieldId":"VARCHAR","fieldName":"VARCHAR","fieldLabel":"VARCHAR",
              "tableName":"VARCHAR","fieldKind":"VARCHAR","fieldOrigin":"VARCHAR",
              "definitionHash":"VARCHAR","role":"VARCHAR"}]')), []), [NULL])) AS field_reference
        FROM queries
    ) q
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
