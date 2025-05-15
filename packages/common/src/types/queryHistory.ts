import type { PivotIndexColum } from '..';
import type { PivotValuesColumn } from '../visualizations/types';
import type { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import { WarehouseTypes } from './projects';
import type { GroupByColumn, SortBy, ValuesColumn } from './sqlRunner';

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

export enum QueryHistoryStatus {
    PENDING = 'pending',
    READY = 'ready',
    ERROR = 'error',
    CANCELLED = 'cancelled',
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
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: ExecuteAsyncQueryRequestParams;
    status: QueryHistoryStatus;
    totalRowCount: number | null;
    warehouseExecutionTimeMs: number | null;
    error: string | null;
    cacheKey: string | null;
    pivotConfiguration: {
        indexColumn: PivotIndexColum;
        valuesColumns: ValuesColumn[];
        groupByColumns: GroupByColumn[] | undefined;
        sortBy: SortBy | undefined;
    } | null;
    pivotValuesColumns: PivotValuesColumn[] | null;
    pivotTotalColumnCount: number | null;
};
