import type {
    AuthType,
    ExecuteAsyncQueryRequestParams,
    ItemsMap,
    MetricQuery,
    PivotConfiguration,
    PivotValuesColumn,
    QueryExecutionContext,
    QueryHistoryStatus,
    ResultColumns,
    WarehouseQueryMetadata,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbQueryHistory = {
    query_uuid: string;
    created_at: Date;
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
    metric_query: MetricQuery;
    fields: ItemsMap;
    request_parameters: ExecuteAsyncQueryRequestParams;
    total_row_count: number | null;
    warehouse_execution_time_ms: number | null;
    error: string | null;
    status: QueryHistoryStatus;
    cache_key: string;
    pivot_configuration: PivotConfiguration | null;
    pivot_values_columns: Record<string, PivotValuesColumn> | null;
    pivot_total_column_count: number | null;
    pivot_total_group_count: number | null;
    results_file_name: string | null; // S3 file name
    results_created_at: Date | null;
    results_updated_at: Date | null;
    results_expires_at: Date | null;
    columns: ResultColumns | null; // result columns with or without pivoting
    original_columns: ResultColumns | null; // columns from original SQL, before pivoting
    pre_aggregate_compiled_sql: string | null; // DuckDB SQL for pre-aggregate execution path
    processing_started_at: Date | null; // when the NATS worker picked up the job
};

export type DbQueryHistoryIn = Omit<
    DbQueryHistory,
    'query_uuid' | 'created_at' | 'created_by_actor_type'
> & {
    created_by_actor_type: AuthType;
};

export type DbQueryHistoryUpdate = Partial<
    Pick<
        DbQueryHistory,
        | 'status'
        | 'error'
        | 'warehouse_execution_time_ms'
        | 'total_row_count'
        | 'warehouse_query_id'
        | 'warehouse_query_metadata'
        | 'default_page_size'
        | 'pivot_configuration'
        | 'pivot_values_columns'
        | 'pivot_total_column_count'
        | 'pivot_total_group_count'
        | 'results_file_name'
        | 'results_created_at'
        | 'results_updated_at'
        | 'results_expires_at'
        | 'columns'
        | 'original_columns'
        | 'pre_aggregate_compiled_sql'
        | 'processing_started_at'
    >
>;

export type QueryHistoryTable = Knex.CompositeTableType<
    DbQueryHistory,
    DbQueryHistoryIn,
    DbQueryHistoryUpdate
>;

export const QueryHistoryTableName = 'query_history';
