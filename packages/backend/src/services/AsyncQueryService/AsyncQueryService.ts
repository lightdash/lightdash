import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    type ApiGetAsyncQueryResults,
    assertUnreachable,
    CompiledDimension,
    convertFieldRefToFieldId,
    convertItemTypeToDimensionType,
    createVirtualView as createVirtualViewObject,
    CreateWarehouseCredentials,
    type CustomDimension,
    DashboardFilters,
    DEFAULT_RESULTS_PAGE_SIZE,
    DimensionType,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    Explore,
    ForbiddenError,
    formatRow,
    getDashboardFilterRulesForTables,
    getDimensions,
    getErrorMessage,
    getIntrinsicUserAttributes,
    getItemId,
    GroupByColumn,
    isCartesianChartConfig,
    isCustomBinDimension,
    isCustomDimension,
    isCustomSqlDimension,
    isDateItem,
    isField,
    isMetric,
    isUserWithOrg,
    isVizTableConfig,
    ItemsMap,
    MetricQuery,
    type Organization,
    PivotIndexColum,
    prefixPivotConfigurationReferences,
    type Project,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ResultColumns,
    type RunQueryTags,
    SessionUser,
    SortBy,
    type SpaceShare,
    type SpaceSummary,
    SqlChart,
    ValuesColumn,
    WarehouseClient,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import { measureTime } from '../../logging/measureTime';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import { applyLimitToSqlQuery } from '../../queryBuilder';
import { wrapSentryTransaction } from '../../utils';
import type { ICacheService } from '../CacheService/ICacheService';
import {
    CreateCacheResult,
    MissCacheResult,
    ResultsCacheStatus,
} from '../CacheService/types';
import {
    ProjectService,
    type ProjectServiceArguments,
} from '../ProjectService/ProjectService';
import {
    getNextAndPreviousPage,
    validatePagination,
} from '../ProjectService/resultsPagination';
import {
    type ExecuteAsyncDashboardChartQueryArgs,
    type ExecuteAsyncDashboardSqlChartArgs,
    type ExecuteAsyncMetricQueryArgs,
    type ExecuteAsyncQueryReturn,
    type ExecuteAsyncSavedChartQueryArgs,
    type ExecuteAsyncSqlChartArgs,
    ExecuteAsyncSqlQueryArgs,
    type ExecuteAsyncUnderlyingDataQueryArgs,
    type GetAsyncQueryResultsArgs,
    isExecuteAsyncDashboardSqlChartByUuid,
    isExecuteAsyncSqlChartByUuid,
} from './types';

type AsyncQueryServiceArguments<ResultsCacheStorageClient = unknown> =
    ProjectServiceArguments & {
        queryHistoryModel: QueryHistoryModel;
        cacheService?: ICacheService<ResultsCacheStorageClient>;
        savedSqlModel: SavedSqlModel;
    };

export class AsyncQueryService<
    ResultsCacheStorageClient = unknown,
> extends ProjectService {
    queryHistoryModel: QueryHistoryModel;

    cacheService?: ICacheService<ResultsCacheStorageClient>;

    savedSqlModel: SavedSqlModel;

    constructor({
        queryHistoryModel,
        cacheService,
        savedSqlModel,
        ...projectServiceArgs
    }: AsyncQueryServiceArguments<ResultsCacheStorageClient>) {
        super(projectServiceArgs);
        this.queryHistoryModel = queryHistoryModel;
        this.cacheService = cacheService;
        this.savedSqlModel = savedSqlModel;
    }

    // ! Duplicate of SavedSqlService.hasAccess
    private async hasAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        {
            spaceUuid,
            projectUuid,
            organizationUuid,
        }: { spaceUuid: string; projectUuid: string; organizationUuid: string },
    ): Promise<{ hasAccess: boolean; userAccess: SpaceShare | undefined }> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        const hasPermission = user.ability.can(
            action,
            subject('SavedChart', {
                organizationUuid,
                projectUuid,
                isPrivate: space.isPrivate,
                access,
            }),
        );

        return {
            hasAccess: hasPermission,
            userAccess: access[0],
        };
    }

    // ! Duplicate of SavedSqlService.hasSavedChartAccess
    private async hasSavedChartAccess(
        user: SessionUser,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        savedChart: {
            project: Pick<Project, 'projectUuid'>;
            organization: Pick<Organization, 'organizationUuid'>;
            space: Pick<SpaceSummary, 'uuid'>;
        },
    ) {
        return this.hasAccess(user, action, {
            spaceUuid: savedChart.space.uuid,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
        });
    }

    async cancelAsyncQuery({
        user,
        projectUuid,
        queryUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryUuid: string;
    }): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            user.userUuid,
        );

        if (user.userUuid !== queryHistory.createdByUserUuid) {
            throw new ForbiddenError(
                'User is not allowed to cancel this query',
            );
        }

        await this.queryHistoryModel.update(
            queryUuid,
            projectUuid,
            user.userUuid,
            {
                status: QueryHistoryStatus.CANCELLED,
            },
        );
    }

    async getAsyncQueryResults({
        user,
        projectUuid,
        queryUuid,
        page = 1,
        pageSize,
    }: GetAsyncQueryResultsArgs): Promise<ApiGetAsyncQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            user.userUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (user.userUuid !== queryHistory.createdByUserUuid) {
            throw new ForbiddenError(
                'User is not allowed to fetch results for this query',
            );
        }

        const {
            metricQuery,
            context,
            status,
            totalRowCount,
            cacheKey,
            fields,
        } = queryHistory;

        // Ideally, we should use the warehouse results columns metadata. For now we can rely on the fields.
        const columns = Object.values(fields).reduce<ResultColumns>(
            (acc, field) => {
                const column = {
                    reference: field.name,
                    type: convertItemTypeToDimensionType(field),
                };
                acc[column.reference] = column;
                return acc;
            },
            {},
        );

        const defaultedPageSize =
            pageSize ??
            queryHistory.defaultPageSize ??
            DEFAULT_RESULTS_PAGE_SIZE;

        validatePagination({
            pageSize: defaultedPageSize,
            page,
            queryMaxLimit: this.lightdashConfig.query.maxPageSize,
            totalRowCount,
        });

        const resultsCacheEnabled =
            this.lightdashConfig.resultsCache?.resultsEnabled;

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.PENDING:
                if (resultsCacheEnabled && cacheKey && this.cacheService) {
                    const cache = await this.cacheService.findCache(
                        cacheKey,
                        projectUuid,
                    );

                    if (cache?.status === ResultsCacheStatus.READY) {
                        // If the cache is ready, we update the query history status to READY and return the current state
                        // This avoids a race condition where the query history was READY but the cache (triggered by another request) was still being written
                        this.logger.debug(
                            `Updating query history status to READY for query ${queryUuid} in project ${projectUuid}. Cache status: ${cache?.status}`,
                        );
                        void this.queryHistoryModel.update(
                            queryUuid,
                            projectUuid,
                            user.userUuid,
                            {
                                status: QueryHistoryStatus.READY,
                                total_row_count: cache.totalRowCount,
                            },
                        );
                    }
                }

                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.ERROR:
                return {
                    status,
                    queryUuid,
                    error: queryHistory.error,
                };
            case QueryHistoryStatus.READY:
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

        const formatter = (row: Record<string, unknown>) =>
            formatRow(row, queryHistory.fields);

        let returnObject: ApiGetAsyncQueryResults;
        let roundedDurationMs: number;
        if (resultsCacheEnabled && cacheKey && this.cacheService) {
            // Need to save to a variable, otherwise TS doesn't carry over the fact that this.cacheService is not undefined through the measureTime call
            const { cacheService } = this;
            const {
                result: { rows, totalRowCount: cacheTotalRowCount, expiresAt },
                durationMs,
            } = await measureTime(
                () =>
                    cacheService.getCachedResultsPage(
                        cacheKey,
                        projectUuid,
                        page,
                        defaultedPageSize,
                        formatter,
                    ),
                'getCachedResultsPage',
                this.logger,
                context,
            );

            const pageCount = Math.ceil(cacheTotalRowCount / defaultedPageSize);

            roundedDurationMs = Math.round(durationMs);

            const { nextPage, previousPage } = getNextAndPreviousPage(
                page,
                pageCount,
            );

            this.analytics.track({
                userId: user.userUuid,
                event: 'results_cache.read',
                properties: {
                    queryId: queryHistory.queryUuid,
                    projectId: projectUuid,
                    cacheKey,
                    page,
                    requestedPageSize: defaultedPageSize,
                    rowCount: rows.length,
                    resultsPageExecutionMs: roundedDurationMs,
                },
            });

            this.analytics.track({
                userId: user.userUuid,
                event: 'query_page.fetched',
                properties: {
                    queryId: queryHistory.queryUuid,
                    projectId: projectUuid,
                    warehouseType:
                        queryHistory?.warehouseQueryMetadata?.type ?? null,
                    page,
                    columnsCount: Object.keys(queryHistory.fields).length,
                    totalRowCount: cacheTotalRowCount,
                    totalPageCount: pageCount,
                    resultsPageSize: rows.length,
                    resultsPageExecutionMs: roundedDurationMs,
                    status,
                    cacheMetadata: {
                        cacheExpiresAt: expiresAt,
                        cacheKey,
                    },
                },
            });

            returnObject = {
                rows,
                columns,
                totalPageCount: pageCount,
                totalResults: cacheTotalRowCount,
                queryUuid: queryHistory.queryUuid,
                pageSize: rows.length,
                page,
                nextPage,
                previousPage,
                initialQueryExecutionMs:
                    queryHistory.warehouseExecutionTimeMs ?? roundedDurationMs,
                resultsPageExecutionMs: roundedDurationMs,
                status,
            };
        } else {
            let explore: Explore | undefined;

            try {
                explore = await this.getExplore(
                    user,
                    projectUuid,
                    metricQuery.exploreName,
                );
            } catch (e) {
                // No-op, if we don't find an explore that's fine as we're only using it to get warehouse overrides for the client
                // SQL Runner queries don't have an explore, they use a virtual view which is not saved in the database
            }

            const { warehouseClient, sshTunnel } =
                await this._getWarehouseClient(
                    projectUuid,
                    await this.getWarehouseCredentials(
                        projectUuid,
                        user.userUuid,
                    ),
                    {
                        snowflakeVirtualWarehouse: explore?.warehouse,
                        databricksCompute: explore?.databricksCompute,
                    },
                );

            const queryTags: RunQueryTags = {
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                user_uuid: user.userUuid,
                explore_name: metricQuery.exploreName,
                query_context: context,
            };

            const { result, durationMs } = await measureTime(
                () =>
                    warehouseClient
                        .getAsyncQueryResults(
                            {
                                page,
                                pageSize: defaultedPageSize,
                                tags: queryTags,
                                queryId: queryHistory.warehouseQueryId,
                                sql: queryHistory.compiledSql,
                                queryMetadata:
                                    queryHistory.warehouseQueryMetadata,
                            },
                            formatter,
                        )
                        .catch((e) => ({ errorMessage: getErrorMessage(e) })),
                'getAsyncQueryResults',
                this.logger,
                context,
            );

            if ('errorMessage' in result) {
                this.analytics.track({
                    userId: user.userUuid,
                    event: 'query.error',
                    properties: {
                        queryId: queryHistory.queryUuid,
                        projectId: projectUuid,
                        warehouseType: warehouseClient.credentials.type,
                    },
                });
                await this.queryHistoryModel.update(
                    queryHistory.queryUuid,
                    projectUuid,
                    user.userUuid,
                    {
                        status: QueryHistoryStatus.ERROR,
                        error: result.errorMessage,
                    },
                );

                return {
                    status: QueryHistoryStatus.ERROR,
                    error: result.errorMessage,
                    queryUuid: queryHistory.queryUuid,
                };
            }

            roundedDurationMs = Math.round(durationMs);

            this.analytics.track({
                userId: user.userUuid,
                event: 'query_page.fetched',
                properties: {
                    queryId: queryHistory.queryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                    page,
                    columnsCount: Object.keys(result.fields).length,
                    totalRowCount: result.totalRows,
                    totalPageCount: result.pageCount,
                    resultsPageSize: result.rows.length,
                    resultsPageExecutionMs: roundedDurationMs,
                    status,
                    cacheMetadata: null,
                },
            });

            const { nextPage, previousPage } = getNextAndPreviousPage(
                page,
                result.pageCount,
            );

            returnObject = {
                columns,
                rows: result.rows,
                totalPageCount: result.pageCount,
                totalResults: result.totalRows,
                queryUuid: queryHistory.queryUuid,
                pageSize: result.rows.length,
                page,
                nextPage,
                previousPage,
                initialQueryExecutionMs:
                    queryHistory.warehouseExecutionTimeMs ?? roundedDurationMs,
                resultsPageExecutionMs: roundedDurationMs,
                status,
            };

            await sshTunnel.disconnect();
        }

        /**
         * Update the query history with non null values
         * defaultPageSize is null when user never fetched the results - we don't send pagination params to the query execution endpoint
         * warehouseExecutionTimeMs is null when warehouse doesn't support async queries - query is only executed when user fetches results
         * totalRowCount is null when warehouse doesn't support async queries - query is only executed when user fetches results
         */
        if (
            queryHistory.defaultPageSize === null ||
            queryHistory.warehouseExecutionTimeMs === null ||
            queryHistory.totalRowCount === null
        ) {
            await this.queryHistoryModel.update(
                queryHistory.queryUuid,
                projectUuid,
                user.userUuid,
                {
                    ...(queryHistory.defaultPageSize === null
                        ? { default_page_size: defaultedPageSize }
                        : {}),
                    ...(queryHistory.warehouseExecutionTimeMs === null
                        ? {
                              warehouse_execution_time_ms: roundedDurationMs,
                          }
                        : {}),
                    ...(queryHistory.totalRowCount === null
                        ? { total_row_count: returnObject.totalResults }
                        : {}),
                },
            );
        }

        return returnObject;
    }

    /**
     * Runs the query the warehouse and updates the query history and cache (if cache is enabled and cache is not hit) when complete
     */
    private async runAsyncWarehouseQuery({
        user,
        projectUuid,
        query,
        fieldsMap,
        queryTags,
        warehouseClient,
        sshTunnel,
        queryHistoryUuid,
        resultsCache,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryTags: RunQueryTags;
        query: string;
        fieldsMap: ItemsMap;
        queryHistoryUuid: string;
        resultsCache?: MissCacheResult;
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
    }) {
        try {
            const { queryId, queryMetadata, totalRows, durationMs } =
                await warehouseClient.executeAsyncQuery(
                    {
                        sql: query,
                        tags: queryTags,
                    },
                    resultsCache?.write,
                );

            this.analytics.track({
                userId: user.userUuid,
                event: 'query.ready',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                    warehouseExecutionTimeMs: durationMs,
                    columnsCount: Object.keys(fieldsMap).length,
                    totalRowCount: totalRows,
                },
            });

            // Wait for the cache to be written before marking the query as ready
            if (resultsCache) {
                await resultsCache.close();
                await this.cacheService?.updateCache(
                    resultsCache.cacheKey,
                    projectUuid,
                    {
                        status: ResultsCacheStatus.READY,
                        total_row_count: totalRows,
                    },
                );
                this.analytics.track({
                    userId: user.userUuid,
                    event: 'results_cache.write',
                    properties: {
                        queryId: queryHistoryUuid,
                        projectId: projectUuid,
                        cacheKey: resultsCache.cacheKey,
                        totalRowCount: totalRows,
                    },
                });
            }

            await this.queryHistoryModel.update(
                queryHistoryUuid,
                projectUuid,
                user.userUuid,
                {
                    warehouse_query_id: queryId,
                    warehouse_query_metadata: queryMetadata,
                    status: QueryHistoryStatus.READY,
                    error: null,
                    warehouse_execution_time_ms:
                        durationMs !== null ? Math.round(durationMs) : null,
                    total_row_count: totalRows,
                },
            );
        } catch (e) {
            this.analytics.track({
                userId: user.userUuid,
                event: 'query.error',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                },
            });
            await this.queryHistoryModel.update(
                queryHistoryUuid,
                projectUuid,
                user.userUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: getErrorMessage(e),
                },
            );

            // When the query fails, we delete the cache entry
            if (resultsCache) {
                await this.cacheService?.deleteCache(
                    resultsCache.cacheKey,
                    projectUuid,
                );
                this.analytics.track({
                    userId: user.userUuid,
                    event: 'results_cache.delete',
                    properties: {
                        queryId: queryHistoryUuid,
                        projectId: projectUuid,
                        cacheKey: resultsCache.cacheKey,
                    },
                });
            }
        } finally {
            void sshTunnel.disconnect();

            if (resultsCache) {
                void resultsCache.close();
            }
        }
    }

    async executeAsyncQuery(
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            explore: Explore;
        },
        requestParameters: ExecuteAsyncQueryRequestParams,
        {
            warehouseClient,
            sshTunnel,
        }: {
            warehouseClient: WarehouseClient;
            sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        },
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        },
    ): Promise<ExecuteAsyncQueryReturn> {
        return wrapSentryTransaction(
            'ProjectService.executeAsyncQuery',
            {},
            async (span) => {
                const {
                    user,
                    projectUuid,
                    context,
                    dateZoom,
                    queryTags,
                    explore,
                } = args;

                try {
                    if (!isUserWithOrg(user)) {
                        throw new ForbiddenError(
                            'User is not part of an organization',
                        );
                    }

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    if (
                        user.ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid,
                                projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );

                    const { metricQuery } = args;
                    const userAttributes =
                        await this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );

                    const emailStatus =
                        await this.emailModel.getPrimaryEmailStatus(
                            user.userUuid,
                        );
                    const intrinsicUserAttributes = emailStatus.isVerified
                        ? getIntrinsicUserAttributes(user)
                        : {};

                    const fullQuery = await ProjectService._compileQuery(
                        metricQuery,
                        explore,
                        warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes,
                        this.lightdashConfig.query.timezone || 'UTC',
                        dateZoom,
                    );

                    const {
                        query: compiledQuery,
                        fields: fieldsFromQuery,
                        hasExampleMetric,
                    } = fullQuery;

                    let pivotedQuery = null;
                    if (pivotConfiguration) {
                        pivotedQuery =
                            await ProjectService.applyPivotToSqlQuery({
                                warehouseType: warehouseClient.credentials.type,
                                sql: compiledQuery,
                                indexColumn: pivotConfiguration.indexColumn,
                                valuesColumns: pivotConfiguration.valuesColumns,
                                groupByColumns:
                                    pivotConfiguration.groupByColumns,
                                sortBy: pivotConfiguration.sortBy,
                            });
                    }

                    const query = pivotedQuery || compiledQuery;

                    const fieldsWithOverrides: ItemsMap = Object.fromEntries(
                        Object.entries(fieldsFromQuery).map(([key, value]) => {
                            if (
                                metricQuery.metricOverrides &&
                                metricQuery.metricOverrides[key]
                            ) {
                                return [
                                    key,
                                    {
                                        ...value,
                                        ...metricQuery.metricOverrides[key],
                                    },
                                ];
                            }
                            return [key, value];
                        }),
                    );

                    const fieldsMap = fieldsWithOverrides;
                    span.setAttribute('generatedSql', query);

                    const onboardingRecord =
                        await this.onboardingModel.getByOrganizationUuid(
                            user.organizationUuid,
                        );

                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            user.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                    }

                    const resultsCacheEnabled =
                        this.lightdashConfig.resultsCache?.resultsEnabled;

                    let resultsCache: CreateCacheResult | undefined;

                    if (resultsCacheEnabled && this.cacheService) {
                        resultsCache =
                            await this.cacheService.createOrGetExistingCache(
                                projectUuid,
                                {
                                    sql: query,
                                    timezone: metricQuery.timezone,
                                },
                                args.invalidateCache,
                            );

                        if (!resultsCache.cacheHit) {
                            this.analytics.track({
                                userId: user.userUuid,
                                event: 'results_cache.create',
                                properties: {
                                    projectId: projectUuid,
                                    cacheKey: resultsCache.cacheKey,
                                    totalRowCount: resultsCache.totalRowCount,
                                    createdAt: resultsCache.createdAt,
                                    expiresAt: resultsCache.expiresAt,
                                },
                            });
                        }
                    }

                    const { queryUuid: queryHistoryUuid } =
                        await this.queryHistoryModel.create({
                            projectUuid,
                            organizationUuid,
                            createdByUserUuid: user.userUuid,
                            context,
                            fields: fieldsMap,
                            compiledSql: query,
                            requestParameters,
                            metricQuery,
                            cacheKey: resultsCache?.cacheKey || null,
                        });

                    this.analytics.track({
                        userId: user.userUuid,
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            context,
                            queryId: queryHistoryUuid,
                            warehouseType: warehouseClient.credentials.type,
                            ...ProjectService.getMetricQueryExecutionProperties(
                                {
                                    metricQuery,
                                    hasExampleMetric,
                                    queryTags,
                                    dateZoom,
                                    chartUuid:
                                        'chartUuid' in requestParameters
                                            ? requestParameters.chartUuid
                                            : undefined,
                                    explore,
                                },
                            ),
                            cacheMetadata: {
                                cacheHit: resultsCache?.cacheHit || false,
                                cacheUpdatedTime: resultsCache?.updatedAt,
                                cacheExpiresAt: resultsCache?.expiresAt,
                            },
                        },
                    });

                    if (resultsCache?.cacheHit) {
                        await this.queryHistoryModel.update(
                            queryHistoryUuid,
                            projectUuid,
                            user.userUuid,
                            {
                                // If the cache is ready, we set the query history status to READY
                                // Otherwise, we set it to PENDING
                                status:
                                    resultsCache.status ===
                                    ResultsCacheStatus.READY
                                        ? QueryHistoryStatus.READY
                                        : QueryHistoryStatus.PENDING,
                                error: null,
                                total_row_count: resultsCache.totalRowCount,
                                warehouse_execution_time_ms: 0, // When cache is hit, no query is executed
                            },
                        );

                        return {
                            queryUuid: queryHistoryUuid,
                            cacheMetadata: {
                                cacheHit: resultsCache.cacheHit,
                                cacheUpdatedTime: resultsCache.updatedAt,
                                cacheExpiresAt: resultsCache.expiresAt,
                            },
                            metricQuery,
                            fields: fieldsMap,
                        } satisfies ExecuteAsyncQueryReturn;
                    }

                    // Trigger query in the background, update query history and cache when complete
                    void this.runAsyncWarehouseQuery({
                        user,
                        projectUuid,
                        query,
                        fieldsMap,
                        queryTags,
                        warehouseClient,
                        sshTunnel,
                        queryHistoryUuid,
                        // resultsCache is either MissCacheResult or undefined at this point,
                        // meaning that the cache was not hit or that cache is not enabled
                        resultsCache,
                    });

                    return {
                        queryUuid: queryHistoryUuid,
                        cacheMetadata: {
                            cacheHit: resultsCache?.cacheHit || false,
                            cacheUpdatedTime: resultsCache?.updatedAt,
                            cacheExpiresAt: resultsCache?.expiresAt,
                        },
                        metricQuery,
                        fields: fieldsMap,
                    } satisfies ExecuteAsyncQueryReturn;
                } catch (e) {
                    span.setStatus({
                        code: 2, // ERROR
                        message: getErrorMessage(e),
                    });
                    throw e;
                } finally {
                    span.end();
                }
            },
        );
    }

    // execute
    async executeAsyncMetricQuery({
        user,
        projectUuid,
        dateZoom,
        context,
        metricQuery,
        invalidateCache,
    }: ExecuteAsyncMetricQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const requestParameters: ExecuteAsyncMetricQueryRequestParams = {
            context,
            query: metricQuery,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: metricQuery.exploreName,
            query_context: context,
        };

        const explore = await this.getExplore(
            user,
            projectUuid,
            metricQuery.exploreName,
            organizationUuid,
        );

        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        } = await this.executeAsyncQuery(
            {
                user,
                metricQuery,
                projectUuid,
                explore,
                context,
                queryTags,
                dateZoom,
                invalidateCache,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        };
    }

    async executeAsyncSavedChartQuery({
        user,
        projectUuid,
        chartUuid,
        versionUuid,
        context,
        invalidateCache,
    }: ExecuteAsyncSavedChartQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        // Check user is in organization
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        const {
            uuid: savedChartUuid,
            organizationUuid: savedChartOrganizationUuid,
            projectUuid: savedChartProjectUuid,
            spaceUuid: savedChartSpaceUuid,
            tableName: savedChartTableName,
            metricQuery,
        } = await this.savedChartModel.get(chartUuid, versionUuid);

        // Check chart belongs to project
        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Chart does not belong to project');
        }

        const space = await this.spaceModel.getSpaceSummary(
            savedChartSpaceUuid,
        );

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChartUuid,
            user.userUuid,
        );

        const requestParameters: ExecuteAsyncSavedChartRequestParams = {
            context,
            chartUuid,
            versionUuid,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: savedChartOrganizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            explore_name: savedChartTableName,
            query_context: context,
        };

        const explore = await this.getExplore(
            user,
            projectUuid,
            savedChartTableName,
            savedChartOrganizationUuid,
        );

        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore,
                context,
                queryTags,
                invalidateCache,
                metricQuery,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        };
    }

    async executeAsyncDashboardChartQuery({
        user,
        projectUuid,
        chartUuid,
        dashboardUuid,
        dashboardFilters,
        dashboardSorts,
        dateZoom,
        context,
        invalidateCache,
    }: ExecuteAsyncDashboardChartQueryArgs): Promise<ApiExecuteAsyncDashboardChartQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid: savedChartProjectUuid } =
            savedChart;

        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Dashboard does not belong to project');
        }

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            user.userUuid,
        );

        const tables = Object.keys(explore.tables);
        const appliedDashboardFilters: DashboardFilters = {
            dimensions: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.dimensions,
            ),
            metrics: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.tableCalculations,
            ),
        };

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                savedChart.metricQuery,
                appliedDashboardFilters,
                explore,
            ),
            sorts:
                dashboardSorts && dashboardSorts.length > 0
                    ? dashboardSorts
                    : savedChart.metricQuery.sorts,
        };

        const exploreDimensions = getDimensions(explore);

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];

        const xAxisField = isCartesianChartConfig(savedChart.chartConfig.config)
            ? savedChart.chartConfig.config.layout.xField
            : undefined;

        const hasADateDimension = xAxisField
            ? exploreDimensions.find(
                  (c) => getItemId(c) === xAxisField && isDateItem(c),
              )
            : exploreDimensions.find(
                  (c) =>
                      metricQueryDimensions.includes(getItemId(c)) &&
                      isDateItem(c),
              );

        if (hasADateDimension) {
            metricQueryWithDashboardOverrides.metadata = {
                hasADateDimension: {
                    name: hasADateDimension.name,
                    label: hasADateDimension.label,
                    table: hasADateDimension.table,
                },
            };
        }

        const requestParameters: ExecuteAsyncDashboardChartRequestParams = {
            context,
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoom,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore,
                metricQuery: metricQueryWithDashboardOverrides,
                context,
                queryTags,
                invalidateCache,
                dateZoom,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters,
            metricQuery: metricQueryWithOverrides,
            fields,
        };
    }

    async executeAsyncUnderlyingDataQuery({
        user,
        projectUuid,
        underlyingDataSourceQueryUuid,
        filters,
        underlyingDataItemId,
        context,
        invalidateCache,
        dateZoom,
    }: ExecuteAsyncUnderlyingDataQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('UnderlyingData', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery, fields: metricQueryFields } =
            await this.queryHistoryModel.get(
                underlyingDataSourceQueryUuid,
                projectUuid,
                user.userUuid,
            );

        const { exploreName } = metricQuery;

        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        const underlyingDataItem = underlyingDataItemId
            ? metricQueryFields[underlyingDataItemId]
            : undefined;

        const joinedTables = explore.joinedTables.map(
            (joinedTable) => joinedTable.table,
        );

        const availableTables = new Set([
            ...joinedTables,
            ...Object.values(metricQueryFields)
                .filter(isField)
                .map((field) => field.table),
        ]);

        const itemShowUnderlyingValues =
            isField(underlyingDataItem) && isMetric(underlyingDataItem)
                ? underlyingDataItem.showUnderlyingValues
                : undefined;

        const itemShowUnderlyingTable = isField(underlyingDataItem)
            ? underlyingDataItem.table
            : undefined;

        const allDimensions = [
            ...(metricQuery.customDimensions?.filter(
                (dimension) => !isCustomBinDimension(dimension),
            ) || []),
            ...getDimensions(explore),
        ];

        const isValidNonCustomDimension = (
            dimension: CustomDimension | CompiledDimension,
        ) =>
            !isCustomDimension(dimension) &&
            !dimension.timeInterval &&
            !dimension.hidden;

        const availableDimensions = allDimensions.filter(
            (dimension) =>
                availableTables.has(dimension.table) &&
                (isValidNonCustomDimension(dimension) ||
                    isCustomDimension(dimension)) &&
                (itemShowUnderlyingValues !== undefined
                    ? (itemShowUnderlyingValues.includes(dimension.name) &&
                          itemShowUnderlyingTable === dimension.table) ||
                      itemShowUnderlyingValues.includes(
                          `${dimension.table}.${dimension.name}`,
                      )
                    : true),
        );

        const requestParameters: ExecuteAsyncUnderlyingDataRequestParams = {
            context,
            underlyingDataSourceQueryUuid,
            filters,
            underlyingDataItemId,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: context,
        };

        const underlyingDataMetricQuery: MetricQuery = {
            exploreName,
            dimensions: availableDimensions.map(getItemId),
            // Remove custom bin dimensions from underlying data query
            customDimensions: metricQuery.customDimensions?.filter(
                (dimension) => !isCustomBinDimension(dimension),
            ),
            filters,
            metrics: [],
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        };

        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        } = await this.executeAsyncQuery(
            {
                user,
                metricQuery: underlyingDataMetricQuery,
                projectUuid,
                explore,
                context,
                queryTags,
                invalidateCache,
                dateZoom,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithOverrides,
            fields,
        };
    }

    async executeAsyncSqlQuery({
        user,
        projectUuid,
        sql,
        context,
        invalidateCache,
        pivotConfiguration,
    }: ExecuteAsyncSqlQueryArgs): Promise<ApiExecuteAsyncSqlQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
        );

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            query_context: context,
        };

        // Get one row to get the column definitions
        const columns: { name: string; type: DimensionType }[] = [];
        await warehouseConnection.warehouseClient.streamQuery(
            applyLimitToSqlQuery({ sqlQuery: sql, limit: 1 }),
            (row) => {
                if (row.fields) {
                    Object.keys(row.fields).forEach((key) => {
                        columns.push({
                            name: key,
                            type: row.fields[key].type,
                        });
                    });
                }
            },
            {
                tags: queryTags,
            },
        );

        const vizColumns = columns.map((col) => ({
            reference: col.name,
            type: col.type,
        }));

        const virtualView = createVirtualViewObject(
            'virtual_view',
            sql,
            vizColumns,
            warehouseConnection.warehouseClient,
        );

        const dimensions = Object.values(
            virtualView.tables[virtualView.baseTable].dimensions,
        ).map((d) => convertFieldRefToFieldId(d.name, virtualView.name));

        const prefixedPivotConfiguration = pivotConfiguration
            ? prefixPivotConfigurationReferences(
                  pivotConfiguration,
                  `${virtualView.name}`,
              )
            : undefined;

        const query: MetricQuery = {
            exploreName: virtualView.name,
            dimensions,
            metrics: [],
            filters: {},
            tableCalculations: [],
            sorts: [],
            customDimensions: [],
            additionalMetrics: [],
            limit: 500,
        };

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery: query,
                context,
            },
            {
                query,
                invalidateCache,
            },
            warehouseConnection,
            prefixedPivotConfiguration,
        );

        return {
            queryUuid,
            cacheMetadata,
        };
    }

    private async prepareSqlChartAsyncQueryArgs({
        user,
        sqlChart,
        context,
    }: {
        user: SessionUser;
        sqlChart: Pick<SqlChart, 'project' | 'organization' | 'sql' | 'config'>;
        context: QueryExecutionContext;
    }) {
        const warehouseConnection = await this._getWarehouseClient(
            sqlChart.project.projectUuid,
            await this.getWarehouseCredentials(
                sqlChart.project.projectUuid,
                user.userUuid,
            ),
        );

        const queryTags: RunQueryTags = {
            organization_uuid: sqlChart.organization.organizationUuid,
            user_uuid: user.userUuid,
            query_context: context,
        };

        // Get one row to get the column definitions
        const columns: { name: string; type: DimensionType }[] = [];
        await warehouseConnection.warehouseClient.streamQuery(
            applyLimitToSqlQuery({ sqlQuery: sqlChart.sql, limit: 1 }),
            (row) => {
                if (row.fields) {
                    Object.keys(row.fields).forEach((key) => {
                        columns.push({
                            name: key,
                            type: row.fields[key].type,
                        });
                    });
                }
            },
            {
                tags: queryTags,
            },
        );

        const vizColumns = columns.map((col) => ({
            reference: col.name,
            type: col.type,
        }));

        const virtualView = createVirtualViewObject(
            'virtual_view',
            sqlChart.sql,
            vizColumns,
            warehouseConnection.warehouseClient,
        );

        const dimensions = Object.values(
            virtualView.tables[virtualView.baseTable].dimensions,
        ).map((d) => convertFieldRefToFieldId(d.name, virtualView.name));

        const prefixedPivotConfiguration =
            !isVizTableConfig(sqlChart.config) && sqlChart.config.fieldConfig
                ? prefixPivotConfigurationReferences(
                      {
                          indexColumn: sqlChart.config.fieldConfig.x,
                          valuesColumns: sqlChart.config.fieldConfig.y,
                          groupByColumns: sqlChart.config.fieldConfig.groupBy,
                          sortBy: sqlChart.config.fieldConfig.sortBy,
                      },
                      `${virtualView.name}`,
                  )
                : undefined;

        const query: MetricQuery = {
            exploreName: virtualView.name,
            dimensions,
            metrics: [],
            filters: {},
            tableCalculations: [],
            sorts: [],
            customDimensions: [],
            additionalMetrics: [],
            limit: 500,
        };
        return {
            query,
            prefixedPivotConfiguration,
            virtualView,
            queryTags,
            warehouseConnection,
        };
    }

    async executeAsyncSqlChartQuery(
        args: ExecuteAsyncSqlChartArgs,
    ): Promise<ApiExecuteAsyncSqlQueryResults> {
        const sqlChart = isExecuteAsyncSqlChartByUuid(args)
            ? await this.savedSqlModel.getByUuid(args.savedSqlUuid, {
                  projectUuid: args.projectUuid,
              })
            : await this.savedSqlModel.getBySlug(args.projectUuid, args.slug);

        if (!sqlChart) {
            throw new Error('Either chartUuid or slug must be provided');
        }

        const { user, projectUuid, context, invalidateCache } = args;

        const { hasAccess: hasViewAccess } = await this.hasSavedChartAccess(
            user,
            'view',
            sqlChart,
        );

        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }

        const {
            warehouseConnection,
            queryTags,
            query,
            virtualView,
            prefixedPivotConfiguration,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            sqlChart,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery: query,
                context,
            },
            {
                query,
                invalidateCache,
            },
            warehouseConnection,
            prefixedPivotConfiguration,
        );

        return {
            queryUuid,
            cacheMetadata,
        };
    }

    async executeAsyncDashboardSqlChartQuery(
        args: ExecuteAsyncDashboardSqlChartArgs,
    ): Promise<ApiExecuteAsyncDashboardSqlChartQueryResults> {
        const savedChart = isExecuteAsyncDashboardSqlChartByUuid(args)
            ? await this.savedSqlModel.getByUuid(args.savedSqlUuid, {
                  projectUuid: args.projectUuid,
              })
            : await this.savedSqlModel.getBySlug(args.projectUuid, args.slug);

        if (!savedChart) {
            throw new Error('Either chartUuid or slug must be provided');
        }

        const {
            user,
            projectUuid,
            context,
            invalidateCache,
            dashboardFilters,
            dashboardSorts,
        } = args;

        const { hasAccess: hasViewAccess } = await this.hasSavedChartAccess(
            user,
            'view',
            savedChart,
        );

        if (!hasViewAccess) {
            throw new ForbiddenError("You don't have access to this chart");
        }

        const {
            warehouseConnection,
            queryTags,
            query,
            virtualView,
            prefixedPivotConfiguration,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            sqlChart: savedChart,
        });

        const tables = Object.keys(virtualView.tables);
        const appliedDashboardFilters: DashboardFilters = {
            dimensions: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.dimensions,
            ),
            metrics: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.tableCalculations,
            ),
        };

        // This override isn't used for anything at the moment since sql charts don't support filters, but it's here for future use
        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                query,
                appliedDashboardFilters,
                virtualView,
            ),
            sorts:
                dashboardSorts && dashboardSorts.length > 0
                    ? dashboardSorts
                    : [],
        };

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery: metricQueryWithDashboardOverrides,
                context,
            },
            {
                query,
                invalidateCache,
            },
            warehouseConnection,
            prefixedPivotConfiguration,
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters,
        };
    }
}
