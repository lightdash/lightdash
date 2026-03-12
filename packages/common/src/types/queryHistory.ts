import type { PivotConfiguration, ResultColumns } from '..';
import type { PivotValuesColumn } from '../visualizations/types';
import type { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { AuthType } from './auth';
import type { ItemsMap } from './field';
import type { KnexPaginatedData } from './knex-paginate';
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
    processingStartedAt: Date | null; // when the NATS worker picked up the job
};

export type ProjectQueryHistoryItem = {
    queryUuid: string;
    createdAt: Date;
    createdByName: string | null;
    createdByUserUuid: string | null;
    createdByAccount: string | null;
    createdByActorType: AuthType | null;
    context: QueryExecutionContext;
    status: QueryHistoryStatus;
    processingStartedAt: Date | null;
    warehouseExecutionTimeMs: number | null;
    totalRowCount: number | null;
    warehouseQueryId: string | null;
    error: string | null;
    compiledSql: string;
    preAggregateCompiledSql: string | null;
};

export type ProjectQueryHistorySummary = {
    queueLength: number;
    processingCount: number;
    readyCount: number;
    errorCount: number;
    cancelledCount: number;
    avgQueueTimeMs: number | null;
    avgExecutionTimeMs: number | null;
};

export type ApiProjectQueryHistoryResults = {
    queryHistory: ProjectQueryHistoryItem[];
    summary: ProjectQueryHistorySummary;
};

export type ApiProjectQueryHistoryResponse = {
    status: 'ok';
    results: KnexPaginatedData<ApiProjectQueryHistoryResults>;
};
