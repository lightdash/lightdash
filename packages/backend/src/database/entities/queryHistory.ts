import type {
    ExecuteAsyncQueryRequestParams,
    GroupByColumn,
    ItemsMap,
    MetricQuery,
    PivotIndexColum,
    PivotValuesColumn,
    QueryExecutionContext,
    QueryHistoryStatus,
    ResultColumns,
    SortBy,
    ValuesColumn,
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
    cache_key: string;
    pivot_configuration: {
        indexColumn: PivotIndexColum;
        valuesColumns: ValuesColumn[];
        groupByColumns: GroupByColumn[] | undefined;
        sortBy: SortBy | undefined;
    } | null;
    pivot_values_columns: Record<string, PivotValuesColumn> | null;
    pivot_total_column_count: number | null;
    results_file_name: string | null; // S3 file name
    results_created_at: Date | null;
    results_updated_at: Date | null;
    results_expires_at: Date | null;
    columns: ResultColumns | null; // result columns with or without pivoting
    original_columns: ResultColumns | null; // columns from original SQL, before pivoting
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
        | 'pivot_configuration'
        | 'pivot_values_columns'
        | 'pivot_total_column_count'
        | 'results_file_name'
        | 'results_created_at'
        | 'results_updated_at'
        | 'results_expires_at'
        | 'columns'
        | 'original_columns'
    >
>;

export type QueryHistoryTable = Knex.CompositeTableType<
    DbQueryHistory,
    DbQueryHistoryIn,
    DbQueryHistoryUpdate
>;

export const QueryHistoryTableName = 'query_history';
