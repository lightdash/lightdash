import {
    Account,
    assertUnreachable,
    ForbiddenError,
    getContextsForTrigger,
    getQueryLanguage,
    getSemanticQuerySummary,
    getSqlFirstLine,
    getSqlQueryTitle,
    isJwtUser,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    QUERY_HISTORY_WINDOW_MINUTES,
    QUERY_HISTORY_WINDOWS_ORDERED,
    QUERY_TRIGGER_BY_CONTEXT,
    QueryExecutionContext,
    QueryHistory,
    QueryHistoryListFilters,
    QueryHistoryListItem,
    QueryHistorySortBy,
    QueryHistoryStatus,
    QueryHistoryWindow,
    QueryLanguage,
    QueryTrigger,
    sleep,
    SQL_LANGUAGE_REQUEST_PARAMETER_KEYS,
} from '@lightdash/common';
import crypto from 'crypto';
import { Knex } from 'knex';
import { customAlphabet, nanoid } from 'nanoid';
import { DashboardsTableName } from '../../database/entities/dashboards';
import {
    DbQueryHistory,
    DbQueryHistoryUpdate,
    QueryHistoryTableName,
} from '../../database/entities/queryHistory';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SavedSqlTableName } from '../../database/entities/savedSql';
import KnexPaginate from '../../database/pagination';

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
        usedParameters: queryHistory.used_parameters,
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
        preAggregateExecution: queryHistory.pre_aggregate_execution,
        preAggregateFallbackReason: queryHistory.pre_aggregate_fallback_reason,
        processingStartedAt: queryHistory.processing_started_at,
    };
}

/**
 * Rows persisted before a context value was removed from the enum would miss
 * the exhaustive lookup — bucket unknown contexts as interactive instead.
 */
function getQueryTriggerSafe(context: QueryExecutionContext): QueryTrigger {
    return (
        (QUERY_TRIGGER_BY_CONTEXT as Partial<Record<string, QueryTrigger>>)[
            context
        ] ?? QueryTrigger.INTERACTIVE
    );
}

export class QueryHistoryModel {
    readonly database: Knex;

    // Alphanumeric-only nanoid to avoid '--' sequences that break SQL comment stripping in DuckDB
    private static readonly sqlSafeNanoid = customAlphabet(
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    );

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    static getCacheKey(
        projectUuid: string,
        resultsIdentifiers: {
            sql: string;
            timezone?: string;
            userUuid: string | null;
            dataTimezone?: string;
            /**
             * External source tables version their ingested files without the
             * SQL text changing, so a refresh must produce a new key.
             */
            externalSourceSalt?: string;
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

        // The session (data) timezone changes results without changing the
        // SQL text. Appended only when defined so existing keys stay stable;
        // prefixed so it cannot collide with the display timezone above.
        if (resultsIdentifiers.dataTimezone) {
            queryHashKey += `.dtz:${resultsIdentifiers.dataTimezone}`;
        }

        if (resultsIdentifiers.externalSourceSalt) {
            queryHashKey += `.${resultsIdentifiers.externalSourceSalt}`;
        }

        return crypto.createHash('sha256').update(queryHashKey).digest('hex');
    }

    static createUniqueResultsFileName(
        cacheKey: string,
        options?: { sqlSafe: boolean },
    ) {
        return `${cacheKey}-${options?.sqlSafe ? QueryHistoryModel.sqlSafeNanoid() : nanoid()}`;
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
            | 'preAggregateCompiledSql'
            | 'preAggregateExecution'
            | 'preAggregateFallbackReason'
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
                used_parameters: queryHistory.usedParameters,
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
                // Persist original (pre-pivot) columns up front. The NATS
                // worker rebuilds its args from this row, so a null here would
                // drop the columns for pivoted queries (Bar/Line/Pie SQL charts
                // read pivotDetails.originalColumns for dashboard filters).
                original_columns: queryHistory.originalColumns,
                pre_aggregate_compiled_sql: null,
                pre_aggregate_execution: null,
                pre_aggregate_fallback_reason: null,
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

        const canReadEmbedAiQuery =
            isJwtUser(account) &&
            account.embedWriteContext?.canUseAiAgent === true &&
            !!account.embedWriteUser;

        if (canReadEmbedAiQuery) {
            void query.andWhere((builder) => {
                void builder
                    .where('created_by_account', account.user.id)
                    .orWhere((embedAiBuilder) => {
                        void embedAiBuilder
                            .where(
                                'created_by_user_uuid',
                                account.embedWriteUser!.userUuid,
                            )
                            .andWhere('context', QueryExecutionContext.AI);
                    });
            });
        } else {
            const createdByColumn = account.isRegisteredUser()
                ? 'created_by_user_uuid'
                : 'created_by_account';

            void query.andWhere(createdByColumn, account.user.id);
        }

        const result = await query.first();

        if (!result) {
            throw new NotFoundError(
                `Query ${queryUuid} not found for project ${projectUuid}`,
            );
        }

        const queryHistory = convertDbQueryHistoryToQueryHistory(result);

        const isOwnedByAccount = queryHistory.createdBy === account.user.id;
        const isOwnedByEmbedAiWriteUser =
            canReadEmbedAiQuery &&
            queryHistory.context === QueryExecutionContext.AI &&
            queryHistory.createdByUserUuid === account.embedWriteUser!.userUuid;

        if (!isOwnedByAccount && !isOwnedByEmbedAiWriteUser) {
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

    /**
     * Base query for a user's own history in a project, capped at the oldest
     * list window (30 days). `skipTrigger`/`skipWindow` let the count queries
     * drop the one filter they aggregate across.
     */
    private buildUserHistoryQuery(
        projectUuid: string,
        userUuid: string,
        filters: QueryHistoryListFilters,
        options: { skipTrigger?: boolean; skipWindow?: boolean } = {},
    ) {
        const oldestWindowMinutes =
            QUERY_HISTORY_WINDOW_MINUTES[QueryHistoryWindow.LAST_30_DAYS];

        const { database } = this;
        const query = database(QueryHistoryTableName)
            .leftJoin(SavedChartsTableName, function joinRequestChart() {
                this.on(
                    database.raw(
                        `${SavedChartsTableName}.saved_query_uuid::text = ${QueryHistoryTableName}.request_parameters->>'chartUuid'`,
                    ),
                );
            })
            .leftJoin(SavedSqlTableName, function joinRequestSqlChart() {
                this.on(
                    database.raw(
                        `${SavedSqlTableName}.saved_sql_uuid::text = ${QueryHistoryTableName}.request_parameters->>'savedSqlUuid'`,
                    ),
                );
            })
            .leftJoin(DashboardsTableName, function joinRequestDashboard() {
                this.on(
                    database.raw(
                        `${DashboardsTableName}.dashboard_uuid::text = ${QueryHistoryTableName}.request_parameters->>'dashboardUuid'`,
                    ),
                );
            })
            .where(`${QueryHistoryTableName}.project_uuid`, projectUuid)
            .where(`${QueryHistoryTableName}.created_by_user_uuid`, userUuid)
            .whereRaw(
                `${QueryHistoryTableName}.created_at > now() - (? * interval '1 minute')`,
                [oldestWindowMinutes],
            );

        if (filters.trigger && !options.skipTrigger) {
            void query.whereIn(
                `${QueryHistoryTableName}.context`,
                getContextsForTrigger(filters.trigger),
            );
        }

        if (filters.language) {
            // `\\?|` escapes the jsonb exists-any operator so knex doesn't
            // treat it as a binding placeholder.
            const sqlKeysArray = SQL_LANGUAGE_REQUEST_PARAMETER_KEYS.map(
                (key) => `'${key}'`,
            ).join(',');
            const isSqlClause = `${QueryHistoryTableName}.request_parameters \\?| array[${sqlKeysArray}]`;
            void query.whereRaw(
                filters.language === QueryLanguage.SQL
                    ? isSqlClause
                    : `not (${isSqlClause})`,
            );
        }

        if (filters.statuses && filters.statuses.length > 0) {
            void query.whereIn(
                `${QueryHistoryTableName}.status`,
                filters.statuses,
            );
        }

        if (filters.search) {
            // Escape LIKE wildcards so user input matches literally
            const escapedSearch = filters.search.replace(/[%_\\]/g, '\\$&');
            const searchPattern = `%${escapedSearch}%`;
            void query.andWhere((builder) => {
                void builder
                    .whereILike(
                        `${QueryHistoryTableName}.compiled_sql`,
                        searchPattern,
                    )
                    .orWhereRaw(
                        `${QueryHistoryTableName}.metric_query->>'exploreName' ilike ?`,
                        [searchPattern],
                    )
                    .orWhereRaw(
                        `${QueryHistoryTableName}.fields::text ilike ?`,
                        [searchPattern],
                    )
                    .orWhereILike(`${SavedChartsTableName}.name`, searchPattern)
                    .orWhereILike(`${SavedSqlTableName}.name`, searchPattern)
                    .orWhereILike(`${DashboardsTableName}.name`, searchPattern);
            });
        }

        if (filters.window && !options.skipWindow) {
            const windowIndex = QUERY_HISTORY_WINDOWS_ORDERED.indexOf(
                filters.window,
            );
            const lowerMinutes = QUERY_HISTORY_WINDOW_MINUTES[filters.window];
            void query.whereRaw(
                `${QueryHistoryTableName}.created_at > now() - (? * interval '1 minute')`,
                [lowerMinutes],
            );
            if (windowIndex > 0) {
                const upperMinutes =
                    QUERY_HISTORY_WINDOW_MINUTES[
                        QUERY_HISTORY_WINDOWS_ORDERED[windowIndex - 1]
                    ];
                void query.whereRaw(
                    `${QueryHistoryTableName}.created_at <= now() - (? * interval '1 minute')`,
                    [upperMinutes],
                );
            }
        }

        return query;
    }

    async findUserHistory(
        projectUuid: string,
        userUuid: string,
        filters: QueryHistoryListFilters,
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<DbQueryHistoryListRow[]>> {
        const query = this.buildUserHistoryQuery(
            projectUuid,
            userUuid,
            filters,
        ).select<DbQueryHistoryListRow[]>(
            `${QueryHistoryTableName}.*`,
            `${SavedChartsTableName}.name as chart_name`,
            `${SavedSqlTableName}.name as sql_chart_name`,
            `${DashboardsTableName}.name as dashboard_name`,
        );

        if (filters.sortBy === QueryHistorySortBy.RUNTIME) {
            void query.orderByRaw(
                `${QueryHistoryTableName}.warehouse_execution_time_ms desc nulls last, ${QueryHistoryTableName}.created_at desc`,
            );
        } else {
            void query.orderBy(`${QueryHistoryTableName}.created_at`, 'desc');
        }

        return KnexPaginate.paginate(query, paginateArgs);
    }

    async getUserHistoryCounts(
        projectUuid: string,
        userUuid: string,
        filters: QueryHistoryListFilters,
    ): Promise<{
        triggers: Record<QueryTrigger, number>;
        windows: Record<QueryHistoryWindow, number>;
        warehouseTimeMsLast7Days: number;
    }> {
        // Trigger totals span every window, so the tabs keep their counts as
        // the page's window sections load.
        const triggerCountsQuery = this.buildUserHistoryQuery(
            projectUuid,
            userUuid,
            filters,
            { skipTrigger: true, skipWindow: true },
        )
            .select(`${QueryHistoryTableName}.context`)
            .count(`${QueryHistoryTableName}.query_uuid as count`)
            .groupBy(`${QueryHistoryTableName}.context`);

        // One disjoint bucket per window: newer than its own bound, older than
        // the previous window's bound.
        const windowSelects = QUERY_HISTORY_WINDOWS_ORDERED.map(
            (window, index) => {
                const lowerMinutes = QUERY_HISTORY_WINDOW_MINUTES[window];
                const upperClause =
                    index > 0
                        ? ` and ${QueryHistoryTableName}.created_at <= now() - (${
                              QUERY_HISTORY_WINDOW_MINUTES[
                                  QUERY_HISTORY_WINDOWS_ORDERED[index - 1]
                              ]
                          } * interval '1 minute')`
                        : '';
                return `count(*) filter (where ${QueryHistoryTableName}.created_at > now() - (${lowerMinutes} * interval '1 minute')${upperClause}) as "${window}"`;
            },
        ).join(', ');

        const sevenDayMinutes =
            QUERY_HISTORY_WINDOW_MINUTES[QueryHistoryWindow.LAST_7_DAYS];
        const windowCountsQuery = this.buildUserHistoryQuery(
            projectUuid,
            userUuid,
            filters,
            { skipWindow: true },
        ).select(
            this.database.raw(
                `${windowSelects}, coalesce(sum(${QueryHistoryTableName}.warehouse_execution_time_ms) filter (where ${QueryHistoryTableName}.created_at > now() - (${sevenDayMinutes} * interval '1 minute')), 0) as "warehouseTimeMsLast7Days"`,
            ),
        );

        const [triggerRows, windowRows] = await Promise.all([
            triggerCountsQuery,
            windowCountsQuery,
        ]);

        const triggers: Record<QueryTrigger, number> = {
            [QueryTrigger.INTERACTIVE]: 0,
            [QueryTrigger.APPS]: 0,
            [QueryTrigger.SCHEDULED]: 0,
        };
        for (const row of triggerRows as unknown as {
            context: QueryExecutionContext;
            count: string | number;
        }[]) {
            const trigger = getQueryTriggerSafe(row.context);
            triggers[trigger] += Number(row.count);
        }

        const windowRow = (
            windowRows as unknown as Record<string, string | number>[]
        )[0];
        const windows = QUERY_HISTORY_WINDOWS_ORDERED.reduce(
            (acc, window) => {
                acc[window] = Number(windowRow?.[window] ?? 0);
                return acc;
            },
            {} as Record<QueryHistoryWindow, number>,
        );

        return {
            triggers,
            windows,
            warehouseTimeMsLast7Days: Number(
                windowRow?.warehouseTimeMsLast7Days ?? 0,
            ),
        };
    }
}

export type DbQueryHistoryListRow = DbQueryHistory & {
    chart_name: string | null;
    sql_chart_name: string | null;
    dashboard_name: string | null;
};

/**
 * Derives the list-row anatomy from the persisted query, per the design spec:
 * semantic rows are titled by explore with a metric/dimension subline; SQL
 * rows by saved chart or first CTE/table with the first line of SQL; failed
 * rows surface the error as the subline. App-triggered rows append the tile
 * and dashboard they were loaded by.
 */
export function mapQueryHistoryRowToListItem(
    row: DbQueryHistoryListRow,
): QueryHistoryListItem {
    const language = getQueryLanguage(row.request_parameters);
    const exploreName = row.metric_query?.exploreName ?? null;
    const chartName = row.chart_name ?? row.sql_chart_name;

    let title: string;
    let subline: string;
    if (language === QueryLanguage.SQL) {
        title = chartName ?? getSqlQueryTitle(row.compiled_sql) ?? 'SQL query';
        subline = getSqlFirstLine(row.compiled_sql);
    } else {
        title = exploreName ?? chartName ?? 'Query';
        subline = getSemanticQuerySummary(row.metric_query, row.fields);
    }

    if (row.dashboard_name) {
        const tilePart = chartName ? `“${chartName}” on ` : '';
        subline = subline
            ? `${subline} — ${tilePart}${row.dashboard_name}`
            : `${tilePart}${row.dashboard_name}`;
    }

    if (row.status === QueryHistoryStatus.ERROR && row.error) {
        subline = row.error;
    }

    // A run served from cache reuses a results file created by an earlier
    // execution, so the file predates the run itself.
    const cacheHit = Boolean(
        row.results_created_at &&
        new Date(row.results_created_at) < new Date(row.created_at),
    );

    return {
        queryUuid: row.query_uuid,
        createdAt: row.created_at,
        projectUuid: row.project_uuid,
        context: row.context,
        trigger: getQueryTriggerSafe(row.context),
        language,
        status: row.status,
        title,
        subline,
        error: row.error,
        exploreName,
        metricQuery:
            language === QueryLanguage.SEMANTIC ? row.metric_query : null,
        requestParameters: row.request_parameters,
        chartName: row.chart_name,
        chartUuid:
            row.request_parameters && 'chartUuid' in row.request_parameters
                ? row.request_parameters.chartUuid
                : null,
        savedSqlUuid:
            row.request_parameters && 'savedSqlUuid' in row.request_parameters
                ? row.request_parameters.savedSqlUuid
                : null,
        dashboardName: row.dashboard_name,
        dashboardUuid:
            row.request_parameters && 'dashboardUuid' in row.request_parameters
                ? row.request_parameters.dashboardUuid
                : null,
        compiledSql: row.compiled_sql,
        totalRowCount: row.total_row_count,
        warehouseExecutionTimeMs: row.warehouse_execution_time_ms,
        cacheHit,
        resultsExpiresAt: row.results_expires_at,
        processingStartedAt: row.processing_started_at,
        resultsUpdatedAt: row.results_updated_at,
        erroredAt: row.errored_at,
    };
}
