import type { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import { WarehouseTypes } from './projects';
import type { WarehouseAsyncQueryStatus } from './warehouse';

export interface IWarehouseQueryMetadata {
    type: WarehouseTypes;
}

export interface BigQueryWarehouseQueryMetadata
    extends IWarehouseQueryMetadata {
    type: WarehouseTypes.BIGQUERY;
    jobLocation: string;
}

export type WarehouseQueryMetadata = BigQueryWarehouseQueryMetadata;

export function isBigQueryWarehouseQueryMetadata(
    metadata: WarehouseQueryMetadata | null,
): metadata is BigQueryWarehouseQueryMetadata {
    return !!metadata && metadata.type === WarehouseTypes.BIGQUERY;
}

export type QueryHistory = {
    queryUuid: string;
    createdAt: Date;
    createdByUserUuid: string | null;
    organizationUuid: string;
    projectUuid: string | null;
    warehouseQueryId: string | null;
    warehouseQueryMetadata: WarehouseQueryMetadata | null;
    context: QueryExecutionContext;
    defaultPageSize: number | null;
    compiledSql: string;
    warehouseExecutionTimeMs: number;
    totalRowCount: number | null;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: ExecuteAsyncQueryRequestParams;
    status: WarehouseAsyncQueryStatus;
    error: string | null;
};
