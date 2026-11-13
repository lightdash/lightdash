import type {
    AgentIdentityClaim,
    AuthType,
    DuckdbExecutionSpec,
    ItemsMap,
    MetricQuery,
    ParametersValuesMap,
    PivotConfiguration,
    PivotValuesColumn,
    PreAggregateExecutionEngine,
    PreAggregateFallbackReason,
    QueryExecutionContext,
    QueryHistory,
    QueryHistoryStatus,
    ResultColumns,
    ResultsCacheMissReason,
    WarehouseExecutionStats,
    WarehouseQueryMetadata,
} from '@lightdash/common';
import { assertUnreachable } from '@lightdash/common';
import { Knex } from 'knex';

export type DbQueryHistory = {
    agent_identity: AgentIdentityClaim | null;
    warehouse_connection_uuid?: string | null;
    query_uuid: string;
    created_at: Date;
    query_created_at_utc: Date;
    created_by_user_uuid: string | null;
    created_by_account: string | null;
    created_by_actor_type: AuthType | null;
    project_uuid: string | null;
    organization_uuid: string;
    context: QueryExecutionContext;
    default_page_size: number | null;
    compiled_sql: string;
    warehouse_query_id: string | null;
    warehouse_query_metadata: WarehouseQueryMetadata | null;
    warehouse_execution_stats: WarehouseExecutionStats | null;
    metric_query: MetricQuery;
    fields: ItemsMap;
    request_parameters: QueryHistory['requestParameters'];
    used_parameters: ParametersValuesMap | null;
    total_row_count: number | null;
    warehouse_execution_time_ms: number | null;
    error: string | null;
    errored_at: Date | null;
    status: QueryHistoryStatus;
    cache_key: string;
    cache_generation: number; // project results_cache_generation the results belong to
    cache_invalidated_at: Date | null; // set when a chart or dashboard cache is cleared
    cache_miss_reason: ResultsCacheMissReason | null; // null on hits and on rows before reasons were recorded
    cache_refresh_requested: boolean;
    pivot_configuration: PivotConfiguration | null;
    pivot_values_columns: Record<string, PivotValuesColumn> | null;
    pivot_total_column_count: number | null;
    results_file_name: string | null; // S3 file name
    results_created_at: Date | null;
    results_updated_at: Date | null;
    results_expires_at: Date | null;
    columns: ResultColumns | null; // result columns with or without pivoting
    original_columns: ResultColumns | null; // columns from original SQL, before pivoting
    pre_aggregate_compiled_sql: string | null; // DuckDB SQL for pre-aggregate execution path
    pre_aggregate_execution: PreAggregateExecutionEngine | null; // engine for pre_aggregate_compiled_sql
    pre_aggregate_fallback_reason: PreAggregateFallbackReason | null; // non-null ⇒ matched but served from source warehouse
    executing_heartbeat_at: Date | null;
    processing_started_at: Date | null; // when the NATS worker picked up the job
    duckdb_execution: DuckdbExecutionSpec | null; // how a DuckDB source query runs, for the worker to rebuild it
    // Copied out of the JSON columns so queries can filter and join on them without detoasting.
    request_chart_uuid: string | null;
    request_saved_sql_uuid: string | null;
    request_dashboard_uuid: string | null;
    metric_query_explore_name: string | null;
    warehouse_bytes_billed: number | null;
};

export type DbQueryHistoryIn = Omit<
    DbQueryHistory,
    | 'query_uuid'
    | 'created_at'
    | 'query_created_at_utc'
    | 'created_by_actor_type'
    | 'agent_identity'
    | 'cache_miss_reason'
    | 'cache_refresh_requested'
    | 'warehouse_bytes_billed'
    | 'executing_heartbeat_at'
> & {
    created_by_actor_type: AuthType;
    agent_identity?: AgentIdentityClaim;
    warehouse_connection_uuid?: string | null;
    cache_miss_reason?: ResultsCacheMissReason | null;
    cache_refresh_requested?: boolean;
};

export type QueryHistoryCacheOutcome = {
    missReason: ResultsCacheMissReason | null;
    refreshRequested: boolean;
};

export type DbQueryHistoryUpdate = Partial<
    Pick<
        DbQueryHistory,
        | 'status'
        | 'error'
        | 'errored_at'
        | 'compiled_sql'
        | 'fields'
        | 'warehouse_execution_time_ms'
        | 'total_row_count'
        | 'warehouse_query_id'
        | 'warehouse_query_metadata'
        | 'warehouse_execution_stats'
        | 'default_page_size'
        | 'pivot_configuration'
        | 'pivot_values_columns'
        | 'pivot_total_column_count'
        | 'results_file_name'
        | 'results_created_at'
        | 'results_updated_at'
        | 'results_expires_at'
        | 'columns'
        | 'original_columns'
        | 'pre_aggregate_compiled_sql'
        | 'pre_aggregate_execution'
        | 'cache_key'
        | 'cache_generation'
        | 'cache_invalidated_at'
        | 'cache_miss_reason'
        | 'cache_refresh_requested'
        | 'pre_aggregate_fallback_reason'
        | 'executing_heartbeat_at'
        | 'processing_started_at'
        | 'duckdb_execution'
    >
>;

export type QueryHistoryTable = Knex.CompositeTableType<
    DbQueryHistory,
    DbQueryHistoryIn,
    DbQueryHistoryUpdate
>;

export const QueryHistoryTableName = 'query_history';

export type QueryHistoryRequestColumn =
    | 'request_chart_uuid'
    | 'request_saved_sql_uuid'
    | 'request_dashboard_uuid';

const requestColumnJsonFallback = (
    table: string,
    column: QueryHistoryRequestColumn,
): string => {
    switch (column) {
        case 'request_chart_uuid':
            return `${table}.request_parameters->>'chartUuid'`;
        case 'request_saved_sql_uuid':
            return `COALESCE(${table}.request_parameters->>'savedSqlUuid', ${table}.request_parameters->'resultSource'->>'savedSqlUuid')`;
        case 'request_dashboard_uuid':
            return `COALESCE(${table}.request_parameters->>'dashboardUuid', ${table}.request_parameters->'resultSource'->>'dashboardUuid')`;
        default:
            return assertUnreachable(column, `Unknown column ${column}`);
    }
};

// Rows the backfill didn't reach have no copied explore name, so read their JSON instead.
export const queryHistoryRequestColumnSql = (
    table: string,
    column: QueryHistoryRequestColumn,
): string =>
    `COALESCE(${table}.${column}, CASE WHEN ${table}.metric_query_explore_name IS NULL THEN ${requestColumnJsonFallback(table, column)} END)`;
