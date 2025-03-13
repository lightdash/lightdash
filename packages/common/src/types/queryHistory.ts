import type { QueryExecutionContext } from './analytics';
import type { PaginatedQueryRequestParams } from './api/paginatedQuery';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import { WarehouseTypes } from './projects';

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
    defaultPageSize: number;
    compiledSql: string;
    warehouseExecutionTimeMs: number;
    totalRowCount: number;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: PaginatedQueryRequestParams;
};
