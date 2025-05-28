import {
    NotFoundError,
    QueryHistory,
    QueryHistoryStatus,
} from '@lightdash/common';
import crypto from 'crypto';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import {
    DbQueryHistory,
    DbQueryHistoryUpdate,
    QueryHistoryTableName,
} from '../../database/entities/queryHistory';

function convertDbQueryHistoryToQueryHistory(
    queryHistory: DbQueryHistory,
): QueryHistory {
    function getPivotValuesColumns() {
        if (!queryHistory.pivot_configuration) {
            return null;
        }

        const { groupByColumns, valuesColumns: valuesColumnsConfig } =
            queryHistory.pivot_configuration;

        // From ProjectService.pivotQueryWorkerTask
        return groupByColumns && groupByColumns.length > 0
            ? Object.values(queryHistory.pivot_values_columns ?? {})
            : valuesColumnsConfig.map((col) => ({
                  referenceField: col.reference,
                  pivotColumnName: `${col.reference}_${col.aggregation}`,
                  aggregation: col.aggregation,
                  pivotValues: [],
              }));
    }

    return {
        queryUuid: queryHistory.query_uuid,
        createdAt: queryHistory.created_at,
        createdByUserUuid: queryHistory.created_by_user_uuid,
        organizationUuid: queryHistory.organization_uuid,
        projectUuid: queryHistory.project_uuid,
        compiledSql: queryHistory.compiled_sql,
        defaultPageSize: queryHistory.default_page_size,
        context: queryHistory.context,
        metricQuery: queryHistory.metric_query,
        fields: queryHistory.fields,
        requestParameters: queryHistory.request_parameters,
        warehouseQueryId: queryHistory.warehouse_query_id,
        warehouseQueryMetadata: queryHistory.warehouse_query_metadata,
        status: queryHistory.status,
        totalRowCount: queryHistory.total_row_count,
        warehouseExecutionTimeMs: queryHistory.warehouse_execution_time_ms,
        error: queryHistory.error,
        cacheKey: queryHistory.cache_key,
        pivotConfiguration: queryHistory.pivot_configuration,
        pivotValuesColumns: getPivotValuesColumns(),
        pivotTotalColumnCount: queryHistory.pivot_total_column_count,
        resultsFileName: queryHistory.results_file_name,
        resultsCreatedAt: queryHistory.results_created_at,
        resultsUpdatedAt: queryHistory.results_updated_at,
        resultsExpiresAt: queryHistory.results_expires_at,
        columns: queryHistory.columns,
        originalColumns: queryHistory.original_columns,
    };
}

export class QueryHistoryModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static getCacheKey(
        projectUuid: string,
        resultsIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ) {
        const CACHE_VERSION = 'v3'; // change when we want to force invalidation
        const queryHashKey = resultsIdentifiers.timezone
            ? `${CACHE_VERSION}.${projectUuid}.${resultsIdentifiers.sql}.${resultsIdentifiers.timezone}`
            : `${CACHE_VERSION}.${projectUuid}.${resultsIdentifiers.sql}`;

        return crypto.createHash('sha256').update(queryHashKey).digest('hex');
    }

    static createUniqueResultsFileName(cacheKey: string) {
        return `${cacheKey}-${nanoid()}`;
    }

    async create(
        queryHistory: Omit<
            QueryHistory,
            | 'status'
            | 'queryUuid'
            | 'createdAt'
            | 'defaultPageSize'
            | 'totalRowCount'
            | 'warehouseQueryId'
            | 'warehouseQueryMetadata'
            | 'warehouseExecutionTimeMs'
            | 'error'
            | 'pivotValuesColumns'
            | 'pivotTotalColumnCount'
            | 'resultsFileName'
            | 'resultsCreatedAt'
            | 'resultsUpdatedAt'
            | 'resultsExpiresAt'
            | 'columns'
            | 'originalColumns'
        >,
    ) {
        const [result] = await this.database(QueryHistoryTableName)
            .insert({
                status: QueryHistoryStatus.PENDING,
                created_by_user_uuid: queryHistory.createdByUserUuid,
                organization_uuid: queryHistory.organizationUuid,
                project_uuid: queryHistory.projectUuid,
                compiled_sql: queryHistory.compiledSql,
                default_page_size: null,
                context: queryHistory.context,
                metric_query: queryHistory.metricQuery,
                fields: queryHistory.fields,
                request_parameters: queryHistory.requestParameters,
                total_row_count: null,
                warehouse_query_id: null,
                warehouse_execution_time_ms: null,
                warehouse_query_metadata: null,
                error: null,
                cache_key: queryHistory.cacheKey,
                pivot_configuration: queryHistory.pivotConfiguration,
                pivot_values_columns: null,
                pivot_total_column_count: null,
                results_file_name: null,
                results_created_at: null,
                results_updated_at: null,
                results_expires_at: null,
                columns: null,
                original_columns: null,
            })
            .returning('query_uuid');

        return {
            queryUuid: result.query_uuid,
        };
    }

    async update(
        queryUuid: string,
        projectUuid: string,
        userUuid: string,
        update: DbQueryHistoryUpdate,
    ) {
        const query = this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .andWhere('created_by_user_uuid', userUuid)
            .update(update);
        // only update pending queries to ready
        if (update.status === QueryHistoryStatus.READY) {
            void query.andWhere('status', QueryHistoryStatus.PENDING);
        }
        return query;
    }

    async get(queryUuid: string, projectUuid: string, userUuid: string) {
        const result = await this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .andWhere('created_by_user_uuid', userUuid)
            .first();

        if (!result) {
            throw new NotFoundError(
                `Query ${queryUuid} not found for project ${projectUuid}`,
            );
        }

        return convertDbQueryHistoryToQueryHistory(result);
    }

    async findMostRecentByCacheKey(cacheKey: string, projectUuid: string) {
        const result = await this.database(QueryHistoryTableName)
            .where('cache_key', cacheKey)
            .andWhere('project_uuid', projectUuid)
            .orderBy('created_at', 'desc')
            .limit(1)
            .first();

        if (!result) {
            return undefined;
        }

        return {
            totalRowCount: result.total_row_count,
            cacheKey: result.cache_key,
            pivotValuesColumns: result.pivot_values_columns,
            pivotTotalColumnCount: result.pivot_total_column_count,
            resultsFileName: result.results_file_name,
            resultsCreatedAt: result.results_created_at,
            resultsUpdatedAt: result.results_updated_at,
            resultsExpiresAt: result.results_expires_at,
            columns: result.columns,
            originalColumns: result.original_columns,
        };
    }
}
