import type { QueryExecutionContext } from './analytics';
import type { PaginatedQueryRequestParams } from './api/paginatedQuery';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';

export type QueryHistory = {
    queryUuid: string;
    createdAt: Date;
    createdByUserUuid: string | null;
    organizationUuid: string;
    projectUuid: string | null;
    warehouseQueryId: string | null;
    context: QueryExecutionContext;
    defaultPageSize: number;
    compiledSql: string;
    warehouseExecutionTimeSeconds: number;
    totalRowCount: number;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: PaginatedQueryRequestParams;
};
