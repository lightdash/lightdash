import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    type ApiDownloadAsyncQueryResults,
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
    ExpiredError,
    Explore,
    ForbiddenError,
    formatRow,
    getDashboardFilterRulesForTables,
    getDimensions,
    getErrorMessage,
    getIntrinsicUserAttributes,
    getItemId,
    getItemMap,
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
    NotFoundError,
    type Organization,
    PivotIndexColum,
    type PivotValuesColumn,
    type Project,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ResultColumns,
    ResultRow,
    type RunQueryTags,
    SessionUser,
    SortBy,
    type SpaceShare,
    type SpaceSummary,
    SqlChart,
    ValuesColumn,
    WarehouseClient,
    type WarehouseExecuteAsyncQuery,
    type WarehouseResults,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import { createInterface } from 'readline';
import type { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import type { DbResultsCacheUpdate } from '../../database/entities/resultsFile';
import { measureTime } from '../../logging/measureTime';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel';
import { ResultsFileModel } from '../../models/ResultsFileModel/ResultsFileModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import { applyLimitToSqlQuery } from '../../queryBuilder';
import { wrapSentryTransaction } from '../../utils';
import type { ICacheService } from '../CacheService/ICacheService';
import {
    type CacheHitCacheResult,
    CreateCacheResult,
    MissCacheResult,
    ResultsCacheStatus,
} from '../CacheService/types';
import { CsvService } from '../CsvService/CsvService';
import {
    ProjectService,
    type ProjectServiceArguments,
} from '../ProjectService/ProjectService';
import {
    getNextAndPreviousPage,
    validatePagination,
} from '../ProjectService/resultsPagination';
import { getResultsColumns } from './getResultsColumns';
import {
    type DownloadAsyncQueryResultsArgs,
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

type AsyncQueryServiceArguments = ProjectServiceArguments & {
    queryHistoryModel: QueryHistoryModel;
    cacheService?: ICacheService;
    savedSqlModel: SavedSqlModel;
    resultsFileModel: ResultsFileModel;
    storageClient: S3ResultsFileStorageClient;
};

export class AsyncQueryService extends ProjectService {
    queryHistoryModel: QueryHistoryModel;

    cacheService?: ICacheService;

    savedSqlModel: SavedSqlModel;

    resultsFileModel: ResultsFileModel;

    storageClient: S3ResultsFileStorageClient;

    constructor({
        queryHistoryModel,
        cacheService,
        savedSqlModel,
        resultsFileModel,
        storageClient,
        ...projectServiceArgs
    }: AsyncQueryServiceArguments) {
        super(projectServiceArgs);
        this.queryHistoryModel = queryHistoryModel;
        this.cacheService = cacheService;
        this.savedSqlModel = savedSqlModel;
        this.resultsFileModel = resultsFileModel;
        this.storageClient = storageClient;
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

    private getCacheExpiresAt(baseDate: Date) {
        return new Date(
            baseDate.getTime() +
                this.lightdashConfig.results.cacheStateTimeSeconds * 1000,
        );
    }

    async createOrGetExistingCache(
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
        invalidateCache: boolean = false,
    ): Promise<CreateCacheResult> {
        // Generate cache key from project and query identifiers
        const cacheKey = ResultsFileModel.getCacheKey(
            projectUuid,
            cacheIdentifiers,
        );

        // Check if cache already exists
        const existingCache = await this.cacheService?.findCachedResultsFile(
            projectUuid,
            cacheIdentifiers,
        );

        // Case 1: Valid cache exists and not being invalidated
        if (existingCache && !invalidateCache) {
            return existingCache;
        }

        // Create upload stream for storing results
        const { write, close } =
            this.storageClient.createUploadStream(cacheKey);

        const now = new Date();
        const newExpiresAt = this.getCacheExpiresAt(now);

        // Case 2: No valid cache exists - upsert cache entry
        const createdCache = await this.resultsFileModel.create({
            cache_key: cacheKey,
            project_uuid: projectUuid,
            expires_at: newExpiresAt,
            total_row_count: null,
            status: ResultsCacheStatus.PENDING,
        });

        if (!createdCache) {
            await close();
            throw new Error('Failed to create cache');
        }

        return {
            cacheKey: createdCache.cache_key,
            createdAt: createdCache.created_at,
            updatedAt: createdCache.updated_at,
            expiresAt: createdCache.expires_at,
            write,
            close,
            cacheHit: false,
            totalRowCount: null,
        };
    }

    async getCachedResultsPage(
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
        formatter: (row: ResultRow) => ResultRow,
    ) {
        const cache = await this.resultsFileModel.find(cacheKey, projectUuid);

        if (!cache) {
            // TODO: throw a specific error the FE will respond to
            throw new NotFoundError(
                `Cache not found for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        if (cache.expires_at < new Date()) {
            await this.resultsFileModel.delete(cacheKey, projectUuid);

            // TODO: throw a specific error the FE will respond to
            throw new ExpiredError(
                `Cache expired for key ${cacheKey} and project ${projectUuid}`,
            );
        }

        const cacheStream = await this.storageClient.getDowloadStream(cacheKey);

        const rows: ResultRow[] = [];
        const rl = createInterface({
            input: cacheStream,
            crlfDelay: Infinity,
        });

        const startLine = (page - 1) * pageSize;
        const endLine = startLine + pageSize;
        let nonEmptyLineCount = 0;

        for await (const line of rl) {
            if (line.trim()) {
                if (
                    nonEmptyLineCount >= startLine &&
                    nonEmptyLineCount < endLine
                ) {
                    rows.push(formatter(JSON.parse(line)));
                }
                nonEmptyLineCount += 1;
            }
        }

        return {
            rows,
            totalRowCount: cache.total_row_count ?? 0,
            expiresAt: cache.expires_at,
        };
    }

    async updateCache(
        cacheKey: string,
        projectUuid: string,
        update: DbResultsCacheUpdate,
    ) {
        await this.resultsFileModel.update(cacheKey, projectUuid, update);
    }

    async deleteCache(cacheKey: string, projectUuid: string) {
        await this.resultsFileModel.delete(cacheKey, projectUuid);
    }

    async findCache(
        cacheKey: string,
        projectUuid: string,
    ): Promise<CacheHitCacheResult | undefined> {
        const cache = await this.resultsFileModel.find(cacheKey, projectUuid);

        if (cache) {
            return {
                cacheKey,
                createdAt: cache.created_at,
                updatedAt: cache.updated_at,
                expiresAt: cache.expires_at,
                cacheHit: true,
                write: undefined,
                close: undefined,
                totalRowCount: cache.total_row_count ?? 0,
                status: cache.status,
            };
        }

        return undefined;
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

        const { context, status, totalRowCount, cacheKey, fields } =
            queryHistory;

        if (status === QueryHistoryStatus.ERROR) {
            return {
                status,
                queryUuid,
                error: queryHistory.error,
            };
        }

        if (!cacheKey) {
            throw new NotFoundError(
                `Result file not found for query ${queryUuid}`,
            );
        }

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.PENDING:
                const cache = await this.findCache(cacheKey, projectUuid);

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

                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.READY:
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

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

        const formatter = (row: Record<string, unknown>) =>
            formatRow(row, queryHistory.fields);

        const {
            result: { rows, totalRowCount: cacheTotalRowCount, expiresAt },
            durationMs,
        } = await measureTime(
            () =>
                this.getCachedResultsPage(
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

        const roundedDurationMs = Math.round(durationMs);

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

        /**
         * Update the query history with non null values
         * defaultPageSize is null when user never fetched the results - we don't send pagination params to the query execution endpoint
         */
        if (queryHistory.defaultPageSize === null) {
            await this.queryHistoryModel.update(
                queryHistory.queryUuid,
                projectUuid,
                user.userUuid,
                {
                    default_page_size: defaultedPageSize,
                },
            );
        }

        // Ideally, we should use the warehouse results columns metadata. For now we can rely on the fields.
        const unpivotedColumns = Object.values(fields).reduce<ResultColumns>(
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

        const {
            pivotConfiguration,
            pivotValuesColumns,
            pivotTotalColumnCount,
        } = queryHistory;

        const returnObject = {
            rows,
            columns: getResultsColumns(
                unpivotedColumns,
                pivotConfiguration,
                pivotValuesColumns,
                rows,
            ),
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
            pivotDetails: null,
        };

        const isPivoted = pivotConfiguration && pivotValuesColumns;

        if (!isPivoted) {
            return returnObject;
        }

        return {
            ...returnObject,
            pivotDetails: {
                totalColumnCount: pivotTotalColumnCount,
                valuesColumns: pivotValuesColumns,
                indexColumn: pivotConfiguration.indexColumn,
                groupByColumns: pivotConfiguration.groupByColumns,
                sortBy: pivotConfiguration.sortBy,
                unpivotedColumns,
            },
        };
    }

    async downloadAsyncQueryResults({
        user,
        projectUuid,
        queryUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryUuid: string;
    }): Promise<ApiDownloadAsyncQueryResults> {
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
                'User is not allowed to download results for this query',
            );
        }

        const { status, cacheKey: resultsFileName } = queryHistory;

        if (status === QueryHistoryStatus.ERROR) {
            throw new Error(queryHistory.error ?? 'Warehouse query failed');
        }

        if (status === QueryHistoryStatus.PENDING) {
            throw new Error('Query is in pending state');
        }

        if (status === QueryHistoryStatus.READY) {
            if (!resultsFileName) {
                throw new Error('Results file name not found for query');
            }

            return {
                fileUrl: await this.storageClient.getFileUrl(resultsFileName),
                // TODO: add columns here once they're saved to query_history
            };
        }

        throw new Error('Invalid query status');
    }

    /**
     * Runs the query and transforms the rows if pivoting is enabled
     * Code pivot transformation taken from ProjectService.pivotQueryWorkerTask
     */
    private static async runQueryAndTransformRows({
        warehouseClient,
        query,
        queryTags,
        resultsCache,
        pivotConfiguration,
    }: {
        warehouseClient: WarehouseClient;
        query: string;
        queryTags: RunQueryTags;
        resultsCache: MissCacheResult;
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        };
    }): Promise<{
        warehouseResults: WarehouseExecuteAsyncQuery;
        pivotDetails: {
            valuesColumns: Map<string, PivotValuesColumn>;
            totalColumnCount: number | undefined;
            totalRows: number;
        } | null;
    }> {
        let currentRowIndex = 0;
        let currentTransformedRow: WarehouseResults['rows'][number] | undefined;
        const valuesColumnData = new Map<string, PivotValuesColumn>();

        // Total column count includes the unlimited number of columns that can be pivoted, so we can show a warning in the frontend
        let pivotTotalColumnCount: undefined | number;
        let pivotTotalRows = 0;

        const writeAndTransformRowsIfPivot = pivotConfiguration
            ? (rows: WarehouseResults['rows']) => {
                  if ('total_columns' in rows[0]) {
                      const numberTotalColumns = Number(rows[0].total_columns);
                      pivotTotalColumnCount = Number.isNaN(numberTotalColumns)
                          ? undefined
                          : numberTotalColumns;
                  }

                  const { indexColumn, valuesColumns, groupByColumns } =
                      pivotConfiguration;

                  if (!groupByColumns || groupByColumns.length === 0) {
                      resultsCache.write(rows);
                      return;
                  }

                  rows.forEach((row) => {
                      // Write rows to file in order of row_index. This is so that we can pivot the data later
                      if (currentRowIndex !== row.row_index) {
                          if (currentTransformedRow) {
                              pivotTotalRows += 1;
                              resultsCache.write([currentTransformedRow]);
                          }

                          if (indexColumn) {
                              currentTransformedRow = {
                                  [indexColumn.reference]:
                                      row[indexColumn.reference],
                              };
                              currentRowIndex = row.row_index;
                          }
                      }
                      // Suffix the value column with the group by columns to avoid collisions.
                      // E.g. if we have a row with the value 1 and the group by columns are ['a', 'b'],
                      // then the value column will be 'value_1_a_b'
                      const valueSuffix = groupByColumns
                          ?.map((col) => row[col.reference])
                          .join('_');

                      valuesColumns.forEach((col) => {
                          const valueColumnReference = `${col.reference}_${col.aggregation}_${valueSuffix}`;

                          valuesColumnData.set(valueColumnReference, {
                              referenceField: col.reference, // The original y field name
                              pivotColumnName: valueColumnReference, // The pivoted y field name and agg eg amount_avg_false
                              aggregation: col.aggregation,
                              pivotValues: groupByColumns?.map((c) => ({
                                  referenceField: c.reference,
                                  value: row[c.reference],
                              })),
                          });

                          currentTransformedRow = currentTransformedRow ?? {};
                          currentTransformedRow[valueColumnReference] =
                              row[`${col.reference}_${col.aggregation}`];
                      });
                  });
              }
            : resultsCache.write;

        const warehouseResults = await warehouseClient.executeAsyncQuery(
            {
                sql: query,
                tags: queryTags,
            },
            writeAndTransformRowsIfPivot,
        );

        // Write the last row
        if (currentTransformedRow) {
            pivotTotalRows += 1;
            resultsCache.write([currentTransformedRow]);
        }

        return {
            warehouseResults,
            pivotDetails: pivotConfiguration
                ? {
                      valuesColumns: valuesColumnData,
                      totalColumnCount: pivotTotalColumnCount,
                      totalRows: pivotTotalRows,
                  }
                : null,
        };
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
        pivotConfiguration,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryTags: RunQueryTags;
        query: string;
        fieldsMap: ItemsMap;
        queryHistoryUuid: string;
        resultsCache: MissCacheResult;
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        };
    }) {
        try {
            const {
                warehouseResults: {
                    durationMs,
                    totalRows,
                    queryMetadata,
                    queryId,
                },
                pivotDetails,
            } = await AsyncQueryService.runQueryAndTransformRows({
                warehouseClient,
                query,
                queryTags,
                resultsCache,
                pivotConfiguration,
            });

            this.analytics.track({
                userId: user.userUuid,
                event: 'query.ready',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                    warehouseExecutionTimeMs: durationMs,
                    columnsCount:
                        pivotDetails?.totalColumnCount ??
                        Object.keys(fieldsMap).length,
                    totalRowCount: pivotDetails?.totalRows ?? totalRows,
                    isPivoted: pivotDetails !== null,
                },
            });

            // Wait for the cache to be written before marking the query as ready
            await resultsCache.close();
            await this.updateCache(resultsCache.cacheKey, projectUuid, {
                status: ResultsCacheStatus.READY,
                total_row_count: pivotDetails?.totalRows ?? totalRows,
            });

            this.analytics.track({
                userId: user.userUuid,
                event: 'results_cache.write',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    cacheKey: resultsCache.cacheKey,
                    totalRowCount: pivotDetails?.totalRows ?? totalRows,
                    pivotTotalColumnCount: pivotDetails?.totalColumnCount,
                    isPivoted: pivotDetails !== null,
                },
            });

            await this.queryHistoryModel.update(
                queryHistoryUuid,
                projectUuid,
                user.userUuid,
                {
                    warehouse_query_id: queryId,
                    warehouse_query_metadata: queryMetadata,
                    status: QueryHistoryStatus.READY,
                    error: null,
                    warehouse_execution_time_ms: Math.round(durationMs),
                    total_row_count: pivotDetails?.totalRows ?? totalRows,
                    pivot_total_column_count: pivotDetails?.totalColumnCount,
                    pivot_values_columns: pivotDetails
                        ? Object.fromEntries(
                              pivotDetails.valuesColumns.entries(),
                          )
                        : null,
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
            await this.deleteCache(resultsCache.cacheKey, projectUuid);
            this.analytics.track({
                userId: user.userUuid,
                event: 'results_cache.delete',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    cacheKey: resultsCache.cacheKey,
                },
            });
        } finally {
            void sshTunnel.disconnect();

            if (resultsCache) {
                void resultsCache.close();
            }
        }
    }

    private async prepareMetricQueryAsyncQueryArgs({
        user,
        metricQuery,
        dateZoom,
        explore,
        warehouseClient,
    }: Pick<
        ExecuteAsyncMetricQueryArgs,
        'user' | 'metricQuery' | 'dateZoom'
    > & {
        warehouseClient: WarehouseClient;
        explore: Explore;
    }) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
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

        const fieldsWithOverrides: ItemsMap = Object.fromEntries(
            Object.entries(fullQuery.fields).map(([key, value]) => {
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

        return {
            sql: fullQuery.query,
            fields: fieldsWithOverrides,
        };
    }

    async executeAsyncQuery(
        // TODO: remove metric query, fields, etc from args once they are no longer needed in the database
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            explore: Explore;
            fields: ItemsMap;
            sql: string; // SQL generated from metric query or provided by user
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
                    sql: compiledQuery,
                    metricQuery,
                    fields: fieldsMap,
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

                    const resultsCache = await this.createOrGetExistingCache(
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
                            cacheKey: resultsCache.cacheKey,
                            pivotConfiguration: pivotConfiguration ?? null,
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
                                cacheHit: resultsCache.cacheHit || false,
                                cacheUpdatedTime: resultsCache.updatedAt,
                                cacheExpiresAt: resultsCache.expiresAt,
                            },
                        },
                    });

                    if (resultsCache.cacheHit) {
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
                        pivotConfiguration,
                        // resultsCache is MissCacheResult at this point,
                        // meaning that the cache was not hit
                        resultsCache,
                    });

                    return {
                        queryUuid: queryHistoryUuid,
                        cacheMetadata: {
                            cacheHit: resultsCache.cacheHit || false,
                            cacheUpdatedTime: resultsCache.updatedAt,
                            cacheExpiresAt: resultsCache.expiresAt,
                        },
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

        const { sql, fields } = await this.prepareMetricQueryAsyncQueryArgs({
            user,
            metricQuery,
            dateZoom,
            explore,
            warehouseClient: warehouseConnection.warehouseClient,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                metricQuery,
                projectUuid,
                explore,
                context,
                queryTags,
                dateZoom,
                invalidateCache,
                fields,
                sql,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery,
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

        const { sql, fields } = await this.prepareMetricQueryAsyncQueryArgs({
            user,
            metricQuery,
            explore,
            warehouseClient: warehouseConnection.warehouseClient,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore,
                context,
                queryTags,
                invalidateCache,
                metricQuery,
                fields,
                sql,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery,
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

        const { sql, fields } = await this.prepareMetricQueryAsyncQueryArgs({
            user,
            metricQuery: metricQueryWithDashboardOverrides,
            explore,
            dateZoom,
            warehouseClient: warehouseConnection.warehouseClient,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore,
                metricQuery: metricQueryWithDashboardOverrides,
                context,
                queryTags,
                invalidateCache,
                dateZoom,
                fields,
                sql,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters,
            metricQuery: metricQueryWithDashboardOverrides,
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

        const { sql, fields } = await this.prepareMetricQueryAsyncQueryArgs({
            user,
            metricQuery: underlyingDataMetricQuery,
            explore,
            dateZoom,
            warehouseClient: warehouseConnection.warehouseClient,
        });

        const { queryUuid: underlyingDataQueryUuid, cacheMetadata } =
            await this.executeAsyncQuery(
                {
                    user,
                    metricQuery: underlyingDataMetricQuery,
                    projectUuid,
                    explore,
                    context,
                    queryTags,
                    invalidateCache,
                    dateZoom,
                    fields,
                    sql,
                },
                requestParameters,
                warehouseConnection,
            );

        return {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: underlyingDataMetricQuery,
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
        limit,
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

        const {
            warehouseConnection,
            queryTags,
            metricQuery,
            virtualView,
            sql: sqlWithParams,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            projectUuid,
            organizationUuid,
            sql,
            limit,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql: sqlWithParams,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
            warehouseConnection,
            pivotConfiguration,
        );

        return {
            queryUuid,
            cacheMetadata,
        };
    }

    private async prepareSqlChartAsyncQueryArgs({
        user,
        projectUuid,
        organizationUuid,
        sql,
        config,
        context,
        dashboardFilters,
        dashboardSorts,
        limit,
    }: {
        user: SessionUser;
        projectUuid: string;
        organizationUuid: string;
        sql: string;
        config?: SqlChart['config'];
        context: QueryExecutionContext;
        dashboardFilters?: ExecuteAsyncDashboardSqlChartArgs['dashboardFilters'];
        dashboardSorts?: ExecuteAsyncDashboardSqlChartArgs['dashboardSorts'];
        limit?: number;
    }) {
        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
        );

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
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

        const sqlWithLimit = applyLimitToSqlQuery({
            sqlQuery: sql,
            limit,
        });

        // ! VizColumns, virtualView, dimensions and query are not needed for SQL queries since we pass just sql the to `executeAsyncQuery`
        // ! We keep them here for backwards compatibility until we remove them as a required argument
        const vizColumns = columns.map((col) => ({
            reference: col.name,
            type: col.type,
        }));

        const virtualView = createVirtualViewObject(
            'virtual_view',
            sqlWithLimit,
            vizColumns,
            warehouseConnection.warehouseClient,
        );

        const dimensions = Object.values(
            virtualView.tables[virtualView.baseTable].dimensions,
        ).map((d) => convertFieldRefToFieldId(d.name, virtualView.name));

        const pivotConfiguration =
            config && !isVizTableConfig(config) && config.fieldConfig
                ? {
                      indexColumn: config.fieldConfig.x,
                      valuesColumns: config.fieldConfig.y,
                      groupByColumns: config.fieldConfig.groupBy,
                      sortBy: config.fieldConfig.sortBy,
                  }
                : undefined;

        let metricQuery: MetricQuery = {
            exploreName: virtualView.name,
            dimensions,
            metrics: [],
            filters: {},
            tableCalculations: [],
            sorts: [],
            customDimensions: [],
            additionalMetrics: [],
            limit: limit ?? 500,
        };

        let appliedDashboardFilters: DashboardFilters | undefined;
        if (dashboardFilters) {
            const tables = Object.keys(virtualView.tables);
            appliedDashboardFilters = {
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
            metricQuery = {
                ...addDashboardFiltersToMetricQuery(
                    metricQuery,
                    appliedDashboardFilters,
                    virtualView,
                ),
                sorts:
                    dashboardSorts && dashboardSorts.length > 0
                        ? dashboardSorts
                        : [],
            };
        }

        return {
            metricQuery,
            pivotConfiguration,
            virtualView,
            queryTags,
            warehouseConnection,
            sql: sqlWithLimit,
            appliedDashboardFilters,
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

        const { user, projectUuid, context, invalidateCache, limit } = args;

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
            metricQuery,
            virtualView,
            pivotConfiguration,
            sql,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            projectUuid: sqlChart.project.projectUuid,
            organizationUuid: sqlChart.organization.organizationUuid,
            sql: sqlChart.sql,
            config: sqlChart.config,
            limit,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
            warehouseConnection,
            pivotConfiguration,
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
            limit,
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
            metricQuery,
            virtualView,
            pivotConfiguration,
            sql,
            appliedDashboardFilters,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            sql: savedChart.sql,
            config: savedChart.config,
            dashboardFilters,
            dashboardSorts,
            limit,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
            warehouseConnection,
            pivotConfiguration,
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters: appliedDashboardFilters || {
                metrics: [],
                dimensions: [],
                tableCalculations: [],
            },
        };
    }
}
