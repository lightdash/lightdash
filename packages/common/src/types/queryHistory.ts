import type { PivotConfiguration, ResultColumns } from '..';
import type { PivotValuesColumn } from '../visualizations/types';
import type { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import type { WarehouseTypes } from './projects';

export interface IWarehouseQueryMetadata {
    type: WarehouseTypes;
}

export interface BigQueryWarehouseQueryMetadata
    extends IWarehouseQueryMetadata {
    type: WarehouseTypes.BIGQUERY;
    jobLocation: string;
}

export type WarehouseQueryMetadata = BigQueryWarehouseQueryMetadata;

export enum QueryHistoryStatus {
    PENDING = 'pending',
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
};
