import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    type ApiGetAsyncQueryResults,
    assertUnreachable,
    CompiledDimension,
    convertCustomFormatToFormatExpression,
    convertFieldRefToFieldId,
    createVirtualView as createVirtualViewObject,
    CreateWarehouseCredentials,
    type CustomDimension,
    CustomSqlQueryForbiddenError,
    DashboardFilters,
    DEFAULT_RESULTS_PAGE_SIZE,
    Dimension,
    DimensionType,
    DownloadFileType,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    ExpiredError,
    Explore,
    FieldType,
    ForbiddenError,
    formatRow,
    getDashboardFilterRulesForTables,
    getDashboardFilterRulesForTileAndReferences,
    getDimensions,
    getErrorMessage,
    getFieldQuoteChar,
    getIntrinsicUserAttributes,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
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
    MAX_SAFE_INTEGER,
    MetricQuery,
    NotFoundError,
    type Organization,
    PivotConfig,
    PivotIndexColum,
    type PivotValuesColumn,
    type Project,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ResultColumns,
    ResultRow,
    type RunQueryTags,
    SchedulerFormat,
    SessionUser,
    sleep,
    SortBy,
    type SpaceShare,
    type SpaceSummary,
    SqlChart,
    UnexpectedServerError,
    ValuesColumn,
    WarehouseClient,
    type WarehouseExecuteAsyncQuery,
    type WarehouseResults,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { DownloadCsv } from '../../analytics/LightdashAnalytics';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { measureTime } from '../../logging/measureTime';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import { wrapSentryTransaction } from '../../utils';
import { processFieldsForExport } from '../../utils/FileDownloadUtils/FileDownloadUtils';
import {
    QueryBuilder,
    ReferenceMap,
} from '../../utils/QueryBuilder/queryBuilder';
import { applyLimitToSqlQuery } from '../../utils/QueryBuilder/utils';
import type { ICacheService } from '../CacheService/ICacheService';
import { CreateCacheResult } from '../CacheService/types';
import { CsvService } from '../CsvService/CsvService';
import { ExcelService } from '../ExcelService/ExcelService';
import {
    ProjectService,
    type ProjectServiceArguments,
} from '../ProjectService/ProjectService';
import {
    getNextAndPreviousPage,
    validatePagination,
} from '../ProjectService/resultsPagination';
import { getPivotedColumns } from './getPivotedColumns';
import { getUnpivotedColumns } from './getUnpivotedColumns';
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

const SQL_QUERY_MOCK_EXPLORER_NAME = 'sql_query_explorer';

type AsyncQueryServiceArguments = ProjectServiceArguments & {
    queryHistoryModel: QueryHistoryModel;
    cacheService?: ICacheService;
    savedSqlModel: SavedSqlModel;
    storageClient: S3ResultsFileStorageClient;
    csvService: CsvService;
};

export class AsyncQueryService extends ProjectService {
    queryHistoryModel: QueryHistoryModel;

    cacheService?: ICacheService;

    savedSqlModel: SavedSqlModel;

    storageClient: S3ResultsFileStorageClient;

    csvService: CsvService;

    constructor({
        queryHistoryModel,
        cacheService,
        savedSqlModel,
        storageClient,
        csvService,
        ...projectServiceArgs
    }: AsyncQueryServiceArguments) {
        super(projectServiceArgs);
        this.queryHistoryModel = queryHistoryModel;
        this.cacheService = cacheService;
        this.savedSqlModel = savedSqlModel;
        this.storageClient = storageClient;
        this.csvService = csvService;
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

    async findResultsCache(
        projectUuid: string,
        cacheKey: string,
        invalidateCache: boolean = false,
    ): Promise<CreateCacheResult> {
        if (!invalidateCache) {
            // Check if cache already exists
            const existingCache =
                await this.cacheService?.findCachedResultsFile(
                    projectUuid,
                    cacheKey,
                );
            // Valid cache exists and not being invalidated
            if (existingCache) {
                return existingCache;
            }
        }

        return {
            cacheHit: false,
            updatedAt: undefined,
            expiresAt: undefined,
        };
    }

    async getResultsPage(
        fileName: string,
        page: number,
        pageSize: number,
        formatter: (row: ResultRow) => ResultRow,
    ) {
        const cacheStream = await this.storageClient.getDowloadStream(fileName);

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
        };
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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
            context,
            status,
            totalRowCount,
            cacheKey,
            resultsFileName,
            resultsExpiresAt,
            columns,
            originalColumns,
        } = queryHistory;

        if (status === QueryHistoryStatus.ERROR) {
            return {
                status,
                queryUuid,
                error: queryHistory.error,
            };
        }

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.PENDING:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.READY:
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

        if (!resultsFileName || !resultsExpiresAt) {
            throw new NotFoundError(
                `Result file not found for query ${queryUuid}`,
            );
        }
        if (resultsExpiresAt < new Date()) {
            // TODO: throw a specific error the FE will respond to
            throw new ExpiredError(
                `Results expired for file ${resultsFileName} and project ${projectUuid}`,
            );
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
            result: { rows },
            durationMs,
        } = await measureTime(
            () =>
                this.getResultsPage(
                    resultsFileName,
                    page,
                    defaultedPageSize,
                    formatter,
                ),
            'getCachedResultsPage',
            this.logger,
            context,
        );

        const pageCount = Math.ceil((totalRowCount ?? 0) / defaultedPageSize);

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
                totalRowCount: totalRowCount ?? 0,
                totalPageCount: pageCount,
                resultsPageSize: rows.length,
                resultsPageExecutionMs: roundedDurationMs,
                status,
                cacheMetadata: {
                    cacheExpiresAt: resultsExpiresAt,
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

        const {
            pivotConfiguration,
            pivotValuesColumns,
            pivotTotalColumnCount,
        } = queryHistory;

        if (!columns) {
            throw new UnexpectedServerError(
                `No columns found for query ${queryUuid}`,
            );
        }

        const returnObject = {
            rows,
            columns,
            totalPageCount: pageCount,
            totalResults: totalRowCount ?? 0,
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
                originalColumns: originalColumns || {},
            },
        };
    }

    async getResultsStream({
        user,
        projectUuid,
        queryUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryUuid: string;
    }): Promise<Readable> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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

        const { status, resultsFileName } = queryHistory;

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

            return this.storageClient.getDowloadStream(resultsFileName);
        }

        throw new Error('Invalid query status');
    }

    // Note: This method should only be used in scheduler worker. It may cause API timeouts.
    async downloadSyncQueryResults(args: DownloadAsyncQueryResultsArgs) {
        const { queryUuid, projectUuid, user } = args;
        // Recursive function that waits for query results to be ready
        const pollForAsyncChartResults = async (
            backoffMs: number = 500,
        ): Promise<void> => {
            const queryHistory = await this.queryHistoryModel.get(
                queryUuid,
                projectUuid,
                user.userUuid,
            );
            const { status } = queryHistory;

            switch (status) {
                case QueryHistoryStatus.CANCELLED:
                    throw new Error('Query was cancelled');
                case QueryHistoryStatus.ERROR:
                    throw new Error(
                        queryHistory.error ?? 'Warehouse query failed',
                    );
                case QueryHistoryStatus.PENDING:
                    // Implement backoff: 500ms -> 1000ms -> 2000 (then stay at 2000ms)
                    const nextBackoff = Math.min(backoffMs * 2, 2000);
                    await sleep(backoffMs);
                    return pollForAsyncChartResults(nextBackoff);
                case QueryHistoryStatus.READY:
                    // Continue with execution
                    return undefined;
                default:
                    return assertUnreachable(status, 'Unknown query status');
            }
        };

        // Wait for results to be ready
        await pollForAsyncChartResults();

        return this.downloadAsyncQueryResults(args);
    }

    async download(args: DownloadAsyncQueryResultsArgs) {
        const { user, projectUuid, onlyRaw, type } = args;
        const baseAnalyticsProperties: DownloadCsv['properties'] = {
            organizationId: user.organizationUuid,
            projectId: projectUuid,
            fileType:
                type === DownloadFileType.XLSX
                    ? SchedulerFormat.XLSX
                    : SchedulerFormat.CSV,
            values: onlyRaw ? 'raw' : 'formatted',
            storage: this.s3Client.isEnabled() ? 's3' : 'local',
        };
        this.analytics.track({
            event: 'download_results.started',
            userId: user.userUuid,
            properties: baseAnalyticsProperties,
        });
        try {
            const downloadResult = await this.downloadAsyncQueryResults(args);
            this.analytics.track({
                event: 'download_results.completed',
                userId: user.userUuid,
                properties: baseAnalyticsProperties,
            });
            return downloadResult;
        } catch (error) {
            this.analytics.track({
                event: 'download_results.error',
                userId: user.userUuid,
                properties: {
                    ...baseAnalyticsProperties,
                    error: getErrorMessage(error),
                },
            });
            throw error;
        }
    }

    private async downloadAsyncQueryResults({
        user,
        projectUuid,
        queryUuid,
        type,
        onlyRaw = false,
        showTableNames = false,
        customLabels = {},
        columnOrder = [],
        hiddenFields = [],
        pivotConfig,
        attachmentDownloadName,
    }: DownloadAsyncQueryResultsArgs): Promise<
        | ApiDownloadAsyncQueryResults
        | ApiDownloadAsyncQueryResultsAsCsv
        | ApiDownloadAsyncQueryResultsAsXlsx
    > {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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

        const { status, resultsFileName, fields, columns } = queryHistory;

        // First check the query status
        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                throw new Error('Query was cancelled');
            case QueryHistoryStatus.ERROR:
                throw new Error(queryHistory.error ?? 'Warehouse query failed');
            case QueryHistoryStatus.PENDING:
                throw new Error('Query is in pending state');
            case QueryHistoryStatus.READY:
                // Continue with execution
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

        // At this point, we know status is READY
        if (!resultsFileName) {
            throw new Error('Results file name not found for query');
        }

        if (!columns) {
            throw new UnexpectedServerError('No columns found for query');
        }

        // TODO: We should use the columns data instead of fields. We need to: add format expression to columns type and refactor csv service, etc to use columns instead of fields
        // Note: Generate fields for SQL queries. As a workaround, we check the explore name to identify SQL queries and generate fields from columns.
        const resultFields =
            queryHistory.metricQuery.exploreName ===
            SQL_QUERY_MOCK_EXPLORER_NAME
                ? Object.fromEntries(
                      Object.entries(columns).map<[string, Dimension]>(
                          ([key, column]) => [
                              key,
                              {
                                  name: column.reference,
                                  label: column.reference,
                                  type: column.type ?? DimensionType.STRING,
                                  table: '',
                                  fieldType: FieldType.DIMENSION,
                                  sql: '',
                                  tableLabel: '',
                                  hidden: false,
                              },
                          ],
                      ),
                  )
                : fields;

        switch (type) {
            case DownloadFileType.CSV:
                // Check if this is a pivot table download
                if (pivotConfig && queryHistory.metricQuery) {
                    return this.csvService.downloadAsyncPivotTableCsv({
                        resultsFileName,
                        fields,
                        metricQuery: queryHistory.metricQuery,
                        projectUuid,
                        storageClient: this.storageClient,
                        options: {
                            onlyRaw,
                            showTableNames,
                            customLabels,
                            columnOrder,
                            hiddenFields,
                            pivotConfig,
                            attachmentDownloadName,
                        },
                    });
                }
                return this.downloadAsyncQueryResultsAsFormattedFile(
                    resultsFileName,
                    resultFields,
                    {
                        generateFileId: CsvService.generateFileId,
                        streamJsonlRowsToFile: CsvService.streamJsonlRowsToFile,
                    },
                    {
                        onlyRaw,
                        showTableNames,
                        customLabels,
                        columnOrder,
                        hiddenFields,
                        pivotConfig,
                    },
                    attachmentDownloadName,
                );
            case DownloadFileType.XLSX:
                // Check if this is a pivot table download
                if (pivotConfig && queryHistory.metricQuery) {
                    return ExcelService.downloadAsyncPivotTableXlsx({
                        resultsFileName,
                        fields,
                        metricQuery: queryHistory.metricQuery,
                        storageClient: this.storageClient,
                        lightdashConfig: this.lightdashConfig,
                        options: {
                            onlyRaw,
                            showTableNames,
                            customLabels,
                            columnOrder,
                            hiddenFields,
                            pivotConfig,
                            attachmentDownloadName,
                        },
                    });
                }
                // Use direct Excel export to bypass PassThrough + Upload hanging issues
                return ExcelService.downloadAsyncExcelDirectly(
                    resultsFileName,
                    resultFields,
                    this.storageClient,
                    {
                        onlyRaw,
                        showTableNames,
                        customLabels,
                        columnOrder,
                        hiddenFields,
                        attachmentDownloadName,
                    },
                );
            case undefined:
            case DownloadFileType.JSONL:
                return this.downloadAsyncQueryResultsAsJson(resultsFileName);
            case DownloadFileType.S3_JSONL:
                throw new Error('S3_JSONL download not supported yet');
            case DownloadFileType.IMAGE:
                throw new Error(
                    'IMAGE download not supported for query results',
                );
            default:
                return assertUnreachable(
                    type,
                    `Unsupported file type: ${type}`,
                );
        }
    }

    private async downloadAsyncQueryResultsAsFormattedFile(
        resultsFileName: string,
        fields: ItemsMap,
        service: {
            generateFileId: (fileName: string) => string;
            streamJsonlRowsToFile: (
                onlyRaw: boolean,
                itemMap: ItemsMap,
                sortedFieldIds: string[],
                headers: string[],
                streams: { readStream: Readable; writeStream: Writable },
            ) => Promise<{ truncated: boolean }>;
        },
        options?: {
            onlyRaw?: boolean;
            showTableNames?: boolean;
            customLabels?: Record<string, string>;
            columnOrder?: string[];
            hiddenFields?: string[];
            pivotConfig?: PivotConfig;
        },
        attachmentDownloadName?: string,
    ): Promise<{ fileUrl: string; truncated: boolean }> {
        // Generate a unique filename
        const formattedFileName = service.generateFileId(resultsFileName);

        // Handle column ordering and filtering
        const {
            onlyRaw = false,
            showTableNames = false,
            customLabels = {},
            columnOrder = [],
            hiddenFields = [],
        } = options || {};

        // Process fields and generate headers using shared utility
        const { sortedFieldIds, headers } = processFieldsForExport(fields, {
            showTableNames,
            customLabels,
            columnOrder,
            hiddenFields,
        });

        // Transform and upload the results
        return this.storageClient.transformResultsIntoNewFile(
            resultsFileName,
            formattedFileName,
            async (readStream, writeStream) => {
                // Use streamJsonlRowsToFile which handles JSONL data from S3
                const { truncated } = await service.streamJsonlRowsToFile(
                    onlyRaw,
                    fields,
                    sortedFieldIds,
                    headers,
                    {
                        readStream,
                        writeStream,
                    },
                );

                return {
                    truncated,
                };
            },
            attachmentDownloadName,
        );
    }

    private async downloadAsyncQueryResultsAsJson(
        resultsFileName: string,
    ): Promise<ApiDownloadAsyncQueryResults> {
        return {
            fileUrl: await this.storageClient.getFileUrl(resultsFileName),
        };
    }

    /**
     * Runs the query and transforms the rows if pivoting is enabled
     * Code pivot transformation taken from ProjectService.pivotQueryWorkerTask
     */
    private static async runQueryAndTransformRows({
        warehouseClient,
        query,
        queryTags,
        write,
        pivotConfiguration,
    }: {
        warehouseClient: WarehouseClient;
        query: string;
        queryTags: RunQueryTags;
        write: (rows: Record<string, unknown>[]) => void;
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        };
    }): Promise<{
        columns: ResultColumns;
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
        let unpivotedColumns: ResultColumns = {};

        const writeAndTransformRowsIfPivot = pivotConfiguration
            ? (
                  rows: WarehouseResults['rows'],
                  fields: WarehouseResults['fields'],
              ) => {
                  if ('total_columns' in rows[0]) {
                      const numberTotalColumns = Number(rows[0].total_columns);
                      pivotTotalColumnCount = Number.isNaN(numberTotalColumns)
                          ? undefined
                          : numberTotalColumns;
                  }

                  unpivotedColumns = getUnpivotedColumns(
                      unpivotedColumns,
                      fields,
                  );

                  const { indexColumn, valuesColumns, groupByColumns } =
                      pivotConfiguration;

                  if (!groupByColumns || groupByColumns.length === 0) {
                      write(rows);
                      return;
                  }

                  rows.forEach((row) => {
                      // Write rows to file in order of row_index. This is so that we can pivot the data later
                      if (currentRowIndex !== row.row_index) {
                          if (currentTransformedRow) {
                              pivotTotalRows += 1;
                              write([currentTransformedRow]);
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
            : (
                  rows: WarehouseResults['rows'],
                  fields: WarehouseResults['fields'],
              ) => {
                  // Capture columns from the first batch if available
                  unpivotedColumns = getUnpivotedColumns(
                      unpivotedColumns,
                      fields,
                  );
                  write(rows);
              };

        const warehouseResults = await warehouseClient.executeAsyncQuery(
            {
                sql: query,
                tags: queryTags,
            },
            writeAndTransformRowsIfPivot,
        );

        const columns = pivotConfiguration?.groupByColumns?.length
            ? getPivotedColumns(
                  unpivotedColumns,
                  pivotConfiguration,
                  Array.from(valuesColumnData.keys()),
              )
            : unpivotedColumns;

        // Write the last row
        if (currentTransformedRow) {
            pivotTotalRows += 1;
            write([currentTransformedRow]);
        }

        return {
            warehouseResults,
            columns,
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
        cacheKey,
        pivotConfiguration,
        originalColumns,
    }: {
        user: SessionUser;
        projectUuid: string;
        queryTags: RunQueryTags;
        query: string;
        fieldsMap: ItemsMap;
        queryHistoryUuid: string;
        cacheKey: string;
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        };
        originalColumns?: ResultColumns;
    }) {
        let stream:
            | {
                  write: (rows: Record<string, unknown>[]) => void;
                  close: () => Promise<void>;
              }
            | undefined;
        try {
            const fileName =
                QueryHistoryModel.createUniqueResultsFileName(cacheKey);
            // Create upload stream for storing results
            stream = this.storageClient.createUploadStream(
                S3ResultsFileStorageClient.sanitizeFileExtension(fileName),
                {
                    contentType: 'application/jsonl',
                },
            );
            const createdAt = new Date();
            const newExpiresAt = this.getCacheExpiresAt(createdAt);
            this.analytics.track({
                userId: user.userUuid,
                event: 'results_cache.create',
                properties: {
                    projectId: projectUuid,
                    cacheKey,
                    totalRowCount: null,
                    createdAt,
                    expiresAt: newExpiresAt,
                },
            });
            const {
                warehouseResults: {
                    durationMs,
                    totalRows,
                    queryMetadata,
                    queryId,
                },
                pivotDetails,
                columns,
            } = await AsyncQueryService.runQueryAndTransformRows({
                warehouseClient,
                query,
                queryTags,
                write: stream.write,
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
            await stream.close();

            this.analytics.track({
                userId: user.userUuid,
                event: 'results_cache.write',
                properties: {
                    queryId: queryHistoryUuid,
                    projectId: projectUuid,
                    cacheKey,
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
                    results_file_name: fileName,
                    results_created_at: createdAt,
                    results_updated_at: new Date(),
                    results_expires_at: newExpiresAt,
                    columns,
                    original_columns: originalColumns,
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
        } finally {
            void sshTunnel.disconnect();
            void stream?.close();
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
                const metricOverrides = metricQuery.metricOverrides?.[key];
                if (metricOverrides) {
                    const { formatOptions } = metricOverrides;

                    if (formatOptions) {
                        return [
                            key,
                            {
                                ...value,
                                // Override the format expression with the metric query override instead of adding `formatOptions` to the item
                                // This ensures that legacy `formatOptions` are kept as is and we don't need to change logic over which format takes precedence
                                format: convertCustomFormatToFormatExpression(
                                    formatOptions,
                                ),
                            },
                        ];
                    }
                }
                return [key, value];
            }),
        );

        return {
            sql: fullQuery.query,
            fields: fieldsWithOverrides,
            warnings: fullQuery.warnings,
        };
    }

    async executeAsyncQuery(
        // TODO: remove metric query, fields, etc from args once they are no longer needed in the database
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            explore: Explore;
            fields: ItemsMap;
            sql: string; // SQL generated from metric query or provided by user
            originalColumns?: ResultColumns;
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
                    originalColumns,
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

                    // Generate cache key from project and query identifiers
                    const cacheKey = QueryHistoryModel.getCacheKey(
                        projectUuid,
                        {
                            sql: query,
                            timezone: metricQuery.timezone,
                        },
                    );

                    const resultsCache = await this.findResultsCache(
                        projectUuid,
                        cacheKey,
                        args.invalidateCache,
                    );

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
                            cacheKey,
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
                                status: QueryHistoryStatus.READY,
                                error: null,
                                total_row_count: resultsCache.totalRowCount,
                                columns: resultsCache.columns,
                                original_columns: resultsCache.originalColumns,
                                results_file_name: resultsCache.fileName,
                                results_created_at: resultsCache.createdAt,
                                results_updated_at: resultsCache.updatedAt,
                                results_expires_at: resultsCache.expiresAt,
                                pivot_values_columns:
                                    resultsCache.pivotValuesColumns,
                                pivot_total_column_count:
                                    resultsCache.pivotTotalColumnCount,
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

                    // Trigger query in the background, update query history when complete
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
                        cacheKey,
                        originalColumns,
                    });

                    return {
                        queryUuid: queryHistoryUuid,
                        cacheMetadata: {
                            cacheHit: false,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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
            throw new CustomSqlQueryForbiddenError();
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

        const { sql, fields, warnings } =
            await this.prepareMetricQueryAsyncQueryArgs({
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
                originalColumns: undefined,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery,
            fields,
            warnings,
        };
    }

    async executeAsyncSavedChartQuery({
        user,
        projectUuid,
        chartUuid,
        versionUuid,
        context,
        invalidateCache,
        limit,
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
            limit,
        };

        // Apply limit override if provided in the request
        // For unlimited results (null), use Number.MAX_SAFE_INTEGER
        const metricQueryWithLimit =
            limit !== undefined
                ? {
                      ...metricQuery,
                      limit: limit ?? MAX_SAFE_INTEGER,
                  }
                : metricQuery;

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

        const { sql, fields, warnings } =
            await this.prepareMetricQueryAsyncQueryArgs({
                user,
                metricQuery: metricQueryWithLimit,
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
                metricQuery: metricQueryWithLimit,
                fields,
                sql,
                originalColumns: undefined,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery: metricQueryWithLimit,
            fields,
            warnings,
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
        limit,
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

        // Apply limit override if provided in the request
        // For unlimited results (null), use Number.MAX_SAFE_INTEGER
        const metricQueryWithLimit =
            limit !== undefined
                ? {
                      ...metricQueryWithDashboardOverrides,
                      limit: limit ?? MAX_SAFE_INTEGER,
                  }
                : metricQueryWithDashboardOverrides;

        const exploreDimensions = getDimensions(explore);

        const metricQueryDimensions = [
            ...metricQueryWithLimit.dimensions,
            ...(metricQueryWithLimit.customDimensions ?? []),
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
            metricQueryWithLimit.metadata = {
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
            limit,
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
            metricQuery: metricQueryWithLimit,
            explore,
            dateZoom,
            warehouseClient: warehouseConnection.warehouseClient,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                explore,
                metricQuery: metricQueryWithLimit,
                context,
                queryTags,
                invalidateCache,
                dateZoom,
                fields,
                sql,
                originalColumns: undefined,
            },
            requestParameters,
            warehouseConnection,
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters,
            metricQuery: metricQueryWithLimit,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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

        const { sql, fields, warnings } =
            await this.prepareMetricQueryAsyncQueryArgs({
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
                    originalColumns: undefined,
                },
                requestParameters,
                warehouseConnection,
            );

        return {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: underlyingDataMetricQuery,
            fields,
            warnings,
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
            originalColumns,
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
                originalColumns,
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
        tileUuid,
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
        tileUuid?: string;
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

        // Convert to ResultColumns format for storing as original columns
        const originalColumns: ResultColumns = columns.reduce((acc, col) => {
            acc[col.name] = {
                reference: col.name,
                type: col.type,
            };
            return acc;
        }, {} as ResultColumns);

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
            SQL_QUERY_MOCK_EXPLORER_NAME,
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

        const fieldQuoteChar = getFieldQuoteChar(
            warehouseConnection.warehouseClient.credentials.type,
        );

        // Create a referenceMap from vizColumns
        const referenceMap: ReferenceMap = {};
        vizColumns.forEach((col) => {
            referenceMap[col.reference] = {
                type: col.type,
                sql: `${fieldQuoteChar}${col.reference}${fieldQuoteChar}`,
            };
        });

        let appliedDashboardFilters: DashboardFilters | undefined;
        if (dashboardFilters && tileUuid) {
            appliedDashboardFilters = {
                dimensions: getDashboardFilterRulesForTileAndReferences(
                    tileUuid,
                    Object.keys(referenceMap),
                    dashboardFilters.dimensions,
                ),
                metrics: [],
                tableCalculations: [],
            };

            // This override isn't used for anything at the moment since sql charts don't support filters, but it's here for future use
            metricQuery = {
                ...addDashboardFiltersToMetricQuery(
                    metricQuery,
                    appliedDashboardFilters,
                    virtualView,
                ),
            };
        }
        if (dashboardSorts) {
            metricQuery = {
                ...metricQuery,
                sorts:
                    dashboardSorts && dashboardSorts.length > 0
                        ? dashboardSorts
                        : [],
            };
        }

        // Select all vizColumns
        const selectColumns = vizColumns.map((col) => col.reference);

        // Create and return the QueryBuilder instance
        const queryBuilder = new QueryBuilder(
            {
                referenceMap,
                select: selectColumns,
                from: { name: 'sql_query', sql: sqlWithLimit },
                filters: appliedDashboardFilters
                    ? {
                          id: uuidv4(),
                          and: appliedDashboardFilters.dimensions,
                      }
                    : undefined,
            },
            {
                fieldQuoteChar,
                stringQuoteChar:
                    warehouseConnection.warehouseClient.getStringQuoteChar(),
                escapeStringQuoteChar:
                    warehouseConnection.warehouseClient.getEscapeStringQuoteChar(),
                startOfWeek:
                    warehouseConnection.warehouseClient.getStartOfWeek(),
                adapterType:
                    warehouseConnection.warehouseClient.getAdapterType(),
            },
        );
        return {
            metricQuery,
            pivotConfiguration,
            virtualView,
            queryTags,
            warehouseConnection,
            sql: queryBuilder.toSql(),
            appliedDashboardFilters,
            originalColumns,
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
            originalColumns,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            projectUuid: sqlChart.project.projectUuid,
            organizationUuid: sqlChart.organization.organizationUuid,
            sql: sqlChart.sql,
            config: sqlChart.config,
            limit: limit ?? sqlChart.limit,
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
                originalColumns,
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
            tileUuid,
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
            originalColumns,
        } = await this.prepareSqlChartAsyncQueryArgs({
            user,
            context,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            sql: savedChart.sql,
            config: savedChart.config,
            tileUuid,
            dashboardFilters,
            dashboardSorts,
            limit: limit ?? savedChart.limit,
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
                originalColumns,
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
