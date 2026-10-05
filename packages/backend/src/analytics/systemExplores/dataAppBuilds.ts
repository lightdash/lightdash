import { FilterOperator, MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const dataAppBuildsColumns: CompactedStreamColumn[] = [
    ...[
        'org_id',
        'project_id',
        'app_id',
        'build_id',
        'user_id',
        'status',
        'coding_agent',
        'requested_model',
        'provider',
        'outcome_stage',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'version', type: 'INTEGER' },
    ...['activity_at', 'started_at', 'finished_at'].map((name) => ({
        name,
        type: 'TIMESTAMP' as const,
    })),
    ...['start_observed', 'is_iteration', 'was_resumed'].map((name) => ({
        name,
        type: 'BOOLEAN' as const,
    })),
    ...[
        'duration_ms',
        'scheduler_wait_ms',
        'usage_records',
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'total_tokens',
    ].map((name) => ({ name, type: 'BIGINT' as const })),
];

// One row per app version, not per lifecycle event or model. Group at read
// time so late outcomes join starts in older daily files without rebuilding.
// AI records are already per-build deltas (ZAP-1156); never add the separate
// lifecycle token summaries on top of them. Old unlinked usage remains unknown.
export const dataAppBuildsSql = `(WITH events AS (
    SELECT * FROM data_app_events
    WHERE app_id IS NOT NULL AND project_id IS NOT NULL AND version IS NOT NULL
        AND event_name IN ('data_app.created', 'data_app.iterated',
            'data_app.version.completed', 'data_app.version.failed', 'data_app.version.cancelled')
), builds AS (
    SELECT DISTINCT org_id, project_id, app_id, version FROM events
), starts AS (
    SELECT *, event_ts AS started_at FROM events
    WHERE event_name IN ('data_app.created', 'data_app.iterated')
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, app_id, version ORDER BY event_ts, event_name, user_id
    ) = 1
), outcomes AS (
    SELECT *, event_ts AS finished_at,
        CASE event_name
            WHEN 'data_app.version.completed' THEN 'completed'
            WHEN 'data_app.version.failed' THEN 'failed'
            WHEN 'data_app.version.cancelled' THEN 'cancelled'
        END AS status
    FROM events WHERE event_name IN ('data_app.version.completed',
        'data_app.version.failed', 'data_app.version.cancelled')
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, app_id, version ORDER BY event_ts DESC, event_name DESC
    ) = 1
), usage_events AS (
    SELECT * FROM ai_usage
    WHERE feature = 'data-app' AND app_id IS NOT NULL AND app_version IS NOT NULL
        AND event_id IS NOT NULL
        AND function_id IN ('appClaudeGeneration', 'appClaudeCompaction')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, event_id ORDER BY event_ts DESC) = 1
), consumption AS (
    SELECT org_id, project_id, app_id, app_version AS version,
        COUNT(*)::BIGINT AS usage_records,
        SUM(input_tokens)::BIGINT AS input_tokens,
        SUM(output_tokens)::BIGINT AS output_tokens,
        SUM(cache_read_tokens)::BIGINT AS cache_read_tokens,
        SUM(cache_write_tokens)::BIGINT AS cache_write_tokens,
        SUM(total_tokens)::BIGINT AS total_tokens
    FROM usage_events GROUP BY org_id, project_id, app_id, app_version
)
SELECT b.*, to_json([b.org_id, b.project_id, b.app_id, b.version::VARCHAR])::VARCHAR AS build_id,
    COALESCE(s.user_id, CASE WHEN o.status <> 'cancelled' THEN o.user_id END) AS user_id,
    COALESCE(s.started_at, o.finished_at) AS activity_at,
    s.started_at, o.finished_at, s.started_at IS NOT NULL AS start_observed,
    COALESCE(o.status, 'pending') AS status,
    COALESCE(o.coding_agent, s.coding_agent) AS coding_agent,
    COALESCE(o.requested_model, s.requested_model) AS requested_model,
    o.provider, COALESCE(s.is_iteration, o.is_iteration) AS is_iteration,
    o.was_resumed, o.outcome_stage, o.duration_ms, o.scheduler_wait_ms,
    COALESCE(c.usage_records, 0)::BIGINT AS usage_records,
    c.input_tokens, c.output_tokens, c.cache_read_tokens, c.cache_write_tokens, c.total_tokens
FROM builds b
LEFT JOIN starts s USING (org_id, project_id, app_id, version)
LEFT JOIN outcomes o USING (org_id, project_id, app_id, version)
LEFT JOIN consumption c USING (org_id, project_id, app_id, version))`;

export const dataAppBuildsMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_builds',
        type: MetricType.COUNT,
        column: 'build_id',
        description:
            'Observed app versions with a build start or outcome. Restores, promotions, uploads and app loads alone do not count as builds.',
    },
    {
        name: 'unique_builders',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
        description:
            'Distinct recorded builders. A person who only cancels a build is not inferred to be its builder.',
    },
    { name: 'unique_apps', type: MetricType.COUNT_DISTINCT, column: 'app_id' },
    ...['completed', 'failed', 'cancelled', 'pending'].map((status) => ({
        name: `${status}_builds`,
        type: MetricType.COUNT,
        column: 'build_id',
        filters: [
            {
                id: status,
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: [status],
            },
        ],
    })),
    {
        name: 'average_duration_ms',
        type: MetricType.AVERAGE,
        column: 'duration_ms',
        description:
            'Mean recorded worker duration for completed or failed builds. Missing historical timing and cancelled builds are excluded; scheduler wait is separate.',
    },
    {
        name: 'p95_duration_ms',
        type: MetricType.PERCENTILE,
        percentile: 95,
        column: 'duration_ms',
    },
    {
        name: 'average_scheduler_wait_ms',
        type: MetricType.AVERAGE,
        column: 'scheduler_wait_ms',
    },
    {
        name: 'total_usage_records',
        type: MetricType.SUM,
        column: 'usage_records',
        description:
            'Distinct captured generation/compaction usage records. One record can summarize multiple invocations for a concrete model; this is not an AI call count.',
    },
    ...[
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'total_tokens',
    ].map((column) => ({
        name:
            column === 'total_tokens' ? 'total_tokens_used' : `total_${column}`,
        type: MetricType.SUM,
        column,
        description:
            'Captured usage linked to the app version, including known failed-build usage. Missing and incomplete usage is not zero. Input tokens include cache reads and writes; do not add cache tokens to input tokens.',
    })),
];
