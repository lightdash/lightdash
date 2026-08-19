import type { PivotConfiguration, ResultColumns } from '..';
import type { PivotValuesColumn } from '../visualizations/types';
import type { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { AuthType } from './auth';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import type { WarehouseTypes } from './projects';

export interface IWarehouseQueryMetadata {
    type: WarehouseTypes;
}

export interface BigQueryWarehouseQueryMetadata extends IWarehouseQueryMetadata {
    type: WarehouseTypes.BIGQUERY;
    jobLocation: string;
}

export type WarehouseQueryMetadata = BigQueryWarehouseQueryMetadata;

export enum QueryHistoryStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    EXECUTING = 'executing',
    EXPIRED = 'expired',
    READY = 'ready',
    ERROR = 'error',
    CANCELLED = 'cancelled',
}

// duckdb = managed materialization via the DuckDB client override;
// project_warehouse = external pre-aggregate on the normal project client
export type PreAggregateExecutionEngine = 'duckdb' | 'project_warehouse';

// Why a matched pre-aggregate query was served from the source warehouse instead
export type PreAggregateFallbackReason =
    | 'duckdb_execution_error'
    | 'external_execution_error';

export type QueryHistory = {
    queryUuid: string;
    createdAt: Date;
    createdBy: string | null;
    createdByUserUuid: string | null;
    createdByAccount: string | null;
    createdByActorType: AuthType | null;
    organizationUuid: string;
    projectUuid: string | null;
    warehouseQueryId: string | null;
    warehouseQueryMetadata: WarehouseQueryMetadata | null;
    context: QueryExecutionContext;
    defaultPageSize: number | null;
    compiledSql: string;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: ExecuteAsyncQueryRequestParams;
    status: QueryHistoryStatus;
    totalRowCount: number | null;
    warehouseExecutionTimeMs: number | null;
    error: string | null;
    erroredAt: Date | null;
    cacheKey: string;
    pivotConfiguration: PivotConfiguration | null;
    pivotValuesColumns: Record<string, PivotValuesColumn> | null;
    pivotTotalColumnCount: number | null;
    resultsFileName: string | null; // S3 file name
    resultsCreatedAt: Date | null;
    resultsUpdatedAt: Date | null;
    resultsExpiresAt: Date | null;
    columns: ResultColumns | null; // result columns with or without pivoting
    originalColumns: ResultColumns | null; // columns from original SQL, before pivoting
    preAggregateCompiledSql: string | null; // DuckDB SQL for pre-aggregate execution path
    preAggregateExecution: PreAggregateExecutionEngine | null; // engine for preAggregateCompiledSql
    preAggregateFallbackReason: PreAggregateFallbackReason | null; // non-null ⇒ matched but served from source warehouse
    processingStartedAt: Date | null; // when the NATS worker picked up the job
};
