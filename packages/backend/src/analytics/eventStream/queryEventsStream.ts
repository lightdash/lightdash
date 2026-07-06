import type { QueryCompletedEvent } from '../LightdashAnalytics';
import { buildEnvelope, ProjectionResult } from './projection';

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
            cache_hit: properties.cacheHit,
            execution_source: properties.executionSource,
            warehouse_type: properties.warehouseType,
            warehouse_execution_time_ms: properties.warehouseExecutionTimeMs,
            total_row_count: properties.totalRowCount,
            columns_count: properties.columnsCount,
        },
    };
};

export const queryEventsProjections = {
    'query.completed': projectQueryCompletedEvent,
};
