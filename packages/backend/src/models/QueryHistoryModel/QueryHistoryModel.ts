import {
    Account,
    assertUnreachable,
    ForbiddenError,
    NotFoundError,
    QueryHistory,
    QueryHistoryStatus,
    sleep,
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
    return {
        queryUuid: queryHistory.query_uuid,
        createdAt: queryHistory.created_at,
        createdBy:
            queryHistory.created_by_user_uuid ??
            queryHistory.created_by_account,
        createdByUserUuid: queryHistory.created_by_user_uuid,
        createdByAccount: queryHistory.created_by_account,
        createdByActorType: queryHistory.created_by_actor_type,
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
        erroredAt: queryHistory.errored_at,
        cacheKey: queryHistory.cache_key,
        pivotConfiguration: queryHistory.pivot_configuration,
        pivotValuesColumns: queryHistory.pivot_values_columns,
        pivotTotalColumnCount: queryHistory.pivot_total_column_count,
        resultsFileName: queryHistory.results_file_name,
        resultsCreatedAt: queryHistory.results_created_at,
        resultsUpdatedAt: queryHistory.results_updated_at,
        resultsExpiresAt: queryHistory.results_expires_at,
        columns: queryHistory.columns,
        originalColumns: queryHistory.original_columns,
        preAggregateCompiledSql: queryHistory.pre_aggregate_compiled_sql,
        processingStartedAt: queryHistory.processing_started_at,
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
            userUuid: string | null;
        },
    ) {
        const CACHE_VERSION = 'v3'; // change when we want to force invalidation
        let queryHashKey = `${CACHE_VERSION}.${projectUuid}`;

        // Include user UUID in cache key to prevent sharing cache between users
        // when user-specific warehouse credentials are in use
        if (resultsIdentifiers.userUuid) {
            queryHashKey += `.${resultsIdentifiers.userUuid}`;
        }

        queryHashKey += `.${resultsIdentifiers.sql}`;

        if (resultsIdentifiers.timezone) {
            queryHashKey += `.${resultsIdentifiers.timezone}`;
        }

        return crypto.createHash('sha256').update(queryHashKey).digest('hex');
    }

    static createUniqueResultsFileName(cacheKey: string) {
        return `${cacheKey}-${nanoid()}`;
    }

    async create(
        account: Account,
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
            | 'erroredAt'
            | 'pivotValuesColumns'
            | 'pivotTotalColumnCount'
            | 'resultsFileName'
            | 'resultsCreatedAt'
            | 'resultsUpdatedAt'
            | 'resultsExpiresAt'
            | 'columns'
            | 'originalColumns'
            | 'preAggregateCompiledSql'
            | 'processingStartedAt'
            | 'createdByAccount'
            | 'createdByUserUuid'
            | 'createdByActorType'
            | 'createdBy'
        >,
    ) {
        const [result] = await this.database(QueryHistoryTableName)
            .insert({
                status: QueryHistoryStatus.PENDING,
                created_by_user_uuid: account.isRegisteredUser()
                    ? account.user.id
                    : null,
                created_by_account: account.isAnonymousUser()
                    ? account.user.id
                    : null,
                created_by_actor_type: account.authentication.type,
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
                errored_at: null,
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
                pre_aggregate_compiled_sql: null,
                processing_started_at: null,
            })
            .returning('query_uuid');

        return {
            queryUuid: result.query_uuid,
        };
    }

    async update(
        queryUuid: string,
        projectUuid: string,
        update: DbQueryHistoryUpdate,
        account: Pick<Account, 'isRegisteredUser'> & {
            user: Pick<Account['user'], 'id'>;
        },
    ) {
        const query = this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid)
            .update(update);

        const createdByColumn = account.isRegisteredUser()
            ? 'created_by_user_uuid'
            : 'created_by_account';
        void query.andWhere(createdByColumn, account.user.id);

        // Only allow READY from PENDING (non-NATS) or EXECUTING (NATS).
        if (update.status === QueryHistoryStatus.READY) {
            void query.whereIn('status', [
                QueryHistoryStatus.PENDING,
                QueryHistoryStatus.EXECUTING,
            ]);
        }
        return query;
    }

    async updateStatusToQueued(queryUuid: string): Promise<number> {
        return this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('status', QueryHistoryStatus.PENDING)
            .update({
                status: QueryHistoryStatus.QUEUED,
            });
    }

    async updateStatusToExecuting(queryUuid: string): Promise<number> {
        return this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .whereIn('status', [
                QueryHistoryStatus.PENDING,
                QueryHistoryStatus.QUEUED,
            ])
            .update({
                status: QueryHistoryStatus.EXECUTING,
                processing_started_at: new Date(),
            });
    }

    async updateStatusToExpired(
        queryUuid: string,
        error: string,
    ): Promise<number> {
        return this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .whereIn('status', [
                QueryHistoryStatus.PENDING,
                QueryHistoryStatus.QUEUED,
            ])
            .update({
                status: QueryHistoryStatus.EXPIRED,
                error,
                processing_started_at: new Date(),
            });
    }

    async updateStatusToError(
        queryUuid: string,
        projectUuid: string,
        error: string,
        account: Pick<Account, 'isRegisteredUser'> & {
            user: Pick<Account['user'], 'id'>;
        },
    ) {
        return this.update(
            queryUuid,
            projectUuid,
            {
                status: QueryHistoryStatus.ERROR,
                error,
                errored_at: new Date(),
            },
            account,
        );
    }

    async get(queryUuid: string, projectUuid: string, account: Account) {
        const query = this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .andWhere('project_uuid', projectUuid);

        const createdByColumn = account.isRegisteredUser()
            ? 'created_by_user_uuid'
            : 'created_by_account';

        void query.andWhere(createdByColumn, account.user.id);

        const result = await query.first();

        if (!result) {
            throw new NotFoundError(
                `Query ${queryUuid} not found for project ${projectUuid}`,
            );
        }

        const queryHistory = convertDbQueryHistoryToQueryHistory(result);

        if (queryHistory.createdBy !== account.user.id) {
            throw new ForbiddenError(
                'User is not authorized to access this query',
            );
        }

        return queryHistory;
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

    async getByQueryUuid(queryUuid: string): Promise<QueryHistory | undefined> {
        const result = await this.database(QueryHistoryTableName)
            .where('query_uuid', queryUuid)
            .first<DbQueryHistory>();

        return result ? convertDbQueryHistoryToQueryHistory(result) : undefined;
    }

    async pollForQueryCompletion({
        queryUuid,
        account,
        projectUuid,
        initialBackoffMs = 500,
        maxBackoffMs = 2000,
        timeoutMs = 5 * 60 * 1000,
        throwOnCancelled = true,
        throwOnError = true,
    }: {
        queryUuid: string;
        account: Account;
        projectUuid: string;
        initialBackoffMs?: number;
        maxBackoffMs?: number;
        timeoutMs?: number;
        throwOnCancelled?: boolean;
        throwOnError?: boolean;
    }): Promise<QueryHistory> {
        const startTime = Date.now();
        const getQueryHistory = () => this.get(queryUuid, projectUuid, account);

        const poll = async (backoffMs: number): Promise<QueryHistory> => {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Query polling timed out after ${timeoutMs}ms`);
            }

            const queryHistory = await getQueryHistory();
            if (!queryHistory) {
                await sleep(backoffMs);
                return poll(Math.min(backoffMs * 2, maxBackoffMs));
            }

            switch (queryHistory.status) {
                case QueryHistoryStatus.CANCELLED:
                    if (throwOnCancelled) {
                        throw new Error('Query was cancelled');
                    }
                    return queryHistory;
                case QueryHistoryStatus.ERROR:
                case QueryHistoryStatus.EXPIRED:
                    if (throwOnError) {
                        throw new Error(
                            queryHistory.error ?? 'Warehouse query failed',
                        );
                    }
                    return queryHistory;
                case QueryHistoryStatus.PENDING:
                case QueryHistoryStatus.QUEUED:
                case QueryHistoryStatus.EXECUTING:
                    await sleep(backoffMs);
                    return poll(Math.min(backoffMs * 2, maxBackoffMs));
                case QueryHistoryStatus.READY:
                    return queryHistory;
                default:
                    return assertUnreachable(
                        queryHistory.status,
                        'Unknown query status',
                    );
            }
        };

        return poll(initialBackoffMs);
    }

    async cleanupBatch(
        cutoffDate: Date,
        batchSize: number,
        delayMs: number,
        maxBatches?: number,
        totalDeleted: number = 0,
        batchCount: number = 0,
    ): Promise<{ totalDeleted: number; batchCount: number }> {
        // Get IDs to delete
        const idsToDelete = await this.database(QueryHistoryTableName)
            .select('query_uuid')
            .where('created_at', '<', cutoffDate)
            .orderBy('created_at', 'asc')
            .limit(batchSize);

        if (idsToDelete.length === 0) {
            return { totalDeleted, batchCount };
        }

        // Delete by IDs
        const deletedCount = await this.database(QueryHistoryTableName)
            .whereIn(
                'query_uuid',
                idsToDelete.map((row) => row.query_uuid),
            )
            .del();

        if (deletedCount === 0) {
            return { totalDeleted, batchCount };
        }

        const newTotalDeleted = totalDeleted + deletedCount;
        const newBatchCount = batchCount + 1;

        // Check if we've reached the maximum number of batches
        if (maxBatches !== undefined && newBatchCount >= maxBatches) {
            return { totalDeleted: newTotalDeleted, batchCount: newBatchCount };
        }

        // Add delay between batches to prevent database overload
        if (deletedCount === batchSize) {
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), delayMs);
            });
        }

        // Continue with next batch if we deleted a full batch
        if (deletedCount === batchSize) {
            return this.cleanupBatch(
                cutoffDate,
                batchSize,
                delayMs,
                maxBatches,
                newTotalDeleted,
                newBatchCount,
            );
        }

        return { totalDeleted: newTotalDeleted, batchCount: newBatchCount };
    }
}
