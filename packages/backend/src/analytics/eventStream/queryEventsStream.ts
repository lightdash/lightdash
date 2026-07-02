import type {
    QueryErrorEvent,
    QueryExecutionEvent,
    QueryReadyEvent,
} from '../LightdashAnalytics';
import { buildEnvelope, ProjectionResult } from './projection';

/**
 * Projections for the `query_events` stream (v1): the three query lifecycle
 * events emitted by the query engine. Each projection returns null when the
 * event can't be attributed to an organization.
 */
const projectQueryExecutedEvent = (
    payload: QueryExecutionEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    const base = {
        ...buildEnvelope(payload, properties.organizationId),
        project_id: properties.projectId,
        context: properties.context,
        execution_source: properties.executionSource ?? null,
        cache_hit: properties.cacheMetadata?.cacheHit ?? null,
        pre_aggregate_hit: properties.cacheMetadata?.preAggregate?.hit ?? null,
    };
    if ('usingStreaming' in properties) {
        // SQL runner flavour
        return {
            stream: 'query_events',
            row: {
                ...base,
                query_id: null,
                warehouse_type: null,
                explore_name: null,
                chart_id: null,
                dashboard_id: null,
                sql_chart_id: properties.sqlChartId ?? null,
            },
        };
    }
    // Metric query flavours (paginated ones carry queryId + warehouseType)
    return {
        stream: 'query_events',
        row: {
            ...base,
            query_id: 'queryId' in properties ? properties.queryId : null,
            warehouse_type:
                'warehouseType' in properties ? properties.warehouseType : null,
            explore_name: properties.exploreName,
            chart_id: properties.chartId ?? null,
            dashboard_id: properties.dashboardId,
            sql_chart_id: null,
        },
    };
};

const projectQueryReadyEvent = (payload: QueryReadyEvent): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'query_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            query_id: properties.queryId,
            warehouse_type: properties.warehouseType,
            execution_source: properties.executionSource,
            warehouse_execution_time_ms: properties.warehouseExecutionTimeMs,
            total_row_count: properties.totalRowCount,
            columns_count: properties.columnsCount,
        },
    };
};

const projectQueryErrorEvent = (payload: QueryErrorEvent): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'query_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            query_id: properties.queryId,
            warehouse_type: properties.warehouseType ?? null,
            execution_source: properties.executionSource,
        },
    };
};

export const queryEventsProjections = {
    'query.executed': projectQueryExecutedEvent,
    'query.ready': projectQueryReadyEvent,
    'query.error': projectQueryErrorEvent,
};
