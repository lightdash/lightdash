import { MetricType } from '@lightdash/common';
import { contentInventoryColumns } from '../eventStream/contentInventory';
import type { CompactedStreamColumn } from '../eventStream/types';
import { contentReachSql } from './contentReach';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const contentHealthColumns: CompactedStreamColumn[] = [
    ...contentInventoryColumns,
    ...[
        'last_viewed_at',
        'last_query_at',
        'last_app_load_at',
        'last_observed_activity_at',
        'first_observed_event_at',
    ].map((name) => ({ name, type: 'TIMESTAMP' as const })),
    ...[
        'observed_views',
        'observed_viewers',
        'observed_queries',
        'observed_app_loads',
        'warehouse_execution_time_ms',
        'queries_with_execution_time',
        'days_since_last_observed_activity',
    ].map((name) => ({ name, type: 'BIGINT' as const })),
    ...['activity_status', 'capture_coverage', 'dependency_coverage'].map(
        (name) => ({ name, type: 'VARCHAR' as const }),
    ),
];

// Aggregate each fact source before joining to inventory. Inventory is the base,
// so items with zero captured events and soft-deleted items remain visible.
export const contentHealthSql = `(WITH views AS (
    SELECT org_id, project_id, content_type, content_id,
        COUNT(qualifying_view_at)::BIGINT AS observed_views,
        COUNT(DISTINCT viewer_id)::BIGINT AS observed_viewers,
        MAX(qualifying_view_at) AS last_viewed_at
    FROM ${contentReachSql} reach
    GROUP BY org_id, project_id, content_type, content_id
), queries AS (
    SELECT * FROM query_events
    QUALIFY query_id IS NULL OR ROW_NUMBER() OVER (
        PARTITION BY org_id, project_id, query_id ORDER BY event_ts DESC
    ) = 1
), content_queries AS (
    SELECT i.org_id, i.project_id, i.content_type, i.content_id,
        COUNT(*)::BIGINT AS observed_queries, MAX(q.event_ts) AS last_query_at,
        SUM(q.warehouse_execution_time_ms)::BIGINT AS warehouse_execution_time_ms,
        COUNT(q.warehouse_execution_time_ms)::BIGINT AS queries_with_execution_time
    FROM lightdash_content i JOIN queries q
        ON i.org_id = q.org_id AND i.project_id = q.project_id
        AND ((i.content_type IN ('saved_chart', 'sql_chart') AND i.content_id = q.chart_id)
          OR (i.content_type = 'dashboard' AND i.content_id = q.dashboard_id))
    GROUP BY i.org_id, i.project_id, i.content_type, i.content_id
), app_loads AS (
    SELECT org_id, project_id, app_id,
        COUNT(*)::BIGINT AS observed_app_loads, MAX(event_ts) AS last_app_load_at
    FROM data_app_events WHERE event_name = 'data_app.view'
    GROUP BY org_id, project_id, app_id
), observed_window AS (
    SELECT org_id, MIN(event_ts) AS first_observed_event_at FROM (
        SELECT org_id, event_ts FROM content_views
        UNION ALL SELECT org_id, event_ts FROM query_events
        UNION ALL SELECT org_id, event_ts FROM data_app_events
    ) events GROUP BY org_id
), joined AS (
    SELECT i.*, v.last_viewed_at, q.last_query_at, a.last_app_load_at,
        COALESCE(v.observed_views, 0)::BIGINT AS observed_views,
        COALESCE(v.observed_viewers, 0)::BIGINT AS observed_viewers,
        COALESCE(q.observed_queries, 0)::BIGINT AS observed_queries,
        COALESCE(a.observed_app_loads, 0)::BIGINT AS observed_app_loads,
        GREATEST(v.last_viewed_at, q.last_query_at, a.last_app_load_at) AS last_observed_activity_at,
        q.warehouse_execution_time_ms,
        COALESCE(q.queries_with_execution_time, 0)::BIGINT AS queries_with_execution_time,
        w.first_observed_event_at
    FROM lightdash_content i
    LEFT JOIN views v ON i.org_id = v.org_id AND i.project_id = v.project_id AND i.content_type = v.content_type AND i.content_id = v.content_id
    LEFT JOIN content_queries q ON i.org_id = q.org_id AND i.project_id = q.project_id AND i.content_type = q.content_type AND i.content_id = q.content_id
    LEFT JOIN app_loads a ON i.org_id = a.org_id AND i.project_id = a.project_id AND i.content_type = 'data_app' AND i.content_id = a.app_id
    LEFT JOIN observed_window w ON i.org_id = w.org_id
)
SELECT *, date_diff('day', last_observed_activity_at, CURRENT_TIMESTAMP)::BIGINT AS days_since_last_observed_activity,
    CASE WHEN last_observed_activity_at IS NOT NULL THEN 'Activity observed'
        WHEN dashboard_references > 0 OR enabled_schedules > 0 THEN 'No activity observed; known dependency'
        ELSE 'No activity observed; coverage incomplete' END AS activity_status,
    'Incomplete: retained events do not prove continuous capture' AS capture_coverage,
    'Partial: current dashboard tiles and enabled schedules only' AS dependency_coverage
FROM joined)`;

export const contentHealthMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_warehouse_execution_time_ms',
        type: MetricType.SUM,
        column: 'warehouse_execution_time_ms',
        description:
            'Reported warehouse execution time attributed to items, in milliseconds. A performance proxy, not monetary cost; null when timing is unavailable. Chart/dashboard attribution can overlap.',
    },
    {
        name: 'total_queries_with_execution_time',
        type: MetricType.SUM,
        column: 'queries_with_execution_time',
        description:
            'Captured query outcomes with reported warehouse execution time. Compare with Total observed queries to assess timing coverage.',
    },
    {
        name: 'total_content',
        type: MetricType.COUNT,
        column: 'content_id',
        description:
            'Items in the latest inventory snapshot, including zero-event and soft-deleted items. Filter Is deleted to exclude removed content.',
    },
    {
        name: 'total_observed_views',
        type: MetricType.SUM,
        column: 'observed_views',
        description:
            'Qualifying backend chart/dashboard fetches across retained history. Data app loads are reported separately.',
    },
    {
        name: 'total_observed_queries',
        type: MetricType.SUM,
        column: 'observed_queries',
        description:
            'Captured query outcomes attributed to each item. A tile query can belong to both its chart and dashboard; totals across content types are attribution counts, not unique queries.',
    },
    {
        name: 'total_observed_app_loads',
        type: MetricType.SUM,
        column: 'observed_app_loads',
        description:
            'Captured data app HTML loads. Includes previews and reloads; not a qualified readership metric.',
    },
];
