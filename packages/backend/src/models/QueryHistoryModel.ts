import { QueryHistory } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbQueryHistory,
    DbQueryHistoryIn,
    QueryHistoryTableName,
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
            warehouseQueryId: queryHistory.warehouse_query_id,
            compiledSql: queryHistory.compiled_sql,
            defaultPageSize: queryHistory.default_page_size,
            context: queryHistory.context,
            metricQuery: queryHistory.metric_query,
            fields: queryHistory.fields,
            requestParameters: queryHistory.request_parameters,
            warehouseExecutionTimeSeconds:
                queryHistory.warehouse_execution_time_seconds,
            totalRowCount: queryHistory.total_row_count,
        };
    }

    async create(queryHistory: Omit<QueryHistory, 'queryUuid' | 'createdAt'>) {
        const [result] = await this.database(QueryHistoryTableName)
            .insert({
                created_by_user_uuid: queryHistory.createdByUserUuid,
                organization_uuid: queryHistory.organizationUuid,
                project_uuid: queryHistory.projectUuid,
                warehouse_query_id: queryHistory.warehouseQueryId,
                compiled_sql: queryHistory.compiledSql,
                default_page_size: queryHistory.defaultPageSize,
                context: queryHistory.context,
                metric_query: queryHistory.metricQuery,
                fields: queryHistory.fields,
                request_parameters: queryHistory.requestParameters,
                warehouse_execution_time_seconds:
                    queryHistory.warehouseExecutionTimeSeconds,
                total_row_count: queryHistory.totalRowCount,
            })
            .returning('query_uuid');

        return result;
    }

    async get(queryUuid: string, projectUuid: string) {
        const result = await this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .first();

        return result;
    }
}
