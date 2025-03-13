import {
    assertUnreachable,
    NotFoundError,
    QueryHistory,
    QueryHistoryStatus,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    QueryHistoryTableName,
    type DbQueryHistory,
    type DbQueryHistoryUpdate,
} from '../database/entities/queryHistory';

function convertDbQueryHistoryToQueryHistory(
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
        warehouseQueryId: queryHistory.warehouse_query_id,
        warehouseQueryMetadata: queryHistory.warehouse_query_metadata,
        status: queryHistory.status,
        totalRowCount: queryHistory.total_row_count,
        warehouseExecutionTimeMs: queryHistory.warehouse_execution_time_ms,
        error: queryHistory.error,
    };
}

export class QueryHistoryModel {
    readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
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
        return this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .andWhere('created_by_user_uuid', userUuid)
            .update(update);
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
}
