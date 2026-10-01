import type { QueryCompletedEvent } from '../LightdashAnalytics';
import { buildEnvelope, ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

/**
 * Typed column list for the compacted (parquet) zone of the `query_events`
 * stream, v1. Envelope columns first, then one typed column per field of the
 * query.completed projection below — one row per query.
 */
export const queryEventsCompactedColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'query_id', type: 'VARCHAR' },
    { name: 'status', type: 'VARCHAR' },
    { name: 'context', type: 'VARCHAR' },
    { name: 'explore_name', type: 'VARCHAR' },
    { name: 'chart_id', type: 'VARCHAR' },
    { name: 'dashboard_id', type: 'VARCHAR' },
    { name: 'response_time_ms', type: 'BIGINT' },
    { name: 'response_timing_basis', type: 'VARCHAR' },
    { name: 'workload_origin', type: 'VARCHAR' },
    { name: 'dashboard_tile_id', type: 'VARCHAR' },
    { name: 'app_id', type: 'VARCHAR' },
    { name: 'app_version', type: 'INTEGER' },
    { name: 'request_id', type: 'VARCHAR' },
    { name: 'parent_operation_id', type: 'VARCHAR' },
    { name: 'initiating_actor_type', type: 'VARCHAR' },
    { name: 'scheduler_id', type: 'VARCHAR' },
    { name: 'cache_hit', type: 'BOOLEAN' },
    { name: 'execution_source', type: 'VARCHAR' },
    { name: 'warehouse_type', type: 'VARCHAR' },
    { name: 'connection_warehouse_type', type: 'VARCHAR' },
    { name: 'warehouse_connection_id', type: 'VARCHAR' },
    { name: 'connection_kind', type: 'VARCHAR' },
    { name: 'connection_count', type: 'INTEGER' },
    { name: 'warehouse_execution_time_ms', type: 'BIGINT' },
    // Phase breakdown of warehouse_execution_time_ms; null when not reported.
    { name: 'warehouse_ssh_tunnel_ms', type: 'BIGINT' },
    { name: 'warehouse_connect_ms', type: 'BIGINT' },
    { name: 'warehouse_session_ms', type: 'BIGINT' },
    { name: 'warehouse_query_ms', type: 'BIGINT' },
    { name: 'warehouse_fetch_ms', type: 'BIGINT' },
    { name: 'total_row_count', type: 'BIGINT' },
    { name: 'columns_count', type: 'INTEGER' },
];

/**
 * Projection for the `query_events` stream (v1): one row per async query,
 * emitted at terminal state (`query.completed`). Returns null when the event
 * can't be attributed to an organization or comes from a preview project.
 */
const projectQueryCompletedEvent = (
    payload: QueryCompletedEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    if (properties.isPreviewProject) return null;
    return {
        stream: 'query_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            query_id: properties.queryId,
            status: properties.status,
            context: properties.context,
            explore_name: properties.exploreName,
            chart_id: properties.chartId,
            dashboard_id: properties.dashboardId,
            response_time_ms: properties.responseTimeMs ?? null,
            response_timing_basis: properties.responseTimingBasis ?? null,
            workload_origin: properties.workloadOrigin ?? null,
            dashboard_tile_id: properties.dashboardTileId ?? null,
            app_id: properties.appId ?? null,
            app_version: properties.appVersion ?? null,
            request_id: properties.requestId ?? null,
            parent_operation_id: properties.parentOperationId ?? null,
            initiating_actor_type: properties.initiatingActorType ?? null,
            scheduler_id: properties.schedulerId ?? null,
            cache_hit: properties.cacheHit,
            execution_source: properties.executionSource,
            warehouse_type: properties.warehouseType,
            connection_warehouse_type: properties.connectionWarehouseType,
            warehouse_connection_id: properties.warehouseConnectionId,
            connection_kind: properties.connectionKind,
            connection_count: properties.connectionCount,
            warehouse_execution_time_ms: properties.warehouseExecutionTimeMs,
            warehouse_ssh_tunnel_ms:
                properties.warehousePhaseTimings?.ssh_tunnel ?? null,
            warehouse_connect_ms:
                properties.warehousePhaseTimings?.connect ?? null,
            warehouse_session_ms:
                properties.warehousePhaseTimings?.session ?? null,
            warehouse_query_ms: properties.warehousePhaseTimings?.query ?? null,
            warehouse_fetch_ms: properties.warehousePhaseTimings?.fetch ?? null,
            total_row_count: properties.totalRowCount,
            columns_count: properties.columnsCount,
        },
    };
};

export const queryEventsProjections = {
    'query.completed': projectQueryCompletedEvent,
};
