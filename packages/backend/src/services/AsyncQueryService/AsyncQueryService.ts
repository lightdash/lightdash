import { subject } from '@casl/ability';
import {
    Account,
    addDashboardFiltersToMetricQuery,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    ApiPreAggregateStatsResults,
    applyDashboardFiltersForTile,
    assertIsAccountWithOrg,
    assertUnreachable,
    CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    CompiledDimension,
    convertCustomFormatToFormatExpression,
    convertFieldRefToFieldId,
    createVirtualView as createVirtualViewObject,
    CreateWarehouseCredentials,
    CustomSqlQueryForbiddenError,
    DashboardFilters,
    DashboardPreAggregateAudit,
    DEFAULT_RESULTS_PAGE_SIZE,
    derivePivotConfigurationFromChart,
    Dimension,
    DimensionType,
    DownloadFileType,
    ExpiredQueryError,
    Explore,
    ExploreCompiler,
    ExploreType,
    FieldType,
    flattenFilterGroup,
    ForbiddenError,
    formatItemValue,
    formatRawRows,
    formatRawValue,
    formatRow,
    getAvailableFilterFieldIds,
    getColumnTimezone,
    getDashboardFilterRulesForTables,
    getDashboardFilterRulesForTileAndReferences,
    getDimensions,
    getDimensionsWithValidParameters,
    getErrorMessage,
    getFieldsFromMetricQuery,
    getItemId,
    getItemMap,
    getMetricOverridesWithPopInheritance,
    getMetrics,
    getMetricsWithValidParameters,
    isCartesianChartConfig,
    isCustomBinDimension,
    isCustomDimension,
    isDateItem,
    isExploreError,
    isField,
    isJwtUser,
    isMetric,
    isValidTimezone,
    isVizTableConfig,
    ItemsMap,
    KnexPaginateArgs,
    KnexPaginatedData,
    MetricQuery,
    normalizeIndexColumns,
    NotFoundError,
    NotSupportedError,
    ParameterError,
    ParseError,
    PivotConfig,
    PivotConfiguration,
    QueryExecutionContext,
    QueryHistoryStatus,
    resolveQueryTimezone,
    ResultRow,
    ResultsExpiredError,
    S3Error,
    SchedulerFormat,
    SqlChart,
    UnexpectedServerError,
    UserAccessControls,
    WarehouseClient,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    type ApiExecuteAsyncFieldValueSearchResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type CacheMetadata,
    type CompiledCustomSqlDimension,
    type CompiledMetric,
    type CustomDimension,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncFieldValueSearchRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type Organization,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type PivotValuesColumn,
    type Project,
    type QueryHistory,
    type ReadyQueryResultsPage,
    type ResultColumns,
    type RunQueryTags,
    type SpaceSummaryBase,
    type WarehouseExecuteAsyncQuery,
    type WarehouseResults,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { SshTunnel, warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { DownloadCsv } from '../../analytics/LightdashAnalytics';
import { transformAndExportResults } from '../../clients/Aws/transformAndExportResults';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import type { INatsClient } from '../../clients/NatsClient';
import { createLocalParquetUploadStream } from '../../clients/ResultsFileStorageClients/LocalParquetUploadStream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { getDuckdbRuntimeConfig } from '../../ee/services/AsyncQueryService/getDuckdbRuntimeConfig';
import { measureTime } from '../../logging/measureTime';
import { DownloadAuditModel } from '../../models/DownloadAuditModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { compileMetricQuery } from '../../queryCompiler';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import { wrapSentryTransaction } from '../../utils';
import { metricQueryWithLimit as applyMetricQueryLimit } from '../../utils/csvLimitUtils';
import {
    processFieldsForExport,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { safeReplaceParametersWithSqlBuilder } from '../../utils/QueryBuilder/parameters';
import { PivotQueryBuilder } from '../../utils/QueryBuilder/PivotQueryBuilder';
import {
    ReferenceMap,
    SqlQueryBuilder,
} from '../../utils/QueryBuilder/SqlQueryBuilder';
import {
    applyLimitToSqlQuery,
    replaceUserAttributesAsStrings,
} from '../../utils/QueryBuilder/utils';
import { SubtotalsCalculator } from '../../utils/SubtotalsCalculator';
import type { ICacheService } from '../CacheService/ICacheService';
import { CreateCacheResult } from '../CacheService/types';
import { CsvService } from '../CsvService/CsvService';
import { ExcelService } from '../ExcelService/ExcelService';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { PersistentDownloadFileService } from '../PersistentDownloadFileService/PersistentDownloadFileService';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import { getFieldValuesMetricQuery } from '../ProjectService/fieldValuesQueryBuilder';
import { getDashboardParametersValuesMap } from '../ProjectService/parameters';
import {
    ProjectService,
    type ProjectServiceArguments,
} from '../ProjectService/ProjectService';
import {
    getNextAndPreviousPage,
    validatePagination,
} from '../ProjectService/resultsPagination';
import {
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';
import { getPivotedColumns } from './getPivotedColumns';
import { getUnpivotedColumns } from './getUnpivotedColumns';
import {
    NoOpPreAggregateStrategy,
    type PreAggregateExecutionResolution,
    type PreAggregateStrategy,
    type PreAggregationRoutingDecision,
} from './PreAggregateStrategy';
import {
    ExecuteAsyncSqlQueryArgs,
    isExecuteAsyncDashboardSqlChartByUuid,
    isExecuteAsyncSqlChartByUuid,
    type DownloadAsyncQueryResultsArgs,
    type ExecuteAsyncDashboardChartQueryArgs,
    type ExecuteAsyncDashboardSqlChartArgs,
    type ExecuteAsyncFieldValueSearchArgs,
    type ExecuteAsyncMetricQueryArgs,
    type ExecuteAsyncQueryReturn,
    type ExecuteAsyncSavedChartQueryArgs,
    type ExecuteAsyncSqlChartArgs,
    type ExecuteAsyncUnderlyingDataQueryArgs,
    type GetAsyncQueryResultsArgs,
    type PollingOptions,
    type PreAggregationRoute,
    type RunAsyncPreAggregateQueryArgs,
    type RunAsyncWarehouseQueryArgs,
    type ScheduleDownloadAsyncQueryResultsArgs,
} from './types';

const SQL_QUERY_MOCK_EXPLORER_NAME = 'sql_query_explorer';

// NULL pivot keys collide with the unsuffixed base column when joined
// (`[null].join('_') === ''`). Wrapped in `<>` so it strips cleanly via
// friendlyName if it ever surfaces in a label fallback.
const NULL_PIVOT_KEY = '<null>';
export const QUEUED_QUERY_EXPIRED_MESSAGE =
    'Your query expired while waiting in the queue. Please try again.';

// Internal-only download result. Adds `s3FileUrl` (the underlying S3
// presigned URL) so the scheduler can hand it to nodemailer for fetching
// attachments — the persistent Lightdash URL in `fileUrl` may not be
// resolvable from the scheduler container. `s3FileUrl` must be stripped
// before returning to public API consumers.
type DownloadAsyncQueryResultsInternal =
    | (ApiDownloadAsyncQueryResults & { s3FileUrl?: string })
    | (ApiDownloadAsyncQueryResultsAsCsv & { s3FileUrl?: string })
    | (ApiDownloadAsyncQueryResultsAsXlsx & { s3FileUrl?: string });

type AsyncQueryExecutionPlan =
    | {
          target: 'warehouse';
          warehouseQuery: string;
          preAggregateResolved?: false;
          preAggregateResolveReason?: string;
      }
    | {
          target: 'pre_aggregate';
          preAggregateQuery: string;
          warehouseQuery: string;
          preAggregateResolved: true;
          preAggregateResolveReason?: undefined;
      }
    | {
          target: 'materialization';
          warehouseQuery: string;
          preAggregateResolved?: false;
          preAggregateResolveReason?: string;
      }
    | {
          target: 'error';
          error: string;
          preAggregateResolved?: false;
          preAggregateResolveReason?: string;
      };

type AsyncQueryServiceArguments = ProjectServiceArguments & {
    queryHistoryModel: QueryHistoryModel;
    downloadAuditModel: DownloadAuditModel;
    cacheService?: ICacheService;
    savedSqlModel: SavedSqlModel;
    resultsStorageClient: S3ResultsFileStorageClient;
    pivotTableService: PivotTableService;
    prometheusMetrics?: PrometheusMetrics;
    schedulerClient: SchedulerClient;
    natsClient: INatsClient;
    permissionsService: PermissionsService;
    persistentDownloadFileService: PersistentDownloadFileService;
    preAggregateStrategy?: PreAggregateStrategy;
};

export class AsyncQueryService extends ProjectService {
    queryHistoryModel: QueryHistoryModel;

    downloadAuditModel: DownloadAuditModel;

    cacheService?: ICacheService;

    savedSqlModel: SavedSqlModel;

    resultsStorageClient: S3ResultsFileStorageClient;

    exportsStorageClient: FileStorageClient;

    pivotTableService: PivotTableService;

    prometheusMetrics?: PrometheusMetrics;

    schedulerClient: SchedulerClient;

    natsClient: INatsClient;

    permissionsService: PermissionsService;

    persistentDownloadFileService: PersistentDownloadFileService;

    protected readonly preAggregateStrategy: PreAggregateStrategy;

    constructor(args: AsyncQueryServiceArguments) {
        super(args);
        this.queryHistoryModel = args.queryHistoryModel;
        this.downloadAuditModel = args.downloadAuditModel;
        this.cacheService = args.cacheService;
        this.savedSqlModel = args.savedSqlModel;
        this.resultsStorageClient = args.resultsStorageClient;
        this.exportsStorageClient = this.fileStorageClient;
        this.pivotTableService = args.pivotTableService;
        this.prometheusMetrics = args.prometheusMetrics;
        this.schedulerClient = args.schedulerClient;
        this.natsClient = args.natsClient;
        this.permissionsService = args.permissionsService;
        this.persistentDownloadFileService = args.persistentDownloadFileService;
        this.preAggregateStrategy =
            args.preAggregateStrategy ?? new NoOpPreAggregateStrategy();
    }

    private recordPreAggregateStats(params: {
        projectUuid: string;
        exploreName: string;
        routingDecision: PreAggregationRoutingDecision;
        chartUuid: string | null;
        dashboardUuid: string | null;
        queryContext: string;
    }): void {
        this.preAggregateStrategy.recordStats(params);
    }

    private trackPreAggregateRoutingEvent({
        account,
        projectUuid,
        context,
        exploreName,
        routingTarget,
        preAggregateMetadata,
        preAggregationRoute,
        chartId,
        dashboardId,
    }: {
        account: Account;
        projectUuid: string;
        context: QueryExecutionContext;
        exploreName: string;
        routingTarget: 'warehouse' | 'pre_aggregate' | 'materialization';
        preAggregateMetadata: NonNullable<CacheMetadata['preAggregate']>;
        preAggregationRoute?: PreAggregationRoute;
        chartId?: string;
        dashboardId?: string;
    }): void {
        this.analytics.trackAccount(account, {
            event: preAggregateMetadata.hit
                ? 'pre_aggregate.hit'
                : 'pre_aggregate.miss',
            properties: {
                organizationId: account.organization?.organizationUuid,
                projectId: projectUuid,
                context,
                exploreName,
                routingTarget,
                routeMode: preAggregationRoute?.mode,
                preAggregateName: preAggregateMetadata.name,
                chartId,
                dashboardId,
                missReason: preAggregateMetadata.reason?.reason,
            },
        });
    }

    async cleanupPreAggregateDailyStats(
        retentionDays: number,
    ): Promise<number> {
        return this.preAggregateStrategy.cleanupStats(retentionDays);
    }

    private async assertSavedChartAccess(
        account: Account,
        action: 'view' | 'create' | 'update' | 'delete' | 'manage',
        savedChart: {
            project: Pick<Project, 'projectUuid'>;
            organization: Pick<Organization, 'organizationUuid'>;
            space: Pick<SpaceSummaryBase, 'uuid'>;
        },
    ) {
        const ctx = await this.spacePermissionService.getSpaceAccessContext(
            account.user.id,
            savedChart.space.uuid,
        );

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                action,
                subject('SavedChart', {
                    organizationUuid: savedChart.organization.organizationUuid,
                    projectUuid: savedChart.project.projectUuid,
                    inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
                    access: ctx.access,
                }),
            )
        ) {
            throw new ForbiddenError("You don't have access to this chart");
        }
    }

    private getPreAggregationRoutingDecision({
        metricQuery,
        explore,
        context,
        forceWarehouse,
    }: {
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
        forceWarehouse: boolean;
    }): PreAggregationRoutingDecision {
        if (forceWarehouse) {
            return { target: 'warehouse' };
        }
        return this.preAggregateStrategy.getRoutingDecision({
            metricQuery,
            explore,
            context,
        });
    }

    private getResultsStorageClientForContext(
        context?: QueryExecutionContext | null,
    ): S3ResultsFileStorageClient {
        const strategyClient =
            context === QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION
                ? this.preAggregateStrategy.getResultsStorageClient()
                : undefined;
        return strategyClient ?? this.resultsStorageClient;
    }

    private async getExploreForMetricQueryExecution({
        account,
        projectUuid,
        exploreName,
        organizationUuid,
        materializationRole,
    }: {
        account: Account;
        projectUuid: string;
        exploreName: string;
        organizationUuid: string;
        materializationRole?: UserAccessControls;
    }): Promise<Explore> {
        if (materializationRole === undefined) {
            return this.getExplore(
                account,
                projectUuid,
                exploreName,
                organizationUuid,
            );
        }

        const ability = this.createAuditedAbility(account);
        const isForbidden =
            ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            ) &&
            ability.cannot(
                'view',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    exploreNames: [exploreName],
                    metadata: { exploreName },
                }),
            );

        if (isForbidden) {
            throw new ForbiddenError();
        }

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );

        if (isExploreError(explore)) {
            throw new NotFoundError(`Explore "${exploreName}" has an error.`);
        }

        if (
            explore.type === ExploreType.PRE_AGGREGATE &&
            ability.cannot(
                'manage',
                subject('PreAggregation', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new NotFoundError(`Explore "${exploreName}" does not exist.`);
        }

        if (!exploreHasFilteredAttribute(explore)) {
            return explore;
        }

        return getFilteredExplore(explore, materializationRole.userAttributes);
    }

    public getCacheExpiresAt(baseDate: Date) {
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

    async getResultsPageFromS3(
        queryUuid: string,
        fileName: string | null,
        queryContext: QueryExecutionContext | null | undefined,
        page: number,
        pageSize: number,
        formatter: (row: ResultRow) => ResultRow,
    ) {
        const resultsStorageClient =
            this.getResultsStorageClientForContext(queryContext);

        if (!resultsStorageClient.isEnabled) {
            throw new S3Error('S3 is not enabled');
        }

        if (!fileName) {
            throw new NotFoundError(
                `Result file not found for query ${queryUuid}`,
            );
        }

        const cacheStream =
            await resultsStorageClient.getDownloadStream(fileName);

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

    async getResultsPageFromWarehouse(
        account: Account,
        queryHistory: QueryHistory,
        page: number,
        pageSize: number,
        formatter: (row: Record<string, unknown>) => ResultRow,
    ) {
        if (!queryHistory.projectUuid) {
            throw new Error('Project UUID is required');
        }

        const warehouseConnection = await this._getWarehouseClient(
            queryHistory.projectUuid,
            await this.getWarehouseCredentials({
                projectUuid: queryHistory.projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
        );

        return warehouseConnection.warehouseClient.getAsyncQueryResults(
            {
                sql: queryHistory.compiledSql,
                queryId: queryHistory.warehouseQueryId,
                queryMetadata: queryHistory.warehouseQueryMetadata,
                page,
                pageSize,
            },
            formatter,
        );
    }

    async cancelAsyncQuery({
        account,
        projectUuid,
        queryUuid,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
    }): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { queryUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        const previousStatus = queryHistory.status;

        await this.queryHistoryModel.update(
            queryHistory.queryUuid,
            projectUuid,
            {
                status: QueryHistoryStatus.CANCELLED,
            },
            account,
        );

        // Track state transition to cancelled
        const queryContext = queryHistory.context || 'unknown';
        if (
            previousStatus === QueryHistoryStatus.PENDING ||
            previousStatus === QueryHistoryStatus.QUEUED ||
            previousStatus === QueryHistoryStatus.EXECUTING
        ) {
            this.prometheusMetrics?.trackQueryStateTransition(
                previousStatus,
                QueryHistoryStatus.CANCELLED,
                queryContext,
            );
        }

        // Track cancelled query in Prometheus
        this.trackQueryTerminalStatus(
            QueryHistoryStatus.CANCELLED,
            queryHistory.createdAt,
            queryContext,
        );
    }

    /**
     * Get the pivot details from the query history, this is a utility function to get the pivot details from the query history
     * @param queryHistory Query history
     * @returns Pivot details
     */
    private static getPivotDetailsFromQueryHistory(
        queryHistory: QueryHistory,
    ): ReadyQueryResultsPage['pivotDetails'] {
        const {
            pivotConfiguration,
            pivotValuesColumns,
            pivotTotalColumnCount,
            originalColumns,
        } = queryHistory;

        const isPivoted = pivotConfiguration && pivotValuesColumns;

        if (!isPivoted) {
            return null;
        }

        const sortedValuesColumns = Object.values(pivotValuesColumns).sort(
            (a, b) => {
                if (a.columnIndex && b.columnIndex) {
                    return a.columnIndex - b.columnIndex;
                }
                return 0;
            },
        );

        return {
            valuesColumns: sortedValuesColumns,
            totalColumnCount: pivotTotalColumnCount,
            indexColumn: pivotConfiguration.indexColumn,
            groupByColumns: pivotConfiguration.groupByColumns,
            sortBy: pivotConfiguration.sortBy,
            originalColumns: originalColumns || {},
        };
    }

    async getAsyncQueryResults({
        account,
        projectUuid,
        queryUuid,
        page = 1,
        pageSize,
    }: GetAsyncQueryResultsArgs): Promise<ApiGetAsyncQueryResults> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        const auditedAbility = this.createAuditedAbility(account);
        const isForbidden =
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { queryUuid },
                }),
            ) &&
            auditedAbility.cannot(
                'view',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    exploreNames: [queryHistory.metricQuery.exploreName],
                    metadata: {
                        queryUuid,
                        exploreName: queryHistory.metricQuery.exploreName,
                    },
                }),
            );

        if (isForbidden) {
            throw new ForbiddenError();
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

        if (
            status === QueryHistoryStatus.ERROR ||
            status === QueryHistoryStatus.EXPIRED
        ) {
            return {
                status,
                queryUuid,
                error: queryHistory.error,
                erroredAt: queryHistory.erroredAt,
            };
        }

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                return {
                    status,
                    queryUuid,
                };
            case QueryHistoryStatus.READY:
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

        if (resultsExpiresAt && resultsExpiresAt < new Date()) {
            this.logger.debug(
                `Results expired for file ${resultsFileName} and project ${projectUuid}`,
            );
            throw new ResultsExpiredError();
        }

        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid: queryHistory.projectUuid,
            organizationUuid: account.organization.organizationUuid,
            userUuid: account.user.id,
            metricQuery: queryHistory.metricQuery,
        });

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
            formatRow(
                row,
                queryHistory.fields,
                queryHistory.pivotValuesColumns,
                undefined,
                displayTimezone ?? undefined,
            );

        const {
            result: { rows },
            durationMs,
        } = await measureTime(
            () =>
                this.getResultsStorageClientForContext(queryHistory.context)
                    .isEnabled || this.cacheService?.isEnabled
                    ? this.getResultsPageFromS3(
                          queryUuid,
                          resultsFileName,
                          queryHistory.context,
                          page,
                          defaultedPageSize,
                          formatter,
                      )
                    : this.getResultsPageFromWarehouse(
                          account,
                          queryHistory,
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

        this.analytics.trackAccount(account, {
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

        this.analytics.trackAccount(account, {
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
                    cacheExpiresAt: resultsExpiresAt ?? undefined,
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
                {
                    default_page_size: defaultedPageSize,
                },
                account,
            );
        }

        if (!columns) {
            throw new UnexpectedServerError(
                `No columns found for query ${queryUuid}`,
            );
        }

        return {
            rows,
            columns,
            totalPageCount: pageCount,
            totalResults: totalRowCount ?? 0,
            queryUuid: queryHistory.queryUuid,
            pageSize: rows.length,
            page,
            nextPage,
            previousPage,
            metadata: {
                performance: {
                    initialQueryExecutionMs:
                        queryHistory.warehouseExecutionTimeMs ?? null,
                    resultsPageExecutionMs: roundedDurationMs,
                    queueTimeMs:
                        this.lightdashConfig.natsWorker.enabled &&
                        queryHistory.processingStartedAt
                            ? Math.round(
                                  queryHistory.processingStartedAt.getTime() -
                                      queryHistory.createdAt.getTime(),
                              )
                            : null,
                },
            },
            status,
            pivotDetails:
                AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory),
        };
    }

    async getResultsStream({
        account,
        projectUuid,
        queryUuid,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
    }): Promise<Readable> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { queryUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { status, resultsFileName } = queryHistory;

        if (
            status === QueryHistoryStatus.ERROR ||
            status === QueryHistoryStatus.EXPIRED
        ) {
            throw new Error(queryHistory.error ?? 'Warehouse query failed');
        }

        if (
            status === QueryHistoryStatus.PENDING ||
            status === QueryHistoryStatus.QUEUED ||
            status === QueryHistoryStatus.EXECUTING
        ) {
            throw new Error(`Query is ${status}`);
        }

        if (status === QueryHistoryStatus.READY) {
            if (!resultsFileName) {
                throw new Error('Results file name not found for query');
            }

            return this.getResultsStorageClientForContext(
                queryHistory.context,
            ).getDownloadStream(resultsFileName);
        }

        throw new Error('Invalid query status');
    }

    // Note: This method should only be used in scheduler worker. It may cause API timeouts.
    async downloadSyncQueryResults(
        args: DownloadAsyncQueryResultsArgs,
        pollingOptions?: PollingOptions,
    ) {
        const { queryUuid, projectUuid, account } = args;
        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });
        return this.downloadAsyncQueryResults(args);
    }

    async download(
        args: DownloadAsyncQueryResultsArgs,
    ): Promise<
        | ApiDownloadAsyncQueryResults
        | ApiDownloadAsyncQueryResultsAsCsv
        | ApiDownloadAsyncQueryResultsAsXlsx
    > {
        const { account, projectUuid, onlyRaw, type } = args;
        const baseAnalyticsProperties: DownloadCsv['properties'] = {
            organizationId: account.organization.organizationUuid,
            projectId: projectUuid,
            fileType:
                type === DownloadFileType.XLSX
                    ? SchedulerFormat.XLSX
                    : SchedulerFormat.CSV,
            values: onlyRaw ? 'raw' : 'formatted',
            storage: this.exportsStorageClient.isEnabled() ? 's3' : 'local',
        };
        this.analytics.trackAccount(account, {
            event: 'download_results.started',
            userId: account.user.id,
            properties: baseAnalyticsProperties,
        });
        try {
            const { s3FileUrl, ...downloadResult } =
                await this.downloadAsyncQueryResults(args);
            this.analytics.trackAccount(account, {
                event: 'download_results.completed',
                userId: account.user.id,
                properties: baseAnalyticsProperties,
            });
            return downloadResult;
        } catch (error) {
            this.analytics.trackAccount(account, {
                event: 'download_results.error',
                userId: account.user.id,
                properties: {
                    ...baseAnalyticsProperties,
                    error: getErrorMessage(error),
                },
            });
            throw error;
        }
    }

    async scheduleDownloadAsyncQueryResults(
        args: ScheduleDownloadAsyncQueryResultsArgs,
    ) {
        const { account, ...payload } = args;
        assertIsAccountWithOrg(account);

        const { organizationUuid } = account.organization;

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid: payload.projectUuid,
                    metadata: {
                        queryUuid: payload.queryUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const userUuid = account.user.id;

        // If the account is a JWT user, we need to include the encoded JWT in the payload
        const encodedJwt = account.isJwtUser()
            ? account.authentication.source
            : undefined;

        return this.schedulerClient.downloadAsyncQueryResults({
            ...payload,
            organizationUuid,
            userUuid,
            encodedJwt,
        });
    }

    private async downloadAsyncQueryResults({
        account,
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
        expirationSecondsOverride,
    }: DownloadAsyncQueryResultsArgs): Promise<DownloadAsyncQueryResultsInternal> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { queryUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid: queryHistory.projectUuid,
            organizationUuid: queryHistory.organizationUuid,
            userUuid:
                AsyncQueryService.getQueryHistoryActor(queryHistory).userUuid,
            metricQuery: queryHistory.metricQuery,
        });

        const { status, resultsFileName, fields, columns } = queryHistory;
        const resultsStorageClient = this.getResultsStorageClientForContext(
            queryHistory.context,
        );

        // First check the query status
        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                throw new Error('Query was cancelled');
            case QueryHistoryStatus.EXPIRED:
            case QueryHistoryStatus.ERROR:
                throw new Error(queryHistory.error ?? 'Warehouse query failed');
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                throw new Error(`Query is ${status}`);
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

        // If no column order is provided, we will use the first line of the results file to get the column order
        // This is useful for SQL queries, where the column order is not set in the config
        let validColumnOrder: string[] = columnOrder;
        if (columnOrder.length === 0) {
            try {
                const firstLine =
                    await resultsStorageClient.getFirstLine(resultsFileName);
                if (firstLine) {
                    const firstRow = JSON.parse(firstLine);
                    validColumnOrder = Object.keys(firstRow);
                }
            } catch (error) {
                this.logger.error('Failed to get first line of results file', {
                    queryUuid,
                    error: getErrorMessage(error),
                });
                throw new ParseError(
                    `Failed to parse JSON from first line: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        }
        try {
            await this.downloadAuditModel.logDownload({
                queryUuid,
                userUuid: isJwtUser(account) ? null : account.user.userUuid,
                organizationUuid,
                projectUuid: projectUuid || null,
                fileType: type || DownloadFileType.JSONL,
                originalQueryContext: queryHistory.context || null,
            });
        } catch (error) {
            this.logger.error('Failed to log download audit', {
                queryUuid,
                organizationUuid,
                error: getErrorMessage(error),
            });
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
                    return this.pivotTableService.downloadAsyncPivotTableCsv({
                        resultsFileName,
                        fields,
                        metricQuery: queryHistory.metricQuery,
                        projectUuid,
                        storageClient: resultsStorageClient,
                        pivotDetails:
                            AsyncQueryService.getPivotDetailsFromQueryHistory(
                                queryHistory,
                            ),
                        options: {
                            onlyRaw,
                            showTableNames,
                            customLabels,
                            columnOrder: validColumnOrder,
                            hiddenFields,
                            pivotConfig,
                            attachmentDownloadName,
                        },
                        organizationUuid,
                        createdByUserUuid: isJwtUser(account)
                            ? null
                            : account.user.userUuid,
                        expirationSecondsOverride,
                        timezone: displayTimezone ?? undefined,
                    });
                }
                return this.downloadAsyncQueryResultsAsFormattedFile(
                    resultsFileName,
                    queryHistory.context,
                    resultFields,
                    {
                        generateFileId: CsvService.generateFileId,
                        streamJsonlRowsToFile: CsvService.streamJsonlRowsToFile,
                    },
                    {
                        onlyRaw,
                        showTableNames,
                        customLabels,
                        columnOrder: validColumnOrder,
                        hiddenFields,
                        pivotConfig,
                    },
                    attachmentDownloadName,
                    {
                        organizationUuid,
                        projectUuid,
                        createdByUserUuid: isJwtUser(account)
                            ? null
                            : account.user.userUuid,
                        fileType: DownloadFileType.CSV,
                        expirationSecondsOverride,
                    },
                    displayTimezone ?? undefined,
                );
            case DownloadFileType.XLSX: {
                // Check if this is a pivot table download
                const xlsxResult =
                    pivotConfig && queryHistory.metricQuery
                        ? await ExcelService.downloadAsyncPivotTableXlsx({
                              resultsFileName,
                              fields,
                              metricQuery: queryHistory.metricQuery,
                              resultsStorageClient,
                              exportsStorageClient: this.exportsStorageClient,
                              lightdashConfig: this.lightdashConfig,
                              pivotDetails:
                                  AsyncQueryService.getPivotDetailsFromQueryHistory(
                                      queryHistory,
                                  ),
                              options: {
                                  onlyRaw,
                                  showTableNames,
                                  customLabels,
                                  columnOrder: validColumnOrder,
                                  hiddenFields,
                                  pivotConfig,
                                  attachmentDownloadName,
                              },
                              timezone: displayTimezone ?? undefined,
                          })
                        : // Use direct Excel export to bypass PassThrough + Upload hanging issues
                          await ExcelService.downloadAsyncExcelDirectly(
                              resultsFileName,
                              resultFields,
                              {
                                  resultsStorageClient,
                                  exportsStorageClient:
                                      this.exportsStorageClient,
                              },
                              {
                                  onlyRaw,
                                  showTableNames,
                                  customLabels,
                                  columnOrder: validColumnOrder,
                                  hiddenFields,
                                  attachmentDownloadName,
                              },
                              displayTimezone ?? undefined,
                          );
                const xlsxPersistentUrl =
                    await this.persistentDownloadFileService.createPersistentUrl(
                        {
                            s3Key: xlsxResult.s3Key,
                            fileType: DownloadFileType.XLSX,
                            organizationUuid,
                            projectUuid,
                            createdByUserUuid: isJwtUser(account)
                                ? null
                                : account.user.userUuid,
                            expirationSeconds: expirationSecondsOverride,
                        },
                    );
                return {
                    fileUrl: xlsxPersistentUrl,
                    s3FileUrl: xlsxResult.fileUrl,
                    truncated: xlsxResult.truncated,
                };
            }
            case undefined:
            case DownloadFileType.JSONL:
                return this.downloadAsyncQueryResultsAsJson(
                    resultsFileName,
                    queryHistory.context,
                );
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
        queryContext: QueryExecutionContext | null | undefined,
        fields: ItemsMap,
        service: {
            generateFileId: (fileName: string) => string;
            streamJsonlRowsToFile: (
                onlyRaw: boolean,
                itemMap: ItemsMap,
                sortedFieldIds: string[],
                headers: string[],
                streams: { readStream: Readable; writeStream: Writable },
                timezone?: string,
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
        persistentUrlContext?: {
            organizationUuid: string;
            projectUuid: string;
            createdByUserUuid: string | null;
            fileType: DownloadFileType;
            expirationSecondsOverride?: number;
        },
        timezone?: string,
    ): Promise<{ fileUrl: string; s3FileUrl?: string; truncated: boolean }> {
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

        // Determine file type based on file extension
        const fileExtension = formattedFileName.toLowerCase().split('.').pop();
        const fileType =
            fileExtension === 'xlsx'
                ? DownloadFileType.XLSX
                : DownloadFileType.CSV;

        // Transform and export the results from results bucket to exports bucket
        const result = await transformAndExportResults(
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
                    timezone,
                );

                return {
                    truncated,
                };
            },
            {
                resultsStorageClient:
                    this.getResultsStorageClientForContext(queryContext),
                exportsStorageClient: this.fileStorageClient,
            },
            {
                fileType,
                attachmentDownloadName: attachmentDownloadName
                    ? `${attachmentDownloadName}.${fileExtension}`
                    : undefined,
            },
        );

        if (persistentUrlContext) {
            const persistentUrl =
                await this.persistentDownloadFileService.createPersistentUrl({
                    s3Key: formattedFileName,
                    fileType: persistentUrlContext.fileType,
                    organizationUuid: persistentUrlContext.organizationUuid,
                    projectUuid: persistentUrlContext.projectUuid,
                    createdByUserUuid: persistentUrlContext.createdByUserUuid,
                    expirationSeconds:
                        persistentUrlContext.expirationSecondsOverride,
                });
            return {
                fileUrl: persistentUrl,
                s3FileUrl: result.fileUrl,
                truncated: result.truncated,
            };
        }

        return result;
    }

    private async downloadAsyncQueryResultsAsJson(
        resultsFileName: string,
        queryContext?: QueryExecutionContext | null,
    ): Promise<ApiDownloadAsyncQueryResults> {
        return {
            fileUrl:
                await this.getResultsStorageClientForContext(
                    queryContext,
                ).getFileUrl(resultsFileName),
        };
    }

    /**
     * Runs the query and transforms the rows if pivoting is enabled
     * Code pivot transformation taken from ProjectService.pivotQueryWorkerTask
     */
    static async runQueryAndTransformRows({
        warehouseClient,
        query,
        queryTags,
        write,
        pivotConfiguration,
        itemsMap,
        dataTimezone,
        displayTimezone,
    }: {
        warehouseClient: WarehouseClient;
        query: string;
        queryTags: RunQueryTags & { query_uuid?: string };
        write?: (rows: Record<string, unknown>[]) => void | Promise<void>;
        pivotConfiguration?: PivotConfiguration;
        itemsMap: ItemsMap;
        dataTimezone?: string;
        displayTimezone: string | null;
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
            ? async (
                  rows: WarehouseResults['rows'],
                  fields: WarehouseResults['fields'],
              ): Promise<void> => {
                  if (!rows[0]) {
                      // skip if empty
                      return;
                  }
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
                      // When there are no group by columns, we can just derive the value columns from the values columns config
                      valuesColumns.forEach((col) => {
                          const valueColumnField =
                              PivotQueryBuilder.getValueColumnFieldName(
                                  col.reference,
                                  col.aggregation,
                              );
                          const valueColumnReference = `${valueColumnField}`;
                          valuesColumnData.set(valueColumnReference, {
                              referenceField: col.reference,
                              pivotColumnName: valueColumnReference,
                              aggregation: col.aggregation,
                              pivotValues: [],
                              // columnIndex is omitted when no groupBy columns
                          });
                      });
                      await write?.(rows);
                      return;
                  }

                  // Process rows sequentially to handle backpressure properly
                  for (const row of rows) {
                      // Write rows to file in order of row_index. This is so that we can pivot the data later
                      if (currentRowIndex !== row.row_index) {
                          if (currentTransformedRow) {
                              pivotTotalRows += 1;
                              // eslint-disable-next-line no-await-in-loop
                              await write?.([currentTransformedRow]);
                          }

                          const indexColumns =
                              normalizeIndexColumns(indexColumn);
                          if (indexColumns.length > 0) {
                              currentTransformedRow =
                                  indexColumns.reduce<ResultRow>(
                                      (acc, indexCol) => {
                                          acc[indexCol.reference] =
                                              row[indexCol.reference];
                                          return acc;
                                      },
                                      {},
                                  );
                          } else {
                              // No index columns - initialize empty row object
                              // All rows have row_index = 1 in this case
                              currentTransformedRow = {};
                          }
                          currentRowIndex = row.row_index;
                      }

                      const pivotValues =
                          groupByColumns?.map((c) => {
                              const field = itemsMap[c.reference];
                              const rawValue = formatRawValue(
                                  field,
                                  row[c.reference],
                              );
                              const formattedValue = field
                                  ? formatItemValue(
                                        field,
                                        row[c.reference],
                                        false,
                                        undefined,
                                        displayTimezone ?? undefined,
                                    )
                                  : String(rawValue);
                              return {
                                  referenceField: c.reference,
                                  // value needs to be raw formatted so that dates match the subtotals and the formatted rows
                                  value: rawValue,
                                  // formatted value to match the display value in the frontend
                                  formatted: formattedValue,
                              };
                          }) ?? [];

                      // Suffix the value column with the group by columns to avoid collisions.
                      // E.g. if we have a row with the value 1 and the group by columns are ['a', 'b'],
                      // then the value column will be 'value_1_a_b'.
                      const valueSuffix =
                          pivotValues.length > 0
                              ? pivotValues
                                    .map((p) =>
                                        p.value === null ||
                                        p.value === undefined
                                            ? NULL_PIVOT_KEY
                                            : p.value,
                                    )
                                    .join('_')
                              : '';

                      // eslint-disable-next-line @typescript-eslint/no-loop-func -- forEach is synchronous, executes within current loop iteration
                      valuesColumns.forEach((col) => {
                          const valueColumnField =
                              PivotQueryBuilder.getValueColumnFieldName(
                                  col.reference,
                                  col.aggregation,
                              );
                          // Truthy check on valueSuffix preserves backwards-compat for
                          // empty-string pivot values (unsuffixed column).
                          const valueColumnReference = valueSuffix
                              ? `${valueColumnField}_${valueSuffix}`
                              : valueColumnField;

                          valuesColumnData.set(valueColumnReference, {
                              referenceField: col.reference, // The original y field name
                              pivotColumnName: valueColumnReference, // The pivoted y field name and agg eg amount_avg_false
                              aggregation: col.aggregation,
                              pivotValues,
                              columnIndex: row.column_index,
                          });

                          currentTransformedRow = currentTransformedRow ?? {};
                          currentTransformedRow[valueColumnReference] =
                              row[valueColumnField];
                      });
                  }
              }
            : async (
                  rows: WarehouseResults['rows'],
                  fields: WarehouseResults['fields'],
              ): Promise<void> => {
                  // Capture columns from the first batch if available
                  unpivotedColumns = getUnpivotedColumns(
                      unpivotedColumns,
                      fields,
                  );
                  await write?.(rows);
              };

        if (dataTimezone && !isValidTimezone(dataTimezone)) {
            throw new ParameterError(`Invalid data timezone: ${dataTimezone}`);
        }

        const warehouseResults = await Sentry.startSpan(
            {
                op: 'db.query',
                name: 'warehouse.executeAsyncQuery',
            },
            () =>
                warehouseClient.executeAsyncQuery(
                    {
                        sql: query,
                        tags: queryTags,
                        timezone: dataTimezone,
                    },
                    write ? writeAndTransformRowsIfPivot : undefined,
                ),
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
            await write?.([currentTransformedRow]);
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

    private async resolveAsyncQueryExecutionPlan({
        projectUuid,
        warehouseQuery,
        metricQuery,
        timezone,
        dateZoom,
        parameters,
        routingTarget,
        preAggregationRoute,
        fieldsMap,
        pivotConfiguration,
        startOfWeek,
        userAccessControls,
        availableParameterDefinitions,
        queryUuid,
        useTimezoneAwareDateTrunc,
    }: {
        projectUuid: string;
        warehouseQuery: string;
        metricQuery: MetricQuery;
        timezone: string;
        dateZoom: ExecuteAsyncMetricQueryArgs['dateZoom'];
        parameters: ExecuteAsyncMetricQueryArgs['parameters'];
        routingTarget: PreAggregationRoutingDecision['target'];
        preAggregationRoute?: PreAggregationRoute;
        fieldsMap: ItemsMap;
        pivotConfiguration?: PivotConfiguration;
        startOfWeek: CreateWarehouseCredentials['startOfWeek'];
        userAccessControls?: UserAccessControls;
        availableParameterDefinitions?: ParameterDefinitions;
        queryUuid: string;
        useTimezoneAwareDateTrunc?: boolean;
    }): Promise<AsyncQueryExecutionPlan> {
        if (routingTarget === 'materialization') {
            return { target: 'materialization', warehouseQuery };
        }

        if (!preAggregationRoute) {
            return { target: 'warehouse', warehouseQuery };
        }

        const resolution = await this.preAggregateStrategy.resolveExecution({
            projectUuid,
            queryUuid,
            warehouseQuery,
            preAggregationRoute,
            resolveArgs: {
                metricQuery,
                timezone,
                dateZoom,
                parameters,
                fieldsMap,
                pivotConfiguration,
                startOfWeek,
                userAccessControls,
                availableParameterDefinitions,
                useTimezoneAwareDateTrunc,
            },
        });

        if (resolution.resolved) {
            this.logger.info(
                `DuckDB pre-agg route selected for ${queryUuid}: ${preAggregationRoute.sourceExploreName}/${preAggregationRoute.preAggregateName}`,
            );
            return {
                target: 'pre_aggregate',
                preAggregateQuery: resolution.query,
                warehouseQuery,
                preAggregateResolved: true,
            };
        }

        if (resolution.isFatal) {
            this.logger.warn(
                `Required pre-aggregate resolution failed for ${queryUuid}: ${resolution.reason}`,
            );
            return {
                target: 'error',
                error: resolution.reason,
                preAggregateResolved: false,
                preAggregateResolveReason: resolution.reason,
            };
        }

        return {
            target: 'warehouse',
            warehouseQuery,
            preAggregateResolved: false,
            preAggregateResolveReason: resolution.reason,
        };
    }

    public async runAsyncPreAggregateQuery({
        userUuid,
        organizationUuid,
        isRegisteredUser,
        isServiceAccount,
        projectUuid,
        queryUuid,
        queryTags,
        fieldsMap,
        cacheKey,
        warehouseCredentialsOverrides,
        pivotConfiguration,
        originalColumns,
        preAggregateQuery,
        warehouseQuery,
        queryCreatedAt,
        displayTimezone,
    }: RunAsyncPreAggregateQueryArgs) {
        try {
            const duckDbWarehouseClient =
                this.preAggregateStrategy.createExecutionWarehouseClient();

            await this.runAsyncWarehouseQuery({
                userUuid,
                organizationUuid,
                isRegisteredUser,
                isServiceAccount,
                projectUuid,
                queryUuid,
                queryTags,
                query: preAggregateQuery,
                fieldsMap,
                cacheKey,
                warehouseCredentialsOverrides,
                pivotConfiguration,
                originalColumns,
                queryCreatedAt,
                displayTimezone,
                warehouseClientOverride: duckDbWarehouseClient,
                warehouseCredentialsTypeOverride:
                    duckDbWarehouseClient.credentials.type,
            });
        } catch (duckdbError) {
            Sentry.getActiveSpan()?.setAttribute(
                'lightdash.preAggregate.fallback',
                true,
            );
            Sentry.getActiveSpan()?.setAttribute(
                'lightdash.executionSource',
                'warehouse_after_duckdb_fallback',
            );
            this.logger.warn(
                `DuckDB pre-agg execution failed for ${queryUuid}: ${getErrorMessage(
                    duckdbError,
                )}. Falling back to warehouse`,
            );
            this.prometheusMetrics?.incrementPreAggregateFallback(
                'duckdb_execution_error',
            );
            await this.runAsyncWarehouseQuery({
                userUuid,
                organizationUuid,
                isRegisteredUser,
                isServiceAccount,
                projectUuid,
                queryUuid,
                queryTags,
                query: warehouseQuery,
                fieldsMap,
                cacheKey,
                warehouseCredentialsOverrides,
                pivotConfiguration,
                originalColumns,
                queryCreatedAt,
                displayTimezone,
            });
        }
    }

    public async runAsyncWarehouseQueryFromHistory(
        queryUuid: string,
        workerLabel: string,
    ): Promise<boolean> {
        const canRun = await this.prepareQueuedQueryForExecution(
            queryUuid,
            workerLabel,
        );

        if (!canRun) {
            return false;
        }

        const args = await this.buildWarehouseQueryArgs(queryUuid);
        await this.runAsyncWarehouseQuery(args);
        return true;
    }

    public async runAsyncPreAggregateQueryFromHistory(
        queryUuid: string,
        workerLabel: string,
    ): Promise<boolean> {
        const canRun = await this.prepareQueuedQueryForExecution(
            queryUuid,
            workerLabel,
        );

        if (!canRun) {
            return false;
        }

        const args = await this.buildPreAggregateQueryArgs(queryUuid);
        await this.runAsyncPreAggregateQuery(args);
        return true;
    }

    public async prepareQueuedQueryForExecution(
        queryUuid: string,
        workerLabel: string,
    ): Promise<boolean> {
        const queryHistory =
            await this.queryHistoryModel.getByQueryUuid(queryUuid);

        if (!queryHistory) {
            this.logger.error(
                `Worker ${workerLabel} could not find query history for async query ${queryUuid}`,
            );
            return false;
        }

        const isQueuedStatus =
            queryHistory.status === QueryHistoryStatus.PENDING ||
            queryHistory.status === QueryHistoryStatus.QUEUED;

        if (!isQueuedStatus) {
            this.logger.info(
                `Worker ${workerLabel} skipped async query ${queryUuid} because status is ${queryHistory.status}`,
            );
            return false;
        }

        const timeInQueueMs =
            Date.now() - new Date(queryHistory.createdAt).getTime();

        if (timeInQueueMs > this.lightdashConfig.natsWorker.queueTimeoutMs) {
            await this.expireQueuedQuery(
                queryHistory,
                timeInQueueMs,
                workerLabel,
            );
            return false;
        }

        const updated =
            await this.queryHistoryModel.updateStatusToExecuting(queryUuid);

        if (updated === 0) {
            this.logger.info(
                `Worker ${workerLabel} skipped async query ${queryUuid} because it could not transition to executing`,
            );
            return false;
        }

        const queryContext = queryHistory.context || 'unknown';
        this.prometheusMetrics?.trackQueryStateTransition(
            QueryHistoryStatus.QUEUED,
            QueryHistoryStatus.EXECUTING,
            queryContext,
        );
        this.prometheusMetrics?.observeQueueWaitDuration(
            timeInQueueMs,
            queryContext,
        );

        return true;
    }

    /**
     * Runs the query the warehouse and updates the query history and cache (if cache is enabled and cache is not hit) when complete
     */
    public async runAsyncWarehouseQuery({
        userUuid,
        organizationUuid,
        isRegisteredUser,
        isServiceAccount,
        projectUuid,
        query,
        fieldsMap,
        queryTags,
        warehouseCredentialsOverrides,
        queryUuid,
        cacheKey,
        pivotConfiguration,
        originalColumns,
        queryCreatedAt,
        displayTimezone,
        warehouseClientOverride,
        warehouseCredentialsTypeOverride,
    }: RunAsyncWarehouseQueryArgs & {
        warehouseClientOverride?: WarehouseClient;
        warehouseCredentialsTypeOverride?: CreateWarehouseCredentials['type'];
    }) {
        type StreamMetrics = {
            totalBytesWritten: number;
            totalRowsWritten: number;
            writeCalls: number;
            elapsedMs: number;
        };

        let stream:
            | {
                  write: (rows: Record<string, unknown>[]) => void;
                  close: () => Promise<void | { parquetConversionMs?: number }>;
                  setColumns?: (cols: ResultColumns) => void;
                  getStreamMetrics?: () => StreamMetrics;
              }
            | undefined;

        let sshTunnel: SshTunnel<CreateWarehouseCredentials> | undefined;

        let warehouseCredentialsType:
            | CreateWarehouseCredentials['type']
            | undefined;
        let warehouseClient: WarehouseClient;

        const analyticsIdentity = isRegisteredUser
            ? { userId: userUuid }
            : { anonymousId: 'embed' };
        const queryHistoryAccount = {
            isRegisteredUser: () => isRegisteredUser,
            user: {
                id: userUuid,
            },
        };

        const executionSource: 'warehouse' | 'pre_aggregate_duckdb' =
            warehouseClientOverride ? 'pre_aggregate_duckdb' : 'warehouse';
        let queryStartTime = Date.now();

        try {
            if (warehouseClientOverride) {
                warehouseClient = warehouseClientOverride;
                warehouseCredentialsType =
                    warehouseCredentialsTypeOverride ??
                    warehouseClient.credentials.type;
            } else {
                const warehouseCredentials = await this.getWarehouseCredentials(
                    {
                        projectUuid,
                        userId: userUuid,
                        isRegisteredUser,
                        isServiceAccount,
                    },
                );

                warehouseCredentialsType = warehouseCredentials.type;

                // Get warehouse client using the projectService
                const warehouseConnection = await this._getWarehouseClient(
                    projectUuid,
                    warehouseCredentials,
                    warehouseCredentialsOverrides,
                );
                warehouseClient = warehouseConnection.warehouseClient;
                sshTunnel = warehouseConnection.sshTunnel;
            }

            const isTimezoneSupportEnabled =
                await this.isTimezoneSupportEnabled({
                    userUuid,
                    organizationUuid,
                });
            const resolvedDataTimezone = isTimezoneSupportEnabled
                ? warehouseClient.credentials.dataTimezone
                : undefined;

            const t0 = Date.now();

            this.logger.info(
                `Running query ${queryUuid} source=${executionSource}`,
            );

            // Create upload stream for storing results
            const isParquetMaterialization =
                this.lightdashConfig.preAggregates.parquetEnabled &&
                queryTags.query_context ===
                    QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION;

            const fileName = QueryHistoryModel.createUniqueResultsFileName(
                cacheKey,
                {
                    sqlSafe: isParquetMaterialization,
                },
            );
            const resultsStorageClient = this.getResultsStorageClientForContext(
                queryTags.query_context,
            );

            if (isParquetMaterialization) {
                const s3Config = getDuckdbRuntimeConfig(
                    this.lightdashConfig.preAggregates.s3,
                );
                const bucket = this.lightdashConfig.preAggregates.s3?.bucket;
                if (!s3Config || !bucket) {
                    throw new Error(
                        'Missing S3 configuration for stream-to-parquet',
                    );
                }
                const parquetS3Uri = `s3://${bucket}/${fileName}.parquet`;
                this.logger.debug(
                    `Creating LocalParquetUploadStream for query ${queryUuid}: target=${parquetS3Uri}`,
                );
                stream = createLocalParquetUploadStream({
                    parquetS3Uri,
                    s3Config,
                    logger: this.logger,
                    prometheusMetrics: this.prometheusMetrics,
                });
            } else if (resultsStorageClient.isEnabled) {
                // Default: stream JSONL to S3
                stream = resultsStorageClient.createUploadStream(
                    S3ResultsFileStorageClient.sanitizeFileExtension(fileName),
                    {
                        contentType: 'application/jsonl',
                    },
                );
            }

            const s3StreamCreatedMs = Date.now() - t0;

            const createdAt = new Date();
            const newExpiresAt = this.getCacheExpiresAt(createdAt);
            this.analytics.track({
                ...analyticsIdentity,
                event: 'results_cache.create',
                properties: {
                    projectId: projectUuid,
                    cacheKey,
                    totalRowCount: null,
                    createdAt,
                    expiresAt: newExpiresAt,
                    ...(isRegisteredUser
                        ? undefined
                        : { externalId: userUuid }),
                },
            });
            queryStartTime = Date.now();
            const {
                warehouseResults: {
                    durationMs,
                    totalRows,
                    queryMetadata,
                    queryId,
                },
                pivotDetails,
                columns,
            } = await Sentry.startSpan(
                {
                    op: 'query.execute',
                    name: `query.execute.${executionSource}`,
                    attributes: {
                        'lightdash.executionSource': executionSource,
                        'lightdash.queryContext':
                            queryTags.query_context || 'unknown',
                        'lightdash.projectUuid': projectUuid,
                        'lightdash.isPivoted': !!pivotConfiguration,
                    },
                },
                () =>
                    AsyncQueryService.runQueryAndTransformRows({
                        warehouseClient,
                        query,
                        queryTags: { ...queryTags, query_uuid: queryUuid },
                        write: stream?.write,
                        pivotConfiguration,
                        itemsMap: fieldsMap,
                        dataTimezone: resolvedDataTimezone,
                        displayTimezone,
                    }),
            );

            this.prometheusMetrics?.observeWarehouseDuration(
                durationMs,
                warehouseCredentialsType || 'unknown',
                queryTags.query_context || 'unknown',
            );

            this.analytics.track({
                ...analyticsIdentity,
                event: 'query.ready',
                properties: {
                    queryId: queryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                    executionSource,
                    warehouseExecutionTimeMs: durationMs,
                    columnsCount:
                        pivotDetails?.totalColumnCount ??
                        Object.keys(fieldsMap).length,
                    totalRowCount: pivotDetails?.totalRows ?? totalRows,
                    isPivoted: pivotDetails !== null,
                    ...(isRegisteredUser
                        ? undefined
                        : { externalId: userUuid }),
                },
            });

            const queryExecMs = Date.now() - queryStartTime;

            if (stream) {
                // Wait for the file to be written before marking the query as ready
                const s3UploadStart = Date.now();
                const closeResult = await Sentry.startSpan(
                    {
                        op: 's3.upload',
                        name: 's3.results.upload',
                        attributes: {
                            'lightdash.executionSource': executionSource,
                            'lightdash.totalRows':
                                pivotDetails?.totalRows ?? totalRows,
                        },
                    },
                    () => {
                        stream?.setColumns?.(columns);
                        return stream?.close();
                    },
                );
                if (
                    executionSource === 'pre_aggregate_duckdb' ||
                    this.lightdashConfig.prometheus.allQueryMetricsEnabled
                ) {
                    this.prometheusMetrics?.observeS3ResultsUploadDuration(
                        Date.now() - s3UploadStart,
                        executionSource,
                    );
                }
                if (
                    closeResult &&
                    typeof closeResult === 'object' &&
                    'parquetConversionMs' in closeResult &&
                    closeResult.parquetConversionMs != null
                ) {
                    this.prometheusMetrics?.observeParquetConversionDuration(
                        closeResult.parquetConversionMs,
                        'success',
                    );
                }

                this.analytics.track({
                    ...analyticsIdentity,
                    event: 'results_cache.write',
                    properties: {
                        queryId: queryUuid,
                        projectId: projectUuid,
                        cacheKey,
                        executionSource,
                        totalRowCount: pivotDetails?.totalRows ?? totalRows,
                        pivotTotalColumnCount: pivotDetails?.totalColumnCount,
                        isPivoted: pivotDetails !== null,
                        ...(isRegisteredUser
                            ? undefined
                            : { externalId: userUuid }),
                    },
                });
            }

            const dbUpdateStart = Date.now();
            await this.queryHistoryModel.update(
                queryUuid,
                projectUuid,
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
                    results_file_name: stream ? fileName : null,
                    results_created_at: stream ? createdAt : null,
                    results_updated_at: stream ? new Date() : null,
                    results_expires_at: stream ? newExpiresAt : null,
                    columns,
                    original_columns: originalColumns,
                },
                queryHistoryAccount,
            );
            const dbUpdateMs = Date.now() - dbUpdateStart;

            const totalMs = Date.now() - t0;
            const s3UploadCloseMs = stream
                ? Math.round(
                      totalMs - queryExecMs - s3StreamCreatedMs - dbUpdateMs,
                  )
                : 0;
            const streamMetrics = stream?.getStreamMetrics?.();
            const streamMetricsStr = streamMetrics
                ? ` stream_bytes=${streamMetrics.totalBytesWritten} stream_rows=${streamMetrics.totalRowsWritten} write_calls=${streamMetrics.writeCalls}`
                : '';
            this.logger.info(
                `Query ${queryUuid} completed: source=${executionSource} s3_stream_create=${s3StreamCreatedMs}ms query_exec=${queryExecMs}ms s3_upload_close=${s3UploadCloseMs}ms db_update=${dbUpdateMs}ms total=${totalMs}ms rows=${pivotDetails?.totalRows ?? totalRows}${streamMetricsStr}`,
            );

            // Track successful query in Prometheus
            this.prometheusMetrics?.trackQueryStateTransition(
                QueryHistoryStatus.EXECUTING,
                QueryHistoryStatus.READY,
                queryTags.query_context || 'unknown',
            );
            this.trackQueryTerminalStatus(
                QueryHistoryStatus.READY,
                queryCreatedAt,
                queryTags.query_context || 'unknown',
            );
        } catch (e) {
            this.logger.error(
                `Query ${queryUuid} execution error: ${getErrorMessage(e)}`,
                {
                    queryUuid,
                    projectUuid,
                    organizationUuid,
                    userUuid: isRegisteredUser ? userUuid : undefined,
                    isEmbed: !isRegisteredUser,
                    warehouseType: warehouseCredentialsType,
                    errorName: e instanceof Error ? e.name : undefined,
                    errorCode: (e as { code?: string })?.code,
                    queryContext: queryTags.query_context,
                },
            );

            // Override clients are used for fallback attempts such as DuckDB
            // pre-aggregate execution. Keep the query history row non-terminal
            // so polling clients can receive the warehouse retry result.
            if (warehouseClientOverride) {
                throw e;
            }

            this.analytics.track({
                ...analyticsIdentity,
                event: 'query.error',
                properties: {
                    queryId: queryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseCredentialsType,
                    executionSource,
                    ...(isRegisteredUser
                        ? undefined
                        : { externalId: userUuid }),
                },
            });
            await this.queryHistoryModel.updateStatusToError(
                queryUuid,
                projectUuid,
                getErrorMessage(e),
                queryHistoryAccount,
            );

            // Track error query in Prometheus
            this.prometheusMetrics?.trackQueryStateTransition(
                QueryHistoryStatus.EXECUTING,
                QueryHistoryStatus.ERROR,
                queryTags.query_context || 'unknown',
            );
            this.trackQueryTerminalStatus(
                QueryHistoryStatus.ERROR,
                queryCreatedAt,
                queryTags.query_context || 'unknown',
            );
        }

        try {
            // await for the cleanup functions so that the error is thrown if they fail
            await sshTunnel?.disconnect();
            await stream?.close();
        } catch (e) {
            await this.queryHistoryModel.updateStatusToError(
                queryUuid,
                projectUuid,
                getErrorMessage(e),
                queryHistoryAccount,
            );

            // Throw the error again so that it can be added to the span
            throw e;
        }
    }

    /**
     * Resolves both the honest `resolvedTimezone` (always a valid TZ string,
     * used for SQL compilation + cache keys) and the flag-gated
     * `displayTimezone` (null when timezone-aware DATE_TRUNC is off — this is
     * what reaches API responses and the row formatter).
     */
    private async resolveTimezoneContext({
        projectUuid,
        organizationUuid,
        userUuid,
        metricQuery,
    }: {
        projectUuid: string | null;
        organizationUuid: string;
        userUuid: string;
        metricQuery: MetricQuery;
    }): Promise<{
        resolvedTimezone: string;
        displayTimezone: string | null;
        enabled: boolean;
    }> {
        const projectTimezone = projectUuid
            ? await this.getQueryTimezoneForProject(projectUuid)
            : 'UTC';
        const resolvedTimezone = resolveQueryTimezone(
            metricQuery,
            projectTimezone,
        );
        const enabled = await this.isTimezoneSupportEnabled({
            userUuid,
            organizationUuid,
        });
        return {
            resolvedTimezone,
            displayTimezone: enabled ? resolvedTimezone : null,
            enabled,
        };
    }

    private async buildWarehouseQueryArgs(
        queryUuid: string,
    ): Promise<RunAsyncWarehouseQueryArgs> {
        const query = await this.getQueryHistoryFromHistory(queryUuid);
        const actor = AsyncQueryService.getQueryHistoryActor(query);
        const queryTags = AsyncQueryService.buildQueryTags(query);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(query);
        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid: query.projectUuid,
            organizationUuid: query.organizationUuid,
            userUuid: actor.userUuid,
            metricQuery: query.metricQuery,
        });

        return {
            projectUuid: query.projectUuid ?? '',
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
            queryUuid: query.queryUuid,
            isRegisteredUser: actor.isRegisteredUser,
            isServiceAccount: actor.isServiceAccount,
            queryTags,
            fieldsMap: query.fields,
            cacheKey: query.cacheKey,
            warehouseCredentialsOverrides,
            pivotConfiguration: query.pivotConfiguration ?? undefined,
            originalColumns: query.originalColumns ?? undefined,
            queryCreatedAt: query.createdAt,
            query: query.compiledSql,
            displayTimezone,
        };
    }

    private async buildPreAggregateQueryArgs(
        queryUuid: string,
    ): Promise<RunAsyncPreAggregateQueryArgs> {
        const query = await this.getQueryHistoryFromHistory(queryUuid);

        if (!query.preAggregateCompiledSql) {
            throw new NotFoundError(
                `Pre-aggregate query not found in query_history for ${queryUuid}`,
            );
        }

        const actor = AsyncQueryService.getQueryHistoryActor(query);
        const queryTags = AsyncQueryService.buildQueryTags(query);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(query);
        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid: query.projectUuid,
            organizationUuid: query.organizationUuid,
            userUuid: actor.userUuid,
            metricQuery: query.metricQuery,
        });

        return {
            projectUuid: query.projectUuid ?? '',
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
            queryUuid: query.queryUuid,
            isRegisteredUser: actor.isRegisteredUser,
            isServiceAccount: actor.isServiceAccount,
            queryTags,
            fieldsMap: query.fields,
            cacheKey: query.cacheKey,
            warehouseCredentialsOverrides,
            pivotConfiguration: query.pivotConfiguration ?? undefined,
            originalColumns: query.originalColumns ?? undefined,
            queryCreatedAt: query.createdAt,
            preAggregateQuery: query.preAggregateCompiledSql,
            warehouseQuery: query.compiledSql,
            displayTimezone,
        };
    }

    private async getQueryHistoryFromHistory(
        queryUuid: string,
    ): Promise<QueryHistory> {
        const query = await this.queryHistoryModel.getByQueryUuid(queryUuid);

        if (!query) {
            throw new NotFoundError(
                `Query history not found for query ${queryUuid}`,
            );
        }

        return query;
    }

    private trackQueryTerminalStatus(
        status: QueryHistoryStatus,
        queryCreatedAt: Date | null | undefined,
        context: string,
    ) {
        this.prometheusMetrics?.incrementQueryStatus(status, context);
        if (queryCreatedAt) {
            this.prometheusMetrics?.observeQueryTotalDuration(
                Date.now() - queryCreatedAt.getTime(),
                context,
            );
        }
    }

    private async expireQueuedQuery(
        queryHistory: QueryHistory,
        timeInQueueMs: number,
        workerLabel: string,
    ): Promise<void> {
        await this.queryHistoryModel.updateStatusToExpired(
            queryHistory.queryUuid,
            QUEUED_QUERY_EXPIRED_MESSAGE,
        );

        const queryContext = queryHistory.context || 'unknown';
        this.prometheusMetrics?.trackQueryStateTransition(
            QueryHistoryStatus.QUEUED,
            QueryHistoryStatus.EXPIRED,
            queryContext,
        );
        this.trackQueryTerminalStatus(
            QueryHistoryStatus.EXPIRED,
            queryHistory.createdAt,
            queryContext,
        );

        Sentry.withScope((scope) => {
            scope.setTag('lightdash.queryUuid', queryHistory.queryUuid);
            if (queryHistory.projectUuid) {
                scope.setTag('lightdash.projectUuid', queryHistory.projectUuid);
            }
            scope.setContext('query_queue', {
                organizationUuid: queryHistory.organizationUuid,
                projectUuid: queryHistory.projectUuid,
                status: queryHistory.status,
                queueTimeoutMs: this.lightdashConfig.natsWorker.queueTimeoutMs,
                timeInQueueMs,
            });
            Sentry.captureException(
                new ExpiredQueryError(QUEUED_QUERY_EXPIRED_MESSAGE, {
                    queryUuid: queryHistory.queryUuid,
                    organizationUuid: queryHistory.organizationUuid,
                    projectUuid: queryHistory.projectUuid,
                    timeInQueueMs,
                    queueTimeoutMs:
                        this.lightdashConfig.natsWorker.queueTimeoutMs,
                }),
            );
        });

        this.logger.warn(
            `Worker ${workerLabel} expired async query ${queryHistory.queryUuid} after ${timeInQueueMs}ms in queue`,
            {
                organizationUuid: queryHistory.organizationUuid,
                projectUuid: queryHistory.projectUuid,
                queueTimeoutMs: this.lightdashConfig.natsWorker.queueTimeoutMs,
            },
        );
    }

    private static getQueryHistoryActor(query: QueryHistory): {
        userUuid: string;
        isRegisteredUser: boolean;
        isServiceAccount: boolean;
    } {
        switch (query.createdByActorType) {
            case 'jwt':
                if (!query.createdByAccount) {
                    throw new NotFoundError(
                        `JWT actor identity not found in query_history for ${query.queryUuid}`,
                    );
                }

                return {
                    userUuid: query.createdByAccount,
                    isRegisteredUser: false,
                    isServiceAccount: false,
                };
            case 'service-account':
                if (!query.createdByUserUuid) {
                    throw new NotFoundError(
                        `Registered actor identity not found in query_history for ${query.queryUuid}`,
                    );
                }

                return {
                    userUuid: query.createdByUserUuid,
                    isRegisteredUser: true,
                    isServiceAccount: true,
                };
            case 'session':
            case 'pat':
            case 'oauth':
                if (!query.createdByUserUuid) {
                    throw new NotFoundError(
                        `Registered actor identity not found in query_history for ${query.queryUuid}`,
                    );
                }

                return {
                    userUuid: query.createdByUserUuid,
                    isRegisteredUser: true,
                    isServiceAccount: false,
                };
            case null:
                throw new NotFoundError(
                    `Actor type not found in query_history for ${query.queryUuid}`,
                );
            default:
                return assertUnreachable(
                    query.createdByActorType,
                    'Unknown query actor type',
                );
        }
    }

    private static buildQueryTags(query: QueryHistory): RunQueryTags {
        let actorTags: Record<string, string>;
        if (query.createdByActorType === 'jwt') {
            if (!query.createdByAccount) {
                throw new NotFoundError(
                    `JWT actor identity not found in query_history for ${query.queryUuid}`,
                );
            }

            actorTags = {
                embed: 'true',
                external_id: query.createdByAccount,
            };
        } else if (query.createdByUserUuid) {
            actorTags = { user_uuid: query.createdByUserUuid };
        } else {
            throw new NotFoundError(
                `Registered actor identity not found in query_history for ${query.queryUuid}`,
            );
        }

        const params = query.requestParameters;
        const chartUuid =
            params && 'chartUuid' in params ? params.chartUuid : undefined;
        const dashboardUuid =
            params && 'dashboardUuid' in params
                ? params.dashboardUuid
                : undefined;

        return {
            ...actorTags,
            organization_uuid: query.organizationUuid,
            project_uuid: query.projectUuid ?? undefined,
            explore_name: query.metricQuery.exploreName,
            query_context: query.context,
            ...(chartUuid ? { chart_uuid: chartUuid } : {}),
            ...(dashboardUuid ? { dashboard_uuid: dashboardUuid } : {}),
        };
    }

    private async deriveWarehouseCredentialsOverrides(
        query: QueryHistory,
    ): Promise<
        | { snowflakeVirtualWarehouse?: string; databricksCompute?: string }
        | undefined
    > {
        const { exploreName } = query.metricQuery;
        if (!exploreName || !query.projectUuid) {
            return undefined;
        }

        try {
            const explore = await this.projectModel.getExploreFromCache(
                query.projectUuid,
                exploreName,
            );

            if (isExploreError(explore)) {
                return undefined;
            }

            if (!explore.warehouse && !explore.databricksCompute) {
                return undefined;
            }

            return {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            };
        } catch {
            this.logger.warn(
                `Could not derive warehouse credentials overrides for explore "${exploreName}" in project "${query.projectUuid}"`,
            );
            return undefined;
        }
    }

    private async getMetricQueryFields({
        metricQuery,
        dateZoom,
        explore,
        warehouseSqlBuilder,
        projectUuid,
    }: Pick<
        ExecuteAsyncMetricQueryArgs,
        'metricQuery' | 'dateZoom' | 'projectUuid'
    > & {
        warehouseSqlBuilder: WarehouseSqlBuilder;
        explore: Explore;
        pivotConfiguration?: PivotConfiguration;
    }) {
        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );
        const availableParameters = Object.keys(availableParameterDefinitions);

        const { explore: exploreWithOverride, dateZoomApplied } =
            ProjectService.updateExploreWithDateZoom(
                explore,
                metricQuery,
                warehouseSqlBuilder,
                availableParameters,
                dateZoom,
            );

        const compiledMetricQuery = compileMetricQuery({
            explore: exploreWithOverride,
            metricQuery,
            warehouseSqlBuilder,
            availableParameters,
        });

        const fields = getFieldsFromMetricQuery(
            compiledMetricQuery,
            exploreWithOverride,
        );

        return { fields, dateZoomApplied };
    }

    private async prepareMetricQueryAsyncQueryArgs({
        account,
        metricQuery,
        dateZoom,
        explore,
        warehouseSqlBuilder,
        parameters,
        projectUuid,
        pivotConfiguration,
        userAttributeOverrides,
        materializationRole,
        columnTimezone,
    }: Pick<
        ExecuteAsyncMetricQueryArgs,
        | 'account'
        | 'metricQuery'
        | 'dateZoom'
        | 'parameters'
        | 'projectUuid'
        | 'userAttributeOverrides'
        | 'materializationRole'
    > & {
        warehouseSqlBuilder: WarehouseSqlBuilder;
        explore: Explore;
        pivotConfiguration?: PivotConfiguration;
        columnTimezone?: string;
    }) {
        assertIsAccountWithOrg(account);

        const resolvedUserAccessControls =
            materializationRole ?? (await this.getUserAttributes({ account }));
        const { userAttributes: baseUserAttributes, intrinsicUserAttributes } =
            resolvedUserAccessControls;
        const userAttributes =
            materializationRole === undefined && userAttributeOverrides
                ? { ...baseUserAttributes, ...userAttributeOverrides }
                : baseUserAttributes;

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        const {
            resolvedTimezone,
            displayTimezone,
            enabled: useTimezoneAwareDateTrunc,
        } = await this.resolveTimezoneContext({
            projectUuid,
            organizationUuid: account.organization.organizationUuid,
            userUuid: account.user.id,
            metricQuery,
        });

        const fullQuery = await ProjectService._compileQuery({
            metricQuery,
            explore,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes,
            timezone: resolvedTimezone,
            dateZoom,
            // ! TODO: Should validate the parameters to make sure they are valid from the options
            parameters,
            availableParameterDefinitions,
            pivotConfiguration,
            pivotDimensions: metricQuery.pivotDimensions,
            useTimezoneAwareDateTrunc,
            columnTimezone,
        });

        const resolvedMetricOverrides =
            getMetricOverridesWithPopInheritance(metricQuery);

        const fieldsWithOverrides: ItemsMap = Object.fromEntries(
            Object.entries(fullQuery.fields).map(([key, value]) => {
                // Check for metric or dimension overrides. PoP metric overrides
                // are inherited from their base metric by the shared util above.
                const override =
                    resolvedMetricOverrides[key] ||
                    metricQuery.dimensionOverrides?.[key];
                if (override) {
                    const { formatOptions } = override;

                    if (formatOptions) {
                        return [
                            key,
                            {
                                ...value,
                                // Override the format expression with the metric/dimension query override instead of adding `formatOptions` to the item
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

        const responseMetricQuery = metricQuery;

        return {
            sql: fullQuery.query,
            fields: fieldsWithOverrides,
            warnings: fullQuery.warnings,
            parameterReferences: Array.from(fullQuery.parameterReferences),
            missingParameterReferences: Array.from(
                fullQuery.missingParameterReferences,
            ),
            usedParameters: fullQuery.usedParameters,
            responseMetricQuery,
            userAccessControls: { userAttributes, intrinsicUserAttributes },
            availableParameterDefinitions,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        };
    }

    private async executePreparedAsyncQuery(
        // TODO: remove metric query, fields, etc from args once they are no longer needed in the database
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            explore: Explore;
            fields: ItemsMap;
            sql: string; // SQL generated from metric query or provided by user
            originalColumns?: ResultColumns;
            missingParameterReferences: string[];
            timezone?: string;
            displayTimezone: string | null;
            useTimezoneAwareDateTrunc: boolean;
            routingTarget?: PreAggregationRoutingDecision['target'];
            preAggregationRoute?: PreAggregationRoute;
            userAccessControls?: UserAccessControls;
            availableParameterDefinitions?: ParameterDefinitions;
        },
        requestParameters: ExecuteAsyncQueryRequestParams,
        organizationUuid: string,
    ): Promise<ExecuteAsyncQueryReturn> {
        return wrapSentryTransaction(
            'ProjectService.executeAsyncQuery',
            {},
            async (span) => {
                const {
                    account,
                    projectUuid,
                    context,
                    dateZoom,
                    queryTags,
                    explore,
                    sql: compiledQuery,
                    metricQuery,
                    fields: fieldsMap,
                    originalColumns,
                    missingParameterReferences,
                    pivotConfiguration,
                    parameters,
                    timezone,
                    displayTimezone,
                    useTimezoneAwareDateTrunc,
                    routingTarget,
                    preAggregationRoute,
                    userAccessControls,
                    availableParameterDefinitions,
                } = args;

                try {
                    assertIsAccountWithOrg(account);

                    // Once we remove the feature flag we won't need to fetch the credentials here, they will only be fetched in the scheduler task
                    const warehouseCredentials =
                        await this.getWarehouseCredentials({
                            projectUuid,
                            userId: account.user.id,
                            isRegisteredUser: account.isRegisteredUser(),
                            isServiceAccount: account.isServiceAccount(),
                        });

                    const warehouseCredentialsType = warehouseCredentials.type;
                    const warehouseCredentialsOverrides: RunAsyncWarehouseQueryArgs['warehouseCredentialsOverrides'] =
                        {
                            snowflakeVirtualWarehouse: explore.warehouse,
                            databricksCompute: explore.databricksCompute,
                        };

                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseCredentialsType,
                    );
                    span.setAttribute('lightdash.context', context);
                    span.setAttribute('lightdash.exploreName', explore.name);
                    span.setAttribute(
                        'lightdash.preAggregate.hasRoute',
                        !!preAggregationRoute,
                    );
                    if (preAggregationRoute) {
                        span.setAttribute(
                            'lightdash.preAggregate.mode',
                            preAggregationRoute.mode,
                        );
                        span.setAttribute(
                            'lightdash.preAggregate.name',
                            preAggregationRoute.preAggregateName,
                        );
                        span.setAttribute(
                            'lightdash.preAggregate.sourceExplore',
                            preAggregationRoute.sourceExploreName,
                        );
                    }

                    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
                        warehouseCredentialsType,
                        warehouseCredentials.startOfWeek,
                    );

                    let pivotedQuery = null;
                    if (pivotConfiguration) {
                        const pivotQueryBuilder = new PivotQueryBuilder(
                            compiledQuery,
                            pivotConfiguration,
                            warehouseSqlBuilder,
                            args.metricQuery.limit,
                            args.fields,
                        );

                        pivotedQuery = pivotQueryBuilder.toSql({
                            columnLimit:
                                this.lightdashConfig.pivotTable.maxColumnLimit,
                        });
                    }

                    const query = pivotedQuery || compiledQuery;
                    span.setAttribute('generatedSql', query);

                    const onboardingRecord =
                        await this.onboardingModel.getByOrganizationUuid(
                            account.organization.organizationUuid,
                        );

                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            account.organization.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                    }

                    // Generate cache key from project and query identifiers
                    // Include user UUID to prevent cache sharing between users when user-specific credentials are in use
                    // Use the resolved timezone (not metricQuery.timezone) because the
                    // resolved value includes project and config fallbacks. Two queries with
                    // the same SQL but different resolved timezones produce different results
                    // (e.g., timezone-aware DATE_TRUNC, filter boundaries) and must not share a cache entry.
                    const cacheKey = QueryHistoryModel.getCacheKey(
                        projectUuid,
                        {
                            sql: query,
                            timezone,
                            userUuid:
                                warehouseCredentials.userWarehouseCredentialsUuid
                                    ? account.user.id
                                    : null,
                        },
                    );

                    const cacheCheckStart = Date.now();
                    const resultsCache = await this.findResultsCache(
                        projectUuid,
                        cacheKey,
                        args.invalidateCache,
                    );
                    const cacheCheckMs = Date.now() - cacheCheckStart;

                    const historyCreateStart = Date.now();
                    const queryCreatedAt = new Date();
                    const { queryUuid: queryHistoryUuid } =
                        await this.queryHistoryModel.create(account, {
                            projectUuid,
                            organizationUuid,
                            context,
                            fields: fieldsMap,
                            compiledSql: query,
                            requestParameters,
                            metricQuery,
                            cacheKey,
                            pivotConfiguration: pivotConfiguration ?? null,
                        });
                    const historyCreateMs = Date.now() - historyCreateStart;
                    this.prometheusMetrics?.trackQueryStateTransition(
                        'new',
                        QueryHistoryStatus.PENDING,
                        context,
                    );
                    const queryExecutedProperties = {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        context,
                        queryId: queryHistoryUuid,
                        warehouseType: warehouseCredentialsType,
                        ...ProjectService.getMetricQueryExecutionProperties({
                            metricQuery,
                            queryTags,
                            dateZoom,
                            chartUuid:
                                'chartUuid' in requestParameters
                                    ? requestParameters.chartUuid
                                    : undefined,
                            explore,
                            parameters: requestParameters.parameters,
                        }),
                        cacheMetadata: {
                            cacheHit: resultsCache.cacheHit || false,
                            cacheUpdatedTime: resultsCache.updatedAt,
                            cacheExpiresAt: resultsCache.expiresAt,
                        },
                    };
                    const trackQueryExecuted = (
                        executionSource?: 'warehouse' | 'pre_aggregate_duckdb',
                    ) =>
                        this.analytics.trackAccount(account, {
                            event: 'query.executed',
                            properties: {
                                ...queryExecutedProperties,
                                ...(executionSource
                                    ? { executionSource }
                                    : undefined),
                            },
                        });

                    // Track cache hit/miss
                    this.prometheusMetrics?.incrementQueryCacheHit(
                        resultsCache.cacheHit || false,
                        queryTags.query_context || 'unknown',
                        !!preAggregationRoute,
                    );

                    if (resultsCache.cacheHit) {
                        trackQueryExecuted();
                        if (this.lightdashConfig.natsWorker.enabled) {
                            await this.queryHistoryModel.updateStatusToExecuting(
                                queryHistoryUuid,
                            );
                        }
                        await this.queryHistoryModel.update(
                            queryHistoryUuid,
                            projectUuid,
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
                            account,
                        );

                        // Track successful query in Prometheus
                        this.prometheusMetrics?.trackQueryStateTransition(
                            QueryHistoryStatus.PENDING,
                            QueryHistoryStatus.READY,
                            context,
                        );
                        this.trackQueryTerminalStatus(
                            QueryHistoryStatus.READY,
                            queryCreatedAt,
                            context,
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

                    if (missingParameterReferences.length > 0) {
                        trackQueryExecuted();
                        await this.queryHistoryModel.updateStatusToError(
                            queryHistoryUuid,
                            projectUuid,
                            `Missing parameters: ${missingParameterReferences.join(
                                ', ',
                            )}`,
                            account,
                        );
                        this.prometheusMetrics?.trackQueryStateTransition(
                            QueryHistoryStatus.PENDING,
                            QueryHistoryStatus.ERROR,
                            context,
                        );
                        this.trackQueryTerminalStatus(
                            QueryHistoryStatus.ERROR,
                            queryCreatedAt,
                            context,
                        );

                        return {
                            queryUuid: queryHistoryUuid,
                            cacheMetadata: {
                                cacheHit: false,
                            },
                        } satisfies ExecuteAsyncQueryReturn;
                    }

                    const resolveStart = Date.now();
                    const executionPlan =
                        await this.resolveAsyncQueryExecutionPlan({
                            projectUuid,
                            warehouseQuery: query,
                            metricQuery,
                            timezone: timezone ?? 'UTC',
                            dateZoom,
                            parameters,
                            routingTarget: routingTarget ?? 'warehouse',
                            preAggregationRoute,
                            fieldsMap,
                            pivotConfiguration,
                            startOfWeek: warehouseCredentials.startOfWeek,
                            userAccessControls,
                            availableParameterDefinitions,
                            queryUuid: queryHistoryUuid,
                            useTimezoneAwareDateTrunc,
                        });
                    const resolveMs = Date.now() - resolveStart;

                    this.logger.info(
                        `Query ${queryHistoryUuid} orchestration: cache_check=${cacheCheckMs}ms history_create=${historyCreateMs}ms resolve_plan=${resolveMs}ms target=${executionPlan.target}`,
                    );

                    if (preAggregationRoute) {
                        span.setAttribute(
                            'lightdash.preAggregate.resolved',
                            executionPlan.preAggregateResolved === true,
                        );
                        if (
                            executionPlan.preAggregateResolveReason !==
                            undefined
                        ) {
                            span.setAttribute(
                                'lightdash.preAggregate.resolveReason',
                                executionPlan.preAggregateResolveReason,
                            );
                        }
                    }
                    if (executionPlan.target === 'pre_aggregate') {
                        span.setAttribute(
                            'lightdash.executionSource',
                            'pre_aggregate_duckdb',
                        );
                    }

                    if (executionPlan.target === 'error') {
                        trackQueryExecuted();
                        await this.queryHistoryModel.updateStatusToError(
                            queryHistoryUuid,
                            projectUuid,
                            executionPlan.error,
                            account,
                        );
                        this.prometheusMetrics?.trackQueryStateTransition(
                            QueryHistoryStatus.PENDING,
                            QueryHistoryStatus.ERROR,
                            context,
                        );
                        this.trackQueryTerminalStatus(
                            QueryHistoryStatus.ERROR,
                            queryCreatedAt,
                            context,
                        );

                        return {
                            queryUuid: queryHistoryUuid,
                            cacheMetadata: {
                                cacheHit: false,
                            },
                        } satisfies ExecuteAsyncQueryReturn;
                    }

                    trackQueryExecuted(
                        executionPlan.target === 'pre_aggregate'
                            ? 'pre_aggregate_duckdb'
                            : 'warehouse',
                    );

                    const warehouseArgs: RunAsyncWarehouseQueryArgs = {
                        userUuid: account.user.id,
                        organizationUuid,
                        isRegisteredUser: account.isRegisteredUser(),
                        isServiceAccount: account.isServiceAccount(),
                        projectUuid,
                        query: executionPlan.warehouseQuery,
                        fieldsMap,
                        queryTags,
                        warehouseCredentialsOverrides,
                        queryUuid: queryHistoryUuid,
                        pivotConfiguration,
                        cacheKey,
                        originalColumns,
                        queryCreatedAt,
                        displayTimezone,
                    };

                    if (executionPlan.target === 'pre_aggregate') {
                        await this.queryHistoryModel.update(
                            queryHistoryUuid,
                            projectUuid,
                            {
                                pre_aggregate_compiled_sql:
                                    executionPlan.preAggregateQuery,
                            },
                            account,
                        );
                    }

                    if (this.lightdashConfig.natsWorker.enabled) {
                        this.logger.info(
                            `Enqueueing query ${queryHistoryUuid} on NATS JetStream (${executionPlan.target})`,
                        );

                        try {
                            const natsPayload = {
                                queryUuid: queryHistoryUuid,
                            };

                            const enqueueQuery = () => {
                                switch (executionPlan.target) {
                                    case 'pre_aggregate':
                                        return this.natsClient.enqueuePreAggregateQuery(
                                            natsPayload,
                                        );
                                    case 'materialization':
                                        return this.natsClient.enqueueMaterializationQuery(
                                            natsPayload,
                                        );
                                    case 'warehouse':
                                        return this.natsClient.enqueueWarehouseQuery(
                                            natsPayload,
                                        );
                                    default:
                                        return assertUnreachable(
                                            executionPlan,
                                            `Unknown execution target`,
                                        );
                                }
                            };
                            const { jobId } = await enqueueQuery();

                            this.logger.info(
                                `Enqueued query ${queryHistoryUuid} on NATS with job ${jobId}`,
                            );

                            await this.queryHistoryModel.updateStatusToQueued(
                                queryHistoryUuid,
                            );
                            this.prometheusMetrics?.trackQueryStateTransition(
                                QueryHistoryStatus.PENDING,
                                QueryHistoryStatus.QUEUED,
                                context,
                            );
                        } catch (e) {
                            const errorMessage = getErrorMessage(e);
                            this.logger.error(
                                `Failed to enqueue async query ${queryHistoryUuid} on NATS`,
                                e,
                            );

                            await this.queryHistoryModel.updateStatusToError(
                                queryHistoryUuid,
                                projectUuid,
                                `Failed to enqueue ${executionPlan.target} query: ${errorMessage}`,
                                account,
                            );

                            this.prometheusMetrics?.trackQueryStateTransition(
                                QueryHistoryStatus.PENDING,
                                QueryHistoryStatus.ERROR,
                                context,
                            );
                            this.trackQueryTerminalStatus(
                                QueryHistoryStatus.ERROR,
                                queryCreatedAt,
                                context,
                            );

                            return {
                                queryUuid: queryHistoryUuid,
                                cacheMetadata: {
                                    cacheHit: false,
                                },
                            } satisfies ExecuteAsyncQueryReturn;
                        }
                    } else {
                        this.logger.info(
                            `Executing query ${queryHistoryUuid} in the main loop`,
                        );
                        this.prometheusMetrics?.trackQueryStateTransition(
                            QueryHistoryStatus.PENDING,
                            QueryHistoryStatus.EXECUTING,
                            context,
                        );
                        this.prometheusMetrics?.observeQueueWaitDuration(
                            0,
                            context,
                        );

                        const { query: warehouseSql, ...sharedAsyncQueryArgs } =
                            warehouseArgs;
                        const getRunQueryPromise = () => {
                            switch (executionPlan.target) {
                                case 'pre_aggregate':
                                    return this.runAsyncPreAggregateQuery({
                                        ...sharedAsyncQueryArgs,
                                        preAggregateQuery:
                                            executionPlan.preAggregateQuery,
                                        warehouseQuery:
                                            executionPlan.warehouseQuery,
                                    });
                                case 'materialization':
                                case 'warehouse':
                                    return this.runAsyncWarehouseQuery(
                                        warehouseArgs,
                                    );
                                default:
                                    return assertUnreachable(
                                        executionPlan,
                                        `Unknown execution target`,
                                    );
                            }
                        };
                        const runQueryPromise = getRunQueryPromise();

                        void runQueryPromise.catch((e) => {
                            this.logger.error(
                                `Async query ${queryHistoryUuid} failed: ${getErrorMessage(e)}`,
                            );
                            span.setStatus({
                                code: 2, // ERROR
                                message: getErrorMessage(e),
                            });
                        });
                    }

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

    async executeAsyncQuery(
        // TODO: remove metric query, fields, etc from args once they are no longer needed in the database
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            explore: Explore;
            fields: ItemsMap;
            sql: string; // SQL generated from metric query or provided by user
            originalColumns?: ResultColumns;
            missingParameterReferences: string[];
            timezone?: string;
            displayTimezone: string | null;
            useTimezoneAwareDateTrunc: boolean;
            routingTarget?: PreAggregationRoutingDecision['target'];
            preAggregationRoute?: PreAggregationRoute;
            userAccessControls?: UserAccessControls;
            availableParameterDefinitions?: ParameterDefinitions;
        },
        requestParameters: ExecuteAsyncQueryRequestParams,
    ): Promise<ExecuteAsyncQueryReturn> {
        assertIsAccountWithOrg(args.account);

        const { organizationUuid } = await this.projectModel.getSummary(
            args.projectUuid,
        );
        const auditedAbility = this.createAuditedAbility(args.account);
        const isForbidden =
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid: args.projectUuid,
                }),
            ) &&
            auditedAbility.cannot(
                'view',
                subject('Explore', {
                    organizationUuid,
                    projectUuid: args.projectUuid,
                    exploreNames: [args.explore.name],
                    metadata: {
                        exploreName: args.explore.name,
                    },
                }),
            );

        if (isForbidden) {
            throw new ForbiddenError();
        }

        return this.executePreparedAsyncQuery(
            args,
            requestParameters,
            organizationUuid,
        );
    }

    // execute
    async executeAsyncMetricQuery({
        account,
        projectUuid,
        dateZoom,
        context,
        metricQuery,
        invalidateCache,
        usePreAggregateCache,
        parameters,
        pivotConfiguration,
        userAttributeOverrides,
        materializationRole,
    }: ExecuteAsyncMetricQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        assertIsAccountWithOrg(account);

        if (
            materializationRole !== undefined &&
            context !== QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION
        ) {
            throw new ForbiddenError(
                'materializationRole is only supported for pre-aggregate materialization',
            );
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        // We only check `exploreName` for chart embeds. Otherwise, CASL doesn't match
        // on condition checks that aren't set. If no `exploreName` is set in conditions,
        // CASL ignores it.

        const auditedAbility = this.createAuditedAbility(account);
        const isForbidden = auditedAbility.cannot(
            'view',
            subject('Explore', {
                organizationUuid,
                projectUuid,
                exploreNames: [metricQuery.exploreName],
                metadata: {
                    exploreName: metricQuery.exploreName,
                },
            }),
        );
        if (isForbidden) {
            throw new ForbiddenError();
        }

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: metricQuery.exploreName,
            query_context: context,
        };

        const metricQueryStart = Date.now();

        const explore = await this.getExploreForMetricQueryExecution({
            account,
            projectUuid,
            exploreName: metricQuery.exploreName,
            organizationUuid,
            materializationRole:
                context === QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION
                    ? materializationRole
                    : undefined,
        });
        const getExploreMs = Date.now() - metricQueryStart;

        const whCredStart = Date.now();
        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });
        const getWarehouseCredentialsMs = Date.now() - whCredStart;

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        // Combine default parameter values with request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
        );

        const prepareStart = Date.now();
        const {
            sql,
            fields,
            warnings,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
            responseMetricQuery,
            userAccessControls,
            availableParameterDefinitions,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            dateZoom,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            userAttributeOverrides,
            materializationRole,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });
        const prepareMs = Date.now() - prepareStart;

        const requestParameters: ExecuteAsyncMetricQueryRequestParams = {
            context,
            query: metricQuery,
            parameters: combinedParameters,
        };

        const routingDecision = this.getPreAggregationRoutingDecision({
            metricQuery,
            explore,
            context,
            forceWarehouse: usePreAggregateCache === false,
        });

        this.logger.info(
            `Metric query prep for ${metricQuery.exploreName}: get_explore=${getExploreMs}ms get_wh_credentials=${getWarehouseCredentialsMs}ms prepare_query=${prepareMs}ms routing=${routingDecision.target} total=${Date.now() - metricQueryStart}ms`,
        );

        if (routingDecision.preAggregateMetadata) {
            this.prometheusMetrics?.incrementPreAggregateMatch(
                routingDecision.preAggregateMetadata.hit,
                routingDecision.preAggregateMetadata.reason?.reason,
            );
        }

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                metricQuery,
                projectUuid,
                explore,
                context,
                queryTags,
                dateZoom,
                invalidateCache,
                parameters: combinedParameters,
                fields,
                sql,
                originalColumns: undefined,
                missingParameterReferences,
                timezone: resolvedTimezone,
                displayTimezone,
                useTimezoneAwareDateTrunc,
                pivotConfiguration,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
                    userAccessControls,
                    availableParameterDefinitions,
                }),
            },
            requestParameters,
        );

        return {
            queryUuid,
            cacheMetadata: {
                ...cacheMetadata,
                preAggregate: routingDecision.preAggregateMetadata,
            },
            metricQuery: responseMetricQuery,
            fields,
            warnings,
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: displayTimezone,
        };
    }

    async executeAsyncFieldValueSearch({
        account,
        projectUuid,
        table,
        fieldId: initialFieldId,
        search,
        limit = 50,
        filters,
        forceRefresh,
        invalidateCache,
        parameters,
        userAttributeOverrides,
    }: ExecuteAsyncFieldValueSearchArgs): Promise<ApiExecuteAsyncFieldValueSearchResults> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { fieldId: initialFieldId },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const context = QueryExecutionContext.FILTER_AUTOCOMPLETE;

        const { metricQuery, explore, fieldId } =
            await getFieldValuesMetricQuery({
                projectUuid,
                table,
                initialFieldId,
                search,
                limit,
                maxLimit: this.lightdashConfig.query.maxLimit,
                filters,
                exploreResolver: this.projectModel,
            });

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
        );

        const {
            sql,
            fields,
            missingParameterReferences,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            userAttributeOverrides,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });

        const requestParameters: ExecuteAsyncFieldValueSearchRequestParams = {
            context,
            table,
            fieldId: initialFieldId,
            search,
            limit,
            filters,
            forceRefresh,
            parameters: combinedParameters,
        };

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                metricQuery,
                projectUuid,
                explore,
                context,
                queryTags,
                invalidateCache: invalidateCache || forceRefresh,
                parameters: combinedParameters,
                fields,
                sql,
                originalColumns: undefined,
                missingParameterReferences,
                timezone: resolvedTimezone,
                displayTimezone,
                useTimezoneAwareDateTrunc,
                routingTarget: 'warehouse',
            },
            requestParameters,
        );

        this.analytics.track({
            event: 'field_value.search',
            userId: account.user.id,
            properties: {
                projectId: projectUuid,
                fieldId,
                searchCharCount: search.length,
                resultsCount: 0, // not known at execute time — tracked via query.executed
                searchLimit: limit,
            },
        });

        return {
            queryUuid,
            cacheMetadata,
        };
    }

    async executeAsyncSavedChartQuery({
        account,
        projectUuid,
        chartUuid,
        versionUuid,
        context,
        invalidateCache,
        limit,
        parameters,
        pivotResults,
    }: ExecuteAsyncSavedChartQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        // Check user is in organization
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
            { projectUuid },
        );
        const {
            uuid: savedChartUuid,
            organizationUuid: savedChartOrganizationUuid,
            projectUuid: savedChartProjectUuid,
            spaceUuid: savedChartSpaceUuid,
            tableName: savedChartTableName,
            metricQuery,
            parameters: savedChartParameters,
        } = savedChart;

        // Check chart belongs to project
        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Chart does not belong to project');
        }

        let access;
        let inheritsFromOrgOrProject;
        if (isJwtUser(account)) {
            if (!ProjectService.isChartEmbed(account)) {
                throw new ForbiddenError();
            }
            await this.permissionsService.checkEmbedPermissions(
                account,
                savedChart.uuid,
            );
            // We pass this access everytime, but we only define the ability
            // rule for this chart only if the JWT is type: 'chart'.
            // Dashboards won't have `access` defined in their abilityRules,
            // so this CASL check will pass for them.
            // TODO: Get all chartUuids for a given dashboard in the middleware.
            //       https://linear.app/lightdash/issue/CENG-110/front-load-available-charts-for-dashboard-requests
            access = [{ chartUuid: savedChart.uuid }];
            const spaceCtx =
                await this.spacePermissionService.getAllSpaceAccessContext(
                    savedChartSpaceUuid,
                );
            inheritsFromOrgOrProject = spaceCtx.inheritsFromOrgOrProject;
        } else {
            const ctx = await this.spacePermissionService.getSpaceAccessContext(
                account.user.id,
                savedChartSpaceUuid,
            );
            access = ctx.access;
            inheritsFromOrgOrProject = ctx.inheritsFromOrgOrProject;
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        savedChartUuid,
                        savedChartName: savedChart.name,
                    },
                }),
            ) ||
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                    exploreNames: [savedChartTableName],
                    metadata: {
                        savedChartUuid,
                        savedChartName: savedChart.name,
                        exploreName: savedChartTableName,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChartUuid,
            account.isRegisteredUser() ? account.user.id : null,
        );

        const requestParameters: ExecuteAsyncSavedChartRequestParams = {
            context,
            chartUuid,
            versionUuid,
            limit,
        };

        const metricQueryWithLimit = applyMetricQueryLimit(
            metricQuery,
            limit,
            this.lightdashConfig.query?.csvCellsLimit,
            this.lightdashConfig.query?.maxLimit,
        );

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: savedChartOrganizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            explore_name: savedChartTableName,
            query_context: context,
        };

        const explore = await this.getExplore(
            account,
            projectUuid,
            savedChartTableName,
            savedChartOrganizationUuid,
        );

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        // Combine default parameter values, saved chart parameters, and request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            savedChartParameters,
        );

        const { fields } = await this.getMetricQueryFields({
            metricQuery: metricQueryWithLimit,
            explore,
            warehouseSqlBuilder,
            projectUuid,
        });

        const pivotConfiguration = pivotResults
            ? derivePivotConfigurationFromChart(
                  savedChart,
                  metricQueryWithLimit,
                  fields,
              )
            : undefined;

        const {
            sql,
            fields: fieldsWithOverrides,
            warnings,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
            responseMetricQuery,
            userAccessControls,
            availableParameterDefinitions,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: metricQueryWithLimit,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });

        const routingDecision = this.getPreAggregationRoutingDecision({
            metricQuery: metricQueryWithLimit,
            explore,
            context,
            // TODO: allow per-chart preference to bypass pre-aggregate cache
            forceWarehouse: false,
        });

        if (routingDecision.preAggregateMetadata) {
            this.prometheusMetrics?.incrementPreAggregateMatch(
                routingDecision.preAggregateMetadata.hit,
                routingDecision.preAggregateMetadata.reason?.reason,
            );
            this.trackPreAggregateRoutingEvent({
                account,
                projectUuid,
                context,
                exploreName: explore.name,
                routingTarget: routingDecision.target,
                preAggregateMetadata: routingDecision.preAggregateMetadata,
                preAggregationRoute:
                    routingDecision.target === 'pre_aggregate'
                        ? routingDecision.route
                        : undefined,
                chartId: savedChart.uuid,
            });
        }

        this.recordPreAggregateStats({
            projectUuid,
            exploreName: explore.name,
            routingDecision,
            chartUuid: savedChart.uuid,
            dashboardUuid: null,
            queryContext: context,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                explore,
                context,
                queryTags,
                invalidateCache,
                metricQuery: metricQueryWithLimit,
                parameters: combinedParameters,
                fields: fieldsWithOverrides,
                sql,
                originalColumns: undefined,
                missingParameterReferences,
                timezone: resolvedTimezone,
                displayTimezone,
                useTimezoneAwareDateTrunc,
                pivotConfiguration,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
                    userAccessControls,
                    availableParameterDefinitions,
                }),
            },
            requestParameters,
        );

        return {
            queryUuid,
            cacheMetadata: {
                ...cacheMetadata,
                preAggregate: routingDecision.preAggregateMetadata,
            },
            metricQuery: responseMetricQuery,
            fields: fieldsWithOverrides,
            warnings,
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: displayTimezone,
        };
    }

    private async checkDashboardChartQueryPermissions(
        account: Account,
        projectUuid: string,
        savedChartUuid: string,
        space: SpaceSummaryBase,
    ) {
        const auditedAbility = this.createAuditedAbility(account);
        if (isJwtUser(account)) {
            await this.permissionsService.checkEmbedPermissions(
                account,
                savedChartUuid,
            );
        } else {
            const ctx = await this.spacePermissionService.getSpaceAccessContext(
                account.user.id,
                space.uuid,
            );

            if (
                auditedAbility.cannot(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: space.organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
                        access: ctx.access,
                        metadata: { savedChartUuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    metadata: { savedChartUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async executeAsyncDashboardChartQuery({
        account,
        projectUuid,
        tileUuid,
        chartUuid,
        dashboardUuid,
        dashboardFilters,
        dashboardSorts,
        dateZoom,
        context,
        invalidateCache,
        limit,
        parameters,
        pivotResults,
    }: ExecuteAsyncDashboardChartQueryArgs): Promise<ApiExecuteAsyncDashboardChartQueryResults> {
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            undefined,
            { projectUuid },
        );
        const { organizationUuid, projectUuid: savedChartProjectUuid } =
            savedChart;

        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Chart does not belong to project');
        }

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        await this.checkDashboardChartQueryPermissions(
            account,
            projectUuid,
            savedChart.uuid,
            space,
        );

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            account.isRegisteredUser() ? account.user.id : null,
        );

        const { metricQuery: metricQueryWithFilters, appliedDashboardFilters } =
            applyDashboardFiltersForTile({
                tileUuid,
                metricQuery: savedChart.metricQuery,
                dashboardFilters,
                explore,
            });

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...metricQueryWithFilters,
            sorts:
                dashboardSorts && dashboardSorts.length > 0
                    ? dashboardSorts
                    : savedChart.metricQuery.sorts,
        };

        const metricQueryWithLimit = applyMetricQueryLimit(
            metricQueryWithDashboardOverrides,
            limit,
            this.lightdashConfig.query?.csvCellsLimit,
            this.lightdashConfig.query?.maxLimit,
        );

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
            tileUuid,
            chartUuid,
            context,
            dashboardUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoom,
            limit,
        };

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const dashboardParameters = getDashboardParametersValuesMap(dashboard);

        // Combine default parameter values, dashboard parameters, and request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            dashboardParameters,
        );

        const { fields, dateZoomApplied } = await this.getMetricQueryFields({
            metricQuery: metricQueryWithLimit,
            explore,
            warehouseSqlBuilder,
            projectUuid,
            dateZoom,
        });

        const pivotConfiguration = pivotResults
            ? derivePivotConfigurationFromChart(
                  savedChart,
                  metricQueryWithLimit,
                  fields,
              )
            : undefined;

        const {
            sql,
            fields: fieldsWithOverrides,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
            responseMetricQuery,
            userAccessControls,
            availableParameterDefinitions,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: metricQueryWithLimit,
            explore,
            dateZoom,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });

        const routingDecision = this.getPreAggregationRoutingDecision({
            metricQuery: metricQueryWithLimit,
            explore,
            context,
            // TODO: allow dashboard-level option to bypass pre-aggregate cache
            forceWarehouse: false,
        });

        if (routingDecision.preAggregateMetadata) {
            this.prometheusMetrics?.incrementPreAggregateMatch(
                routingDecision.preAggregateMetadata.hit,
                routingDecision.preAggregateMetadata.reason?.reason,
            );
            this.trackPreAggregateRoutingEvent({
                account,
                projectUuid,
                context,
                exploreName: explore.name,
                routingTarget: routingDecision.target,
                preAggregateMetadata: routingDecision.preAggregateMetadata,
                preAggregationRoute:
                    routingDecision.target === 'pre_aggregate'
                        ? routingDecision.route
                        : undefined,
                chartId: savedChart.uuid,
                dashboardId: dashboardUuid,
            });
        }

        this.recordPreAggregateStats({
            projectUuid,
            exploreName: explore.name,
            routingDecision,
            chartUuid: savedChart.uuid,
            dashboardUuid,
            queryContext: context,
        });

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                explore,
                metricQuery: metricQueryWithLimit,
                context,
                queryTags,
                invalidateCache,
                dateZoom,
                parameters: combinedParameters,
                fields: fieldsWithOverrides,
                sql,
                originalColumns: undefined,
                missingParameterReferences,
                timezone: resolvedTimezone,
                displayTimezone,
                useTimezoneAwareDateTrunc,
                pivotConfiguration,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
                    userAccessControls,
                    availableParameterDefinitions,
                }),
            },
            requestParameters,
        );

        return {
            queryUuid,
            cacheMetadata: {
                ...cacheMetadata,
                preAggregate: routingDecision.preAggregateMetadata,
            },
            appliedDashboardFilters,
            metricQuery: responseMetricQuery,
            fields: fieldsWithOverrides,
            parameterReferences,
            usedParametersValues: usedParameters,
            dateZoomApplied,
            resolvedTimezone: displayTimezone,
        };
    }

    async executeAsyncUnderlyingDataQuery({
        account,
        projectUuid,
        underlyingDataSourceQueryUuid,
        filters,
        underlyingDataItemId,
        context,
        invalidateCache,
        dateZoom,
        limit,
        parameters,
        sorts,
    }: ExecuteAsyncUnderlyingDataQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('UnderlyingData', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const { metricQuery, fields: metricQueryFields } =
            await this.queryHistoryModel.get(
                underlyingDataSourceQueryUuid,
                projectUuid,
                account,
            );

        const { exploreName } = metricQuery;

        const explore = await this.getExplore(
            account,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        // Combine parameters early so we can filter dimensions by parameter availability
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
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

        const baseTableDefault =
            explore.tables[explore.baseTable]?.defaultShowUnderlyingValues;

        const effectiveShowUnderlyingValues =
            itemShowUnderlyingValues ?? baseTableDefault;

        // When using the base table default, scope unqualified names to the base table
        let effectiveShowUnderlyingTable: string | undefined;
        if (itemShowUnderlyingValues !== undefined) {
            effectiveShowUnderlyingTable = isField(underlyingDataItem)
                ? underlyingDataItem.table
                : undefined;
        } else if (baseTableDefault !== undefined) {
            effectiveShowUnderlyingTable = explore.baseTable;
        }

        const hasMissingParameters = (
            field:
                | CompiledDimension
                | CompiledCustomSqlDimension
                | CompiledMetric,
        ) =>
            field.parameterReferences?.some(
                (paramRef) => !combinedParameters[paramRef],
            ) ?? false;

        // Compile custom sql dimensions early so we can filter dimensions by parameter availability
        const compiler = new ExploreCompiler(warehouseSqlBuilder);
        const availableCustomDimensions =
            metricQuery.customDimensions?.reduce<CompiledCustomSqlDimension[]>(
                (acc, dimension) => {
                    try {
                        const compiledCustomDimension =
                            compiler.compileCustomDimension(
                                dimension,
                                explore.tables,
                                Object.keys(combinedParameters),
                            );

                        if (
                            !isCustomBinDimension(compiledCustomDimension) &&
                            !hasMissingParameters(compiledCustomDimension)
                        ) {
                            acc.push(compiledCustomDimension);
                        }
                    } catch (error) {
                        // when custom sql dimension has missing parameters it will fail compilation and we will ignore it
                        // no-op
                    }

                    return acc;
                },
                [],
            ) || [];

        const allDimensions = [
            ...availableCustomDimensions,
            ...getDimensionsWithValidParameters(explore, combinedParameters),
        ];

        const isValidNonCustomDimension = (
            dimension: CustomDimension | CompiledDimension,
        ) => !isCustomDimension(dimension) && !dimension.hidden;

        let validDimensionsCount = 0;
        const availableDimensions = allDimensions.filter((dimension) => {
            const isValid =
                availableTables.has(dimension.table) &&
                (isValidNonCustomDimension(dimension) ||
                    isCustomDimension(dimension));
            const hasExplicitColumnList =
                effectiveShowUnderlyingValues !== undefined;
            const isInExplicitColumnList =
                hasExplicitColumnList &&
                ((effectiveShowUnderlyingValues.includes(dimension.name) &&
                    effectiveShowUnderlyingTable === dimension.table) ||
                    effectiveShowUnderlyingValues.includes(
                        `${dimension.table}.${dimension.name}`,
                    ));

            if (isValid) {
                if (hasExplicitColumnList) {
                    return isInExplicitColumnList;
                }

                validDimensionsCount += 1;
                // If there is no explicit column list, we can show up to 50 dimensions
                return validDimensionsCount <= 50;
            }
            return false;
        });

        const availableMetrics = getMetricsWithValidParameters(
            explore,
            combinedParameters,
        ).filter((metric) => {
            const isValid = availableTables.has(metric.table) && !metric.hidden;
            const hasExplicitColumnList =
                effectiveShowUnderlyingValues !== undefined;
            const isInExplicitColumnList =
                hasExplicitColumnList &&
                ((effectiveShowUnderlyingValues?.includes(metric.name) &&
                    effectiveShowUnderlyingTable === metric.table) ||
                    effectiveShowUnderlyingValues?.includes(
                        `${metric.table}.${metric.name}`,
                    ));
            if (isValid) {
                // If there is no explicit column list, we DON'T show all metrics
                return hasExplicitColumnList ? isInExplicitColumnList : false;
            }
            return false;
        });

        const requestParameters: ExecuteAsyncUnderlyingDataRequestParams = {
            context,
            underlyingDataSourceQueryUuid,
            filters,
            underlyingDataItemId,
            sorts,
        };

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: exploreName,
            query_context: context,
        };

        const underlyingDataMetricQuery: MetricQuery = {
            exploreName,
            dimensions: availableDimensions.map(getItemId),
            customDimensions: availableCustomDimensions,
            filters,
            metrics: availableMetrics.map(getItemId),
            sorts: sorts ?? [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            timezone: metricQuery.timezone,
        };

        const underlyingDataMetricQueryWithLimit = applyMetricQueryLimit(
            underlyingDataMetricQuery,
            limit,
            this.lightdashConfig.query?.csvCellsLimit,
            this.lightdashConfig.query?.maxLimit,
        );

        const {
            sql,
            fields,
            warnings,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
            responseMetricQuery,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: underlyingDataMetricQueryWithLimit,
            explore,
            dateZoom,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });

        const { queryUuid: underlyingDataQueryUuid, cacheMetadata } =
            await this.executeAsyncQuery(
                {
                    account,
                    metricQuery: underlyingDataMetricQueryWithLimit,
                    projectUuid,
                    explore,
                    context,
                    queryTags,
                    invalidateCache,
                    dateZoom,
                    fields,
                    sql,
                    originalColumns: undefined,
                    missingParameterReferences,
                    timezone: resolvedTimezone,
                    displayTimezone,
                    useTimezoneAwareDateTrunc,
                },
                requestParameters,
            );

        return {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: responseMetricQuery,
            fields,
            warnings,
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: displayTimezone,
        };
    }

    async executeAsyncSqlQuery({
        account,
        projectUuid,
        sql,
        context,
        invalidateCache,
        pivotConfiguration,
        limit,
        parameters,
    }: ExecuteAsyncSqlQueryArgs): Promise<ApiExecuteAsyncSqlQueryResults> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        // Combine default parameter values with request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            parameters,
        );

        const {
            warehouseConnection,
            queryTags,
            metricQuery,
            virtualView,
            sql: sqlWithParams,
            originalColumns,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
        } = await this.prepareSqlChartAsyncQueryArgs({
            account,
            context,
            projectUuid,
            organizationUuid,
            sql,
            limit,
            parameters: combinedParameters,
        });

        // Disconnect the ssh tunnel to avoid leaking connections, another client is created in the scheduler task
        await warehouseConnection.sshTunnel.disconnect();

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql: sqlWithParams,
                originalColumns,
                missingParameterReferences,
                pivotConfiguration,
                displayTimezone: null,
                useTimezoneAwareDateTrunc: false,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
        );

        return {
            queryUuid,
            cacheMetadata,
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: null,
        };
    }

    private async prepareSqlChartAsyncQueryArgs({
        account,
        projectUuid,
        organizationUuid,
        sql,
        config,
        context,
        dashboardFilters,
        dashboardSorts,
        limit,
        tileUuid,
        parameters,
        chartUuid,
        dashboardUuid,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        sql: string;
        config?: SqlChart['config'];
        context: QueryExecutionContext;
        dashboardFilters?: ExecuteAsyncDashboardSqlChartArgs['dashboardFilters'];
        dashboardSorts?: ExecuteAsyncDashboardSqlChartArgs['dashboardSorts'];
        limit?: number;
        tileUuid?: string;
        parameters?: ParametersValuesMap;
        chartUuid?: string;
        dashboardUuid?: string;
    }) {
        const startTime = performance.now();

        // 1. Warehouse Client & Credentials
        const sectionStartWarehouse = performance.now();
        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
        );

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
            ...(chartUuid ? { chart_uuid: chartUuid } : {}),
            ...(dashboardUuid ? { dashboard_uuid: dashboardUuid } : {}),
        };
        const durationWarehouse = performance.now() - sectionStartWarehouse;

        // 2. User Attributes
        const sectionStartUserAttributes = performance.now();
        // Get user attributes for replacement
        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ account });
        const durationUserAttributes =
            performance.now() - sectionStartUserAttributes;

        // 3. Column Discovery
        const sectionStartColumnDiscovery = performance.now();
        // Get one row to get the column definitions
        const columns: { name: string; type: DimensionType }[] = [];

        // Replace user attributes first
        const sqlWithUserAttributes = replaceUserAttributesAsStrings(
            sql,
            intrinsicUserAttributes,
            userAttributes,
            warehouseConnection.warehouseClient,
            { noWrap: true },
        );

        // Then replace parameters in SQL before running column discovery query
        const { replacedSql: columnDiscoverySql } =
            safeReplaceParametersWithSqlBuilder(
                sqlWithUserAttributes,
                parameters ?? {},
                warehouseConnection.warehouseClient,
            );

        await warehouseConnection.warehouseClient.streamQuery(
            applyLimitToSqlQuery({ sqlQuery: columnDiscoverySql, limit: 1 }),
            (chunk) => {
                // Only handle the first call
                if (columns.length === 0 && chunk.fields) {
                    Object.keys(chunk.fields).forEach((key) => {
                        columns.push({
                            name: key,
                            type: chunk.fields[key].type,
                        });
                    });
                }
            },
            {
                tags: queryTags,
            },
        );
        const durationColumnDiscovery =
            performance.now() - sectionStartColumnDiscovery;

        // 4. Query Building
        const sectionStartQueryBuilding = performance.now();
        // Convert to ResultColumns format for storing as original columns
        const originalColumns: ResultColumns = columns.reduce((acc, col) => {
            acc[col.name] = {
                reference: col.name,
                type: col.type,
            };
            return acc;
        }, {} as ResultColumns);

        // ! VizColumns, virtualView, dimensions and query are not needed for SQL queries since we pass just sql the to `executeAsyncQuery`
        // ! We keep them here for backwards compatibility until we remove them as a required argument
        const vizColumns = columns.map((col) => ({
            reference: col.name,
            type: col.type,
        }));

        const virtualView = createVirtualViewObject(
            SQL_QUERY_MOCK_EXPLORER_NAME,
            sqlWithUserAttributes,
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

        const fieldQuoteChar =
            warehouseConnection.warehouseClient.getFieldQuoteChar();

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

        // Create and return the SqlQueryBuilder instance
        const queryBuilder = new SqlQueryBuilder(
            {
                referenceMap,
                select: selectColumns,
                from: { name: 'sql_query', sql: sqlWithUserAttributes },
                filters: appliedDashboardFilters
                    ? {
                          id: uuidv4(),
                          and: appliedDashboardFilters.dimensions,
                      }
                    : undefined,
                parameters,
                limit,
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
                escapeString:
                    warehouseConnection.warehouseClient.escapeString.bind(
                        warehouseConnection.warehouseClient,
                    ),
            },
        );
        const durationQueryBuilding =
            performance.now() - sectionStartQueryBuilding;
        const sectionStartSqlGeneration = performance.now();
        const {
            sql: replacedSql,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
        } = queryBuilder.getSqlAndReferences();
        const durationSqlGeneration =
            performance.now() - sectionStartSqlGeneration;

        const totalTime = performance.now() - startTime;

        this.logger.info(
            `prepareSqlChartAsyncQueryArgs completed in ${totalTime.toFixed(
                2,
            )}`,
            {
                totalTimeMs: totalTime,
                sections: {
                    warehouseMs: durationWarehouse.toFixed(2),
                    userAttributesMs: durationUserAttributes.toFixed(2),
                    columnDiscoveryMs: durationColumnDiscovery.toFixed(2),
                    queryBuildingMs: durationQueryBuilding.toFixed(2),
                    sqlGenerationMs: durationSqlGeneration.toFixed(2),
                },
            },
        );

        return {
            metricQuery,
            pivotConfiguration,
            virtualView,
            queryTags,
            warehouseConnection,
            sql: replacedSql,
            parameterReferences: Array.from(parameterReferences),
            missingParameterReferences: Array.from(missingParameterReferences),
            appliedDashboardFilters,
            originalColumns,
            usedParameters,
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

        const { account, projectUuid, context, invalidateCache, limit } = args;

        await this.assertSavedChartAccess(account, 'view', sqlChart);

        // Combine default parameter values with request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            args.parameters,
        );

        const {
            warehouseConnection,
            queryTags,
            metricQuery,
            virtualView,
            pivotConfiguration,
            sql,
            originalColumns,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
        } = await this.prepareSqlChartAsyncQueryArgs({
            account,
            context,
            projectUuid: sqlChart.project.projectUuid,
            organizationUuid: sqlChart.organization.organizationUuid,
            sql: sqlChart.sql,
            config: sqlChart.config,
            limit: limit ?? sqlChart.limit,
            parameters: combinedParameters,
            chartUuid: sqlChart.savedSqlUuid,
        });

        // Disconnect the ssh tunnel to avoid leaking connections, another client is created in the scheduler task
        await warehouseConnection.sshTunnel.disconnect();

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql,
                originalColumns,
                missingParameterReferences,
                pivotConfiguration,
                displayTimezone: null,
                useTimezoneAwareDateTrunc: false,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
        );

        return {
            queryUuid,
            cacheMetadata,
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: null,
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
            account,
            projectUuid,
            tileUuid,
            dashboardUuid,
            context,
            invalidateCache,
            dashboardFilters,
            dashboardSorts,
            limit,
        } = args;

        await this.assertSavedChartAccess(account, 'view', savedChart);

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const dashboardParameters = getDashboardParametersValuesMap(dashboard);

        // Combine default parameter values, dashboard parameters, and request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            args.parameters,
            dashboardParameters,
        );

        const {
            warehouseConnection,
            queryTags,
            metricQuery,
            virtualView,
            pivotConfiguration,
            sql,
            appliedDashboardFilters,
            originalColumns,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
        } = await this.prepareSqlChartAsyncQueryArgs({
            account,
            context,
            projectUuid: savedChart.project.projectUuid,
            organizationUuid: savedChart.organization.organizationUuid,
            sql: savedChart.sql,
            config: savedChart.config,
            tileUuid,
            dashboardFilters,
            dashboardSorts,
            limit: limit ?? savedChart.limit,
            parameters: combinedParameters,
            chartUuid: savedChart.savedSqlUuid,
            dashboardUuid,
        });

        // Disconnect the ssh tunnel to avoid leaking connections, another client is created in the scheduler task
        await warehouseConnection.sshTunnel.disconnect();

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                explore: virtualView,
                queryTags,
                metricQuery,
                context,
                fields: getItemMap(virtualView),
                sql,
                originalColumns,
                missingParameterReferences,
                pivotConfiguration,
                displayTimezone: null,
                useTimezoneAwareDateTrunc: false,
            },
            {
                query: metricQuery,
                invalidateCache,
            },
        );

        return {
            queryUuid,
            cacheMetadata,
            appliedDashboardFilters: appliedDashboardFilters || {
                metrics: [],
                dimensions: [],
                tableCalculations: [],
            },
            parameterReferences,
            usedParametersValues: usedParameters,
            resolvedTimezone: null,
        };
    }

    /**
     * Poll for query completion with exponential backoff.
     * Throws on CANCELLED, ERROR, or timeout.
     */
    async pollForQueryCompletion({
        account,
        projectUuid,
        queryUuid,
        initialBackoffMs = 500,
        maxBackoffMs = 2000,
        timeoutMs = 5 * 60 * 1000, // 5 min default
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        initialBackoffMs?: number;
        maxBackoffMs?: number;
        timeoutMs?: number;
    }): Promise<void> {
        await this.queryHistoryModel.pollForQueryCompletion({
            queryUuid,
            account,
            projectUuid,
            initialBackoffMs,
            maxBackoffMs,
            timeoutMs,
        });
    }

    /**
     * Execute metric query and wait for all results.
     * Returns raw rows from warehouse
     */
    async executeMetricQueryAndGetResults(
        args: ExecuteAsyncMetricQueryArgs,
        pollingOptions?: PollingOptions,
    ): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
    }> {
        const { account, projectUuid } = args;

        const { queryUuid, cacheMetadata, fields } =
            await this.executeAsyncMetricQuery(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });

        return this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });
    }

    private async getReadyQueryResults({
        account,
        projectUuid,
        queryUuid,
        cacheMetadata,
        fields,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
    }): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
    }> {
        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        const resultsStream = await this.getResultsStorageClientForContext(
            queryHistory.context,
        ).getDownloadStream(queryHistory.resultsFileName!);

        const rows: Record<string, unknown>[] = [];
        await streamJsonlData<void>({
            readStream: resultsStream,
            onRow: (rawRow) => {
                rows.push(rawRow);
            },
        });

        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid: queryHistory.projectUuid,
            organizationUuid: queryHistory.organizationUuid,
            userUuid:
                AsyncQueryService.getQueryHistoryActor(queryHistory).userUuid,
            metricQuery: queryHistory.metricQuery,
        });

        return {
            rows,
            cacheMetadata,
            fields,
            pivotDetails:
                AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory),
            displayTimezone,
        };
    }

    private static getCalculateTotalMetricQuery(
        metricQuery: MetricQuery,
    ): MetricQuery {
        const totalQuery: MetricQuery = {
            ...metricQuery,
            limit: 1,
            tableCalculations: [],
            sorts: [],
            dimensions: [],
            customDimensions: metricQuery.customDimensions,
            metrics: metricQuery.metrics,
            additionalMetrics: metricQuery.additionalMetrics,
        };

        const hasMetricFilters =
            !!totalQuery.filters.metrics &&
            flattenFilterGroup(totalQuery.filters.metrics).length > 0;
        const hasTableCalculationFilters =
            !!totalQuery.filters.tableCalculations &&
            flattenFilterGroup(totalQuery.filters.tableCalculations).length > 0;

        if (hasMetricFilters || hasTableCalculationFilters) {
            throw new NotSupportedError(
                'Totals cannot be correctly calculated with metric filters or table calculation filters',
            );
        }

        return totalQuery;
    }

    private async executeMetricQueryAndGetResultsForTotals({
        account,
        projectUuid,
        organizationUuid,
        metricQuery,
        explore,
        context,
        queryTags,
        parameters,
        dateZoom,
        invalidateCache,
        userAccessControls,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
        queryTags: RunQueryTags & {
            embed?: string;
            external_id?: string;
            chart_uuid?: string;
            dashboard_uuid?: string;
        };
        parameters?: ParametersValuesMap;
        dateZoom?: ExecuteAsyncMetricQueryArgs['dateZoom'];
        invalidateCache?: boolean;
        userAccessControls?: UserAccessControls;
    }): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    }> {
        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const {
            sql,
            fields,
            missingParameterReferences,
            userAccessControls: resolvedUserAccessControls,
            availableParameterDefinitions,
            resolvedTimezone,
            displayTimezone,
            useTimezoneAwareDateTrunc,
        } = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            dateZoom,
            explore,
            warehouseSqlBuilder,
            parameters,
            projectUuid,
            materializationRole: userAccessControls,
            columnTimezone: getColumnTimezone(warehouseCredentials),
        });

        const routingDecision = this.getPreAggregationRoutingDecision({
            metricQuery,
            explore,
            context,
            forceWarehouse: false,
        });

        if (routingDecision.preAggregateMetadata) {
            this.prometheusMetrics?.incrementPreAggregateMatch(
                routingDecision.preAggregateMetadata.hit,
                routingDecision.preAggregateMetadata.reason?.reason,
            );
        }

        const { queryUuid, cacheMetadata } =
            await this.executePreparedAsyncQuery(
                {
                    account,
                    projectUuid,
                    explore,
                    metricQuery,
                    context,
                    queryTags,
                    invalidateCache,
                    dateZoom,
                    parameters,
                    fields,
                    sql,
                    originalColumns: undefined,
                    missingParameterReferences,
                    timezone: resolvedTimezone,
                    displayTimezone,
                    useTimezoneAwareDateTrunc,
                    routingTarget: routingDecision.target,
                    ...(routingDecision.target === 'pre_aggregate' && {
                        preAggregationRoute: routingDecision.route,
                        userAccessControls: resolvedUserAccessControls,
                        availableParameterDefinitions,
                    }),
                },
                {
                    context,
                    query: metricQuery,
                    parameters,
                },
                organizationUuid,
            );

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
        });

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        if (!queryHistory.resultsFileName) {
            // Some self-hosted installs disable results-file storage, so the
            // async query still completes but there is no file to download.
            const { rows } = await this.getResultsPageFromWarehouse(
                account,
                queryHistory,
                1,
                Math.max(queryHistory.totalRowCount ?? 0, 1),
                (row) => row as ResultRow,
            );

            return {
                rows,
                cacheMetadata,
                fields,
                pivotDetails:
                    AsyncQueryService.getPivotDetailsFromQueryHistory(
                        queryHistory,
                    ),
            };
        }

        return this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });
    }

    /**
     * Execute saved chart query and wait for all results.
     * Returns raw rows from warehouse with pivot details.
     */
    async executeSavedChartQueryAndGetResults(
        args: ExecuteAsyncSavedChartQueryArgs,
        pollingOptions?: PollingOptions,
    ): Promise<{
        queryUuid: string;
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
    }> {
        const { account, projectUuid } = args;

        const { queryUuid, cacheMetadata, fields } =
            await this.executeAsyncSavedChartQuery(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });

        const ready = await this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });
        return { queryUuid, ...ready };
    }

    /**
     * Execute saved SQL chart query and wait for all results.
     * Uses the chart's visualization config to produce the pivoted/aggregated query.
     */
    async executeSqlChartQueryAndGetResults(
        args: ExecuteAsyncSqlChartArgs,
        pollingOptions?: PollingOptions,
    ): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
    }> {
        const { account, projectUuid } = args;

        const { queryUuid, cacheMetadata } =
            await this.executeAsyncSqlChartQuery(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        if (!queryHistory.resultsFileName) {
            throw new Error('Results file name not found for query');
        }

        const resultsStream = await this.getResultsStorageClientForContext(
            queryHistory.context,
        ).getDownloadStream(queryHistory.resultsFileName);

        const rows: Record<string, unknown>[] = [];
        await streamJsonlData<void>({
            readStream: resultsStream,
            onRow: (rawRow) => {
                rows.push(rawRow);
            },
        });

        return {
            rows,
            cacheMetadata,
        };
    }

    /**
     * Execute dashboard chart query and wait for all results.
     * Returns raw rows from warehouse with pivot details.
     */
    async executeDashboardChartQueryAndGetResults(
        args: ExecuteAsyncDashboardChartQueryArgs,
        pollingOptions?: PollingOptions,
    ): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
    }> {
        const { account, projectUuid } = args;

        const { queryUuid, cacheMetadata, fields } =
            await this.executeAsyncDashboardChartQuery(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });

        return this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });
    }

    async calculateMetricQueryTotal({
        account,
        projectUuid,
        organizationUuid,
        metricQuery,
        explore,
        context,
        queryTags,
        parameters,
        invalidateCache,
        userAccessControls,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
        queryTags: RunQueryTags & {
            embed?: string;
            external_id?: string;
            chart_uuid?: string;
            dashboard_uuid?: string;
        };
        parameters?: ParametersValuesMap;
        invalidateCache?: boolean;
        userAccessControls?: UserAccessControls;
    }): Promise<Record<string, unknown> | undefined> {
        const totalMetricQuery =
            AsyncQueryService.getCalculateTotalMetricQuery(metricQuery);

        const { rows } = await this.executeMetricQueryAndGetResultsForTotals({
            account,
            projectUuid,
            organizationUuid,
            metricQuery: totalMetricQuery,
            explore,
            context,
            queryTags,
            parameters,
            invalidateCache,
            userAccessControls,
        });

        return rows[0];
    }

    async calculateMetricQuerySubtotals({
        account,
        projectUuid,
        organizationUuid,
        metricQuery,
        explore,
        context,
        queryTags,
        columnOrder,
        pivotDimensions,
        parameters,
        dateZoom,
        invalidateCache,
        userAccessControls,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
        queryTags: RunQueryTags & {
            embed?: string;
            external_id?: string;
            chart_uuid?: string;
            dashboard_uuid?: string;
        };
        columnOrder: string[];
        pivotDimensions?: string[];
        parameters?: ParametersValuesMap;
        dateZoom?: ExecuteAsyncMetricQueryArgs['dateZoom'];
        invalidateCache?: boolean;
        userAccessControls?: UserAccessControls;
    }) {
        const { dimensionGroupsToSubtotal } =
            SubtotalsCalculator.prepareDimensionGroups(
                metricQuery,
                columnOrder,
                pivotDimensions,
            );

        const subtotalsPromises = dimensionGroupsToSubtotal.map<
            Promise<[string, Record<string, unknown>[]]>
        >(async (subtotalDimensions) => {
            let subtotals: Record<string, unknown>[] = [];

            try {
                const { metricQuery: subtotalMetricQuery } =
                    SubtotalsCalculator.createSubtotalQueryConfig(
                        metricQuery,
                        subtotalDimensions,
                        pivotDimensions,
                    );

                const { rows, fields } =
                    await this.executeMetricQueryAndGetResultsForTotals({
                        account,
                        projectUuid,
                        organizationUuid,
                        metricQuery: subtotalMetricQuery,
                        explore,
                        context,
                        queryTags,
                        parameters,
                        dateZoom,
                        invalidateCache,
                        userAccessControls,
                    });

                subtotals = formatRawRows(rows, fields);
            } catch (e) {
                this.logger.error(
                    `Error running subtotal query for dimensions ${subtotalDimensions.join(
                        ',',
                    )}`,
                );
            }

            return [
                SubtotalsCalculator.getSubtotalKey(subtotalDimensions),
                subtotals,
            ] satisfies [string, Record<string, unknown>[]];
        });

        const subtotalsEntries = await Promise.all(subtotalsPromises);
        return SubtotalsCalculator.formatSubtotalEntries(subtotalsEntries);
    }

    async calculateTotalFromSavedChart(
        account: Account,
        chartUuid: string,
        dashboardFilters?: DashboardFilters,
        invalidateCache: boolean = false,
        parameters?: ParametersValuesMap,
    ) {
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(chartUuid, undefined);
        const { organizationUuid, projectUuid } = savedChart;

        const explore = await this.getExplore(
            account,
            projectUuid,
            savedChart.tableName,
            organizationUuid,
        );
        const availableFieldIds = getAvailableFilterFieldIds(explore);

        const appliedDashboardFilters = dashboardFilters
            ? {
                  dimensions: getDashboardFilterRulesForTables(
                      availableFieldIds,
                      dashboardFilters.dimensions,
                  ),
                  metrics: getDashboardFilterRulesForTables(
                      availableFieldIds,
                      dashboardFilters.metrics,
                  ),
                  tableCalculations: getDashboardFilterRulesForTables(
                      availableFieldIds,
                      dashboardFilters.tableCalculations,
                  ),
              }
            : undefined;

        const metricQuery: MetricQuery = appliedDashboardFilters
            ? addDashboardFiltersToMetricQuery(
                  savedChart.metricQuery,
                  appliedDashboardFilters,
              )
            : savedChart.metricQuery;

        const spaceCtx =
            await this.spacePermissionService.getSpaceAccessContext(
                account.user.id,
                savedChart.spaceUuid,
            );

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    ...spaceCtx,
                    metadata: {
                        savedChartUuid: chartUuid,
                        savedChartName: savedChart.name,
                    },
                }),
            ) ||
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        savedChartUuid: chartUuid,
                        savedChartName: savedChart.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            savedChart.parameters,
        );

        try {
            return (await this.calculateMetricQueryTotal({
                account,
                projectUuid,
                organizationUuid: savedChart.organizationUuid,
                metricQuery,
                explore,
                context: QueryExecutionContext.CALCULATE_TOTAL,
                queryTags: {
                    ...this.getUserQueryTags(account),
                    organization_uuid: savedChart.organizationUuid,
                    project_uuid: projectUuid,
                    explore_name: explore.name,
                    query_context: QueryExecutionContext.CALCULATE_TOTAL,
                },
                parameters: combinedParameters,
                invalidateCache,
            })) as Record<string, number>;
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return {};
            }
            throw e;
        }
    }

    async calculateTotalFromQuery(
        account: Account,
        projectUuid: string,
        data: CalculateTotalFromQuery,
    ) {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        exploreName: data.explore,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.getExplore(
            account,
            projectUuid,
            data.explore,
            organizationUuid,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            data.parameters,
        );

        try {
            return (await this.calculateMetricQueryTotal({
                account,
                projectUuid,
                organizationUuid,
                metricQuery: data.metricQuery,
                explore,
                context: QueryExecutionContext.CALCULATE_TOTAL,
                queryTags: {
                    ...this.getUserQueryTags(account),
                    organization_uuid: account.organization.organizationUuid,
                    project_uuid: projectUuid,
                    explore_name: data.explore,
                    query_context: QueryExecutionContext.CALCULATE_TOTAL,
                },
                parameters: combinedParameters,
                invalidateCache: data.invalidateCache,
            })) as Record<string, number>;
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return {};
            }
            throw e;
        }
    }

    async calculateSubtotalsFromQuery(
        account: Account,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
    ) {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        exploreName: data.explore,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.getExplore(
            account,
            projectUuid,
            data.explore,
            organizationUuid,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            data.parameters,
        );

        const { dimensionGroupsToSubtotal, analyticsData } =
            SubtotalsCalculator.prepareDimensionGroups(
                data.metricQuery,
                data.columnOrder,
                data.pivotDimensions,
            );

        this.analytics.trackAccount(account, {
            event: 'query.subtotal',
            properties: {
                context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                organizationId: organizationUuid,
                projectId: projectUuid,
                exploreName: data.explore,
                ...analyticsData,
            },
        });

        if (dimensionGroupsToSubtotal.length === 0) {
            return {};
        }

        return this.calculateMetricQuerySubtotals({
            account,
            projectUuid,
            organizationUuid,
            metricQuery: data.metricQuery,
            explore,
            context: QueryExecutionContext.CALCULATE_SUBTOTAL,
            queryTags: {
                ...this.getUserQueryTags(account),
                organization_uuid: account.organization.organizationUuid,
                project_uuid: projectUuid,
                explore_name: data.explore,
                query_context: QueryExecutionContext.CALCULATE_SUBTOTAL,
            },
            columnOrder: data.columnOrder,
            pivotDimensions: data.pivotDimensions,
            parameters: combinedParameters,
            dateZoom: data.dateZoom,
            invalidateCache: data.invalidateCache,
        });
    }

    async getPreAggregateStats(
        account: Account,
        projectUuid: string,
        days: number = 3,
        paginateArgs?: KnexPaginateArgs,
        filters?: {
            exploreName?: string;
            queryType?: 'chart' | 'dashboard' | 'explorer';
        },
    ): Promise<KnexPaginatedData<ApiPreAggregateStatsResults>> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.preAggregateStrategy.getStats(
            projectUuid,
            days,
            paginateArgs,
            filters,
        );
    }

    async getDashboardPreAggregateAudit(
        account: Account,
        projectUuid: string,
        dashboardUuid: string,
        runtimeFilters?: DashboardFilters,
    ): Promise<DashboardPreAggregateAudit> {
        assertIsAccountWithOrg(account);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
            { projectUuid },
        );

        const auditedAbility = this.createAuditedAbility(account);
        if (auditedAbility.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError();
        }

        return this.preAggregateStrategy.auditDashboard({
            account,
            projectUuid,
            runtimeFilters,
            dashboard,
        });
    }
}
