import type {
    ExecuteAsyncQueryRequestParams,
    ItemsMap,
    MetricQuery,
    QueryExecutionContext,
    QueryHistoryStatus,
    WarehouseQueryMetadata,
} from '@lightdash/common';
import { Knex } from 'knex';

export type DbQueryHistory = {
    query_uuid: string;
    created_at: Date;
    created_by_user_uuid: string | null;
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
};

export type DbQueryHistoryIn = Omit<
    DbQueryHistory,
    'query_uuid' | 'created_at'
>;

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
    >
>;

export type QueryHistoryTable = Knex.CompositeTableType<
    DbQueryHistory,
    DbQueryHistoryIn,
    DbQueryHistoryUpdate
>;

export const QueryHistoryTableName = 'query_history';
