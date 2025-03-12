import { NotFoundError, QueryHistory } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbQueryHistory,
    QueryHistoryTableName,
    type DbQueryHistoryIn,
} from '../database/entities/queryHistory';

export class QueryHistoryModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private static convertDbQueryHistoryToQueryHistory(
        queryHistory: DbQueryHistory,
    ): QueryHistory {
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
            totalRowCount: queryHistory.total_row_count,
            warehouseQueryId: queryHistory.warehouse_query_id,
            warehouseExecutionTimeMs: queryHistory.warehouse_execution_time_ms,
            warehouseQueryMetadata: queryHistory.warehouse_query_metadata,
            status: queryHistory.status,
            error: queryHistory.error,
        };
    }

    async create(queryHistory: Omit<QueryHistory, 'queryUuid' | 'createdAt'>) {
        const [result] = await this.database(QueryHistoryTableName)
            .insert({
                created_by_user_uuid: queryHistory.createdByUserUuid,
                organization_uuid: queryHistory.organizationUuid,
                project_uuid: queryHistory.projectUuid,
                compiled_sql: queryHistory.compiledSql,
                default_page_size: queryHistory.defaultPageSize,
                context: queryHistory.context,
                metric_query: queryHistory.metricQuery,
                fields: queryHistory.fields,
                request_parameters: queryHistory.requestParameters,
                total_row_count: queryHistory.totalRowCount,
                warehouse_query_id: queryHistory.warehouseQueryId,
                warehouse_execution_time_ms:
                    queryHistory.warehouseExecutionTimeMs,
                warehouse_query_metadata: queryHistory.warehouseQueryMetadata,
                status: queryHistory.status,
                error: queryHistory.error,
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
        queryHistory: Partial<DbQueryHistoryIn>,
    ) {
        return this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .andWhere('created_by_user_uuid', userUuid)
            .update(queryHistory);
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

        return QueryHistoryModel.convertDbQueryHistoryToQueryHistory(result);
    }
}
