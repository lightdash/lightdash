import type {
    ItemsMap,
    MetricQuery,
    PaginatedQueryRequestParams,
    QueryExecutionContext,
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
    default_page_size: number;
    compiled_sql: string;
    warehouse_query_id: string | null;
    warehouse_execution_time_ms: number;
    warehouse_query_metadata: WarehouseQueryMetadata | null;
    total_row_count: number;
    metric_query: MetricQuery;
    fields: ItemsMap;
    request_parameters: PaginatedQueryRequestParams;
};

export type DbQueryHistoryIn = Omit<
    DbQueryHistory,
    'query_uuid' | 'created_at'
>;

export type QueryHistoryTable = Knex.CompositeTableType<
    DbQueryHistory,
    DbQueryHistoryIn
>;

export const QueryHistoryTableName = 'query_history';
