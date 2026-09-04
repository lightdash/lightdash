import { subject } from '@casl/ability';
import {
    Account,
    addDashboardFiltersToMetricQuery,
    addFiltersToMetricQuery,
    AnonymousAccount,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    ApiPreAggregateStatsResults,
    applyDashboardFiltersForTile,
    assertIsAccountWithOrg,
    assertUnreachable,
    buildMergeQueryFromSaved,
    buildWarehouseColumnTotals,
    buildWarehouseRowTotals,
    CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    CompiledDimension,
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
    ExternalSourceScope,
    ExternalSourceStatus,
    FeatureFlags,
    FieldType,
    ForbiddenError,
    formatItemValue,
    formatMergeQueryRefusal,
    formatRawRows,
    formatRawValue,
    formatRow,
    formatRows,
    friendlyName,
    getAccountUserTimezone,
    getAvailableFilterFieldIds,
    getColumnTimezone,
    getDashboardFilterRulesForTables,
    getDateZoomFromRequestParameters,
    getDimensions,
    getDimensionsWithValidParameters,
    getErrorMessage,
    getFieldFormatOverrideProps,
    getFieldsFromMetricQuery,
    getItemId,
    getItemMap,
    getMetricOverridesWithPopInheritance,
    getMetrics,
    getMetricsWithValidParameters,
    getPivotValueColumnName,
    getUserAttributeQueryTags,
    hasReservedParameterReference,
    isCartesianChartConfig,
    isCustomBinDimension,
    isCustomDimension,
    isDateItem,
    isExploreError,
    isField,
    isJwtUser,
    isMergeMetricSource,
    isMergeResultSource,
    isMetric,
    isMetricSourcedMergeQuery,
    isValidTimezone,
    isVizTableConfig,
    ItemsMap,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashError,
    MergeQuery,
    MergeQueryErrorKind,
    MetricQuery,
    MissingConfigError,
    normalizeIndexColumns,
    NotFoundError,
    NotImplementedError,
    NotSupportedError,
    OrganizationAccessStatus,
    ParameterError,
    ParseError,
    PersistentDownloadFileAccessMode,
    PivotConfig,
    PivotConfiguration,
    ProjectType,
    QueryExecutionContext,
    QueryHistoryListFilters,
    QueryHistoryStatus,
    resolveQueryTimezone,
    ResultRow,
    ResultsExpiredError,
    S3Error,
    SchedulerFormat,
    SqlChart,
    SupportedDbtAdapter,
    TimeFrames,
    TrialExpiredError,
    UnexpectedServerError,
    UserAccessControls,
    WarehouseClient,
    WarehouseQueryError,
    WarehouseTypes,
    type ApiCompiledMergeQueryResults,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    type ApiExecuteAsyncFieldValueSearchResults,
    type ApiExecuteAsyncMergeQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiQueryHistoryListResponse,
    type CacheMetadata,
    type CalculateTotalKind,
    type CompiledCustomSqlDimension,
    type CompiledMetric,
    type CustomDimension,
    type ExecuteAsyncComposeMergeQueryRequestParams,
    type ExecuteAsyncComposeSqlQueryRequestParams,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncExternalSqlQueryRequestParams,
    type ExecuteAsyncFieldValueSearchRequestParams,
    type ExecuteAsyncMergeQueryRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type ExternalSourceTableReference,
    type MergeQueryChart,
    type Organization,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type PivotRowTotalsByIndex,
    type PivotValuesColumn,
    type PreAggregateFallbackReason,
    type Project,
    type QueryHistory,
    type ReadyQueryResultsPage,
    type ResultColumns,
    type RunQueryTags,
    type SavedChartDAO,
    type SessionUser,
    type SpaceSummaryBase,
    type UserAttributeValueMap,
    type WarehouseExecuteAsyncQuery,
    type WarehousePhaseTimings,
    type WarehouseResults,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { DuckdbWarehouseClient, SshTunnel } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { Readable, Writable } from 'stream';
import {
    DownloadCsv,
    type OnboardingFlow,
} from '../../analytics/LightdashAnalytics';
import { transformAndExportResults } from '../../clients/Aws/transformAndExportResults';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import type { INatsClient } from '../../clients/NatsClient';
import { createLocalParquetUploadStream } from '../../clients/ResultsFileStorageClients/LocalParquetUploadStream';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type DbExternalSourceTable } from '../../database/entities/externalSources';
import type { DbProjectParameter } from '../../database/entities/projectParameters';
import { isAgentScopedQueryContext } from '../../ee/services/ai/utils/scopedSqlContexts';
import {
    findSqlScopeViolations,
    formatSqlScopeError,
} from '../../ee/services/ai/utils/sqlScope';
import Logger from '../../logging/logger';
import { measureTime } from '../../logging/measureTime';
import { getAppContext, getSchedulerContext } from '../../logging/winston';
import { ContentDraftModel } from '../../models/ContentDraftModel';
import { DownloadAuditModel } from '../../models/DownloadAuditModel';
import {
    mapQueryHistoryRowToListItem,
    QueryHistoryModel,
} from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { compileMetricQuery } from '../../queryCompiler';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import { traceSpan } from '../../tracing/tracing';
import { wrapSentryTransaction } from '../../utils';
import { metricQueryWithLimit as applyMetricQueryLimit } from '../../utils/csvLimitUtils';
import {
    getDuckdbPreAggregateSqlTable,
    getJsonlSqlTable,
    quoteDuckdbIdentifier,
} from '../../utils/duckdb/duckdbSqlTables';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { sanitizeDuckdbError } from '../../utils/duckdb/sanitizeDuckdbError';
import {
    processFieldsForExport,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { buildComposeMergeSql } from '../../utils/QueryBuilder/composeMergeSql';
import { updateExploreWithDateZoom } from '../../utils/QueryBuilder/dateZoom';
import { getSqlBuilderForExplore } from '../../utils/QueryBuilder/getSqlBuilderForExplore';
import {
    buildMergeResultMetricQuery,
    MergeQueryComposer,
} from '../../utils/QueryBuilder/MergeQueryComposer';
import { consumeMergeResultMetadata } from '../../utils/QueryBuilder/mergeQueryResults';
import { safeReplaceParametersWithSqlBuilder } from '../../utils/QueryBuilder/parameters';
import { PivotQueryBuilder } from '../../utils/QueryBuilder/PivotQueryBuilder';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import {
    SQL_QUERY_MOCK_EXPLORER_NAME,
    SqlQueryComposer,
} from '../../utils/QueryBuilder/SqlQueryComposer';
import { TotalQueryBuilder } from '../../utils/QueryBuilder/TotalQueryBuilder';
import {
    applyLimitToSqlQuery,
    hasBlockingTotalFilters,
    replaceUserAttributesAsStrings,
} from '../../utils/QueryBuilder/utils';
import { splitJsonlStream } from '../../utils/streamUtils';
import { SubtotalsCalculator } from '../../utils/SubtotalsCalculator';
import type { ICacheService } from '../CacheService/ICacheService';
import { CreateCacheResult } from '../CacheService/types';
import { CsvService } from '../CsvService/CsvService';
import { ExcelService } from '../ExcelService/ExcelService';
import { OrganizationAccessService } from '../OrganizationAccessService/OrganizationAccessService';
import { resolveOrganizationExportLimits } from '../OrganizationSettingsService/resolveExportLimits';
import { PersistentDownloadFileService } from '../PersistentDownloadFileService/PersistentDownloadFileService';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import { getFieldValuesMetricQuery } from '../ProjectService/fieldValuesQueryBuilder';
import { convertDashboardParametersToValuesMap } from '../ProjectService/parameters';
import {
    ProjectService,
    type ProjectServiceArguments,
} from '../ProjectService/ProjectService';
import {
    getNextAndPreviousPage,
    validatePagination,
} from '../ProjectService/resultsPagination';
import { mergeDraftIntoChart } from '../SavedChartsService/chartDraftOverlay';
import {
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';
import { type ComposeEngineClient } from './ComposeEngineClient';
import { getValidatedDashboardSorts } from './dashboardSorts';
import { getPivotedColumns } from './getPivotedColumns';
import { getUnpivotedColumns } from './getUnpivotedColumns';
import {
    applyMergeExportLimit,
    buildComposeMergeOriginalColumns,
    buildMergeRowCapGuard,
    getMergeSourceLabels,
} from './mergeQueryExecution';
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
    type CommonAsyncQueryArgs,
    type DownloadAsyncQueryResultsArgs,
    type DuckdbQueryColumns,
    type DuckdbQueryReferences,
    type ExecuteAsyncComposeSqlQueryArgs,
    type ExecuteAsyncDashboardChartQueryArgs,
    type ExecuteAsyncDashboardSqlChartArgs,
    type ExecuteAsyncExternalSqlQueryArgs,
    type ExecuteAsyncFieldValueSearchArgs,
    type ExecuteAsyncMergeQueryArgs,
    type ExecuteAsyncMetricQueryArgs,
    type ExecuteAsyncQueryReturn,
    type ExecuteAsyncSavedChartQueryArgs,
    type ExecuteAsyncSqlChartArgs,
    type ExecuteAsyncUnderlyingDataQueryArgs,
    type GetAsyncQueryResultsArgs,
    type PollingOptions,
    type PreAggregateExecutionEngine,
    type PreAggregationRoute,
    type RunAsyncPreAggregateQueryArgs,
    type RunAsyncWarehouseQueryArgs,
    type RunDuckdbQueryArgs,
    type ScheduleDownloadAsyncQueryResultsArgs,
    type UnboundedRerunFromQueryHistoryResult,
} from './types';

type RunnableCompiledMergeQuery = ApiCompiledMergeQueryResults & {
    coreSql: string;
    typedColumns: NonNullable<ApiCompiledMergeQueryResults['typedColumns']>;
    terminalWrapper: NonNullable<
        ApiCompiledMergeQueryResults['terminalWrapper']
    >;
};

const isRunnableCompiledMergeQuery = (
    compiled: ApiCompiledMergeQueryResults,
): compiled is RunnableCompiledMergeQuery =>
    compiled.errors.length === 0 &&
    compiled.coreSql !== null &&
    compiled.typedColumns !== null &&
    compiled.terminalWrapper !== null;

/**
 * A compiled merge the compose engine can run: no errors and full metadata.
 * Unlike the warehouse-runnable narrowing it needs no statement — the
 * compose path builds its own join over the sources' materialized results.
 */
type ComposableCompiledMergeQuery = ApiCompiledMergeQueryResults & {
    typedColumns: NonNullable<ApiCompiledMergeQueryResults['typedColumns']>;
    columns: NonNullable<ApiCompiledMergeQueryResults['columns']>;
};

const isComposableCompiledMergeQuery = (
    compiled: ApiCompiledMergeQueryResults,
): compiled is ComposableCompiledMergeQuery =>
    compiled.errors.length === 0 &&
    compiled.typedColumns !== null &&
    compiled.columns !== null;

/** What a DuckDB query executes with once its columns are resolved. */
type DuckdbQueryExecution = {
    query: string;
    fieldsMap: ItemsMap;
    usedParameters: ParametersValuesMap | null;
    originalColumns: ResultColumns;
    pivotConfiguration: PivotConfiguration | undefined;
};

type ExecuteCompiledAsyncMergeQueryArgs = Omit<
    ExecuteAsyncMergeQueryArgs,
    'mode' | 'chart'
> & {
    organizationUuid: string;
    compiledMerge: RunnableCompiledMergeQuery;
    pivotConfiguration?: PivotConfiguration;
};

type ExecuteMergeQueryInternalArgs = Omit<
    ExecuteAsyncMergeQueryArgs,
    'chart'
> & {
    pivotInput?:
        | { type: 'chart'; chart: MergeQueryChart }
        | { type: 'resolved'; configuration: PivotConfiguration };
};

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
          preAggregateExecution: PreAggregateExecutionEngine;
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
          target: 'external_source';
          warehouseQuery: string;
          objectScope: string;
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
    contentDraftModel: ContentDraftModel;
    queryHistoryModel: QueryHistoryModel;
    downloadAuditModel: DownloadAuditModel;
    cacheService?: ICacheService;
    savedSqlModel: SavedSqlModel;
    resultsStorageClient: S3ResultsFileStorageClient;
    pivotTableService: PivotTableService;
    prometheusMetrics?: PrometheusMetrics;
    schedulerClient: SchedulerClient;
    natsClient: INatsClient;
    persistentDownloadFileService: PersistentDownloadFileService;
    organizationAccessService: OrganizationAccessService;
    composeEngineClient: ComposeEngineClient;
    preAggregateStrategy?: PreAggregateStrategy;
    /** EE resolver for external tables; absent in OSS. */
    externalSourceTableResolver?: (
        projectUuid: string,
        tableUuidOrName: ExternalSourceTableReference,
    ) => Promise<
        | (DbExternalSourceTable & {
              external_source_status: ExternalSourceStatus;
              external_source_scope: ExternalSourceScope | null;
              external_source_created_by_user_uuid: string | null;
          })
        | undefined
    >;
};

type ResolvedWarehouseCredentials = CreateWarehouseCredentials & {
    userWarehouseCredentialsUuid: string | undefined;
};

/**
 * Args for the async execute seam. Query/context data (explore, metric query,
 * fields, pivot, timezones, parameters, access controls) is read off the
 * composer — only orchestration inputs travel as args.
 */
type ExecuteAsyncQueryArgs = Pick<
    CommonAsyncQueryArgs,
    'account' | 'projectUuid' | 'invalidateCache' | 'context'
> & {
    queryTags: RunQueryTags;
    // Saved chart (metric or SQL) the query was executed from, for analytics attribution
    chart?: { uuid: string };
    // Single SQL seam: metric paths pass a QueryComposer, SQL-chart
    // paths a SqlQueryComposer — getSql() owns pivot wrapping for both.
    queryComposer: QueryComposer;
    originalColumns?: ResultColumns;
    routingTarget?: PreAggregationRoutingDecision['target'];
    preAggregationRoute?: PreAggregationRoute;
    warehouseCredentials: ResolvedWarehouseCredentials;
    // Preloaded org from the caller (e.g. saved chart) to skip a redundant getSummary
    organizationUuid?: string;
};

type PreparedAsyncQueryArgs = Omit<
    ExecuteAsyncQueryArgs,
    'organizationUuid'
> & {
    isPreviewProject: boolean;
};

export class AsyncQueryService extends ProjectService {
    private static sleep(ms: number, signal?: AbortSignal) {
        if (signal?.aborted) {
            throw new Error('Query polling request was aborted');
        }

        return new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line prefer-const -- assigned below; onAbort closure needs the binding first
            let timeout: ReturnType<typeof setTimeout>;
            const onAbort = () => {
                clearTimeout(timeout);
                reject(new Error('Query polling request was aborted'));
            };

            timeout = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    private async *streamQueryHistoryUntilDeadline({
        account,
        projectUuid,
        queryUuid,
        deadlineMs,
        pollIntervalMs,
        signal,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        deadlineMs: number;
        pollIntervalMs: number;
        signal?: AbortSignal;
    }): AsyncGenerator<QueryHistory> {
        const intervalMs = Math.max(1, pollIntervalMs);

        while (true) {
            // eslint-disable-next-line no-await-in-loop
            yield await this.getAsyncQueryHistory({
                account,
                projectUuid,
                queryUuid,
            });

            const remainingMs = deadlineMs - Date.now();
            if (remainingMs <= 0) return;

            // eslint-disable-next-line no-await-in-loop
            await AsyncQueryService.sleep(
                Math.min(intervalMs, remainingMs),
                signal,
            );
        }
    }

    contentDraftModel: ContentDraftModel;

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

    persistentDownloadFileService: PersistentDownloadFileService;

    private readonly organizationAccessService: OrganizationAccessService;

    private readonly composeEngineClient: ComposeEngineClient;

    protected readonly preAggregateStrategy: PreAggregateStrategy;

    private readonly externalSourceTableResolver: AsyncQueryServiceArguments['externalSourceTableResolver'];

    constructor(args: AsyncQueryServiceArguments) {
        super(args);
        this.contentDraftModel = args.contentDraftModel;
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
        this.persistentDownloadFileService = args.persistentDownloadFileService;
        this.organizationAccessService = args.organizationAccessService;
        this.composeEngineClient = args.composeEngineClient;
        this.preAggregateStrategy =
            args.preAggregateStrategy ?? new NoOpPreAggregateStrategy();
        this.externalSourceTableResolver = args.externalSourceTableResolver;
    }

    /**
     * Resolve the late-bound file reference for an external source explore:
     * the CTE that maps the explore's table name onto its ingested file, and
     * a cache-key salt carrying the ingest version (refreshes change results
     * without changing the SQL text).
     */
    private async resolveExternalSourceReference(
        projectUuid: string,
        explore: Explore,
        featureFlagContext: {
            userUuid: string;
            organizationUuid: string;
        },
    ): Promise<
        | { cte: string; cacheKeySalt: string; objectScope: string }
        | { error: string }
    > {
        const { enabled } = await this.featureFlagModel.get({
            user: featureFlagContext,
            featureFlagId: FeatureFlags.ExternalSources,
        });
        if (!enabled) {
            return { error: 'External sources are not enabled' };
        }
        const ref = explore.externalSource;
        if (!ref) {
            return {
                error: 'External source explore is missing its source reference',
            };
        }
        if (!this.externalSourceTableResolver) {
            return {
                error: 'External source queries need the enterprise DuckDB engine',
            };
        }
        const table = await this.externalSourceTableResolver(
            projectUuid,
            ref.tableUuid,
        );
        if (!table || !table.locator || !table.columns) {
            return {
                error: 'The external source table has no ingested data yet. Refresh the source and try again',
            };
        }
        if (table.external_source_status !== ExternalSourceStatus.READY) {
            return {
                error: 'The external source is not ready. Wait for its ingest to finish and try again',
            };
        }
        const cte = `${quoteDuckdbIdentifier(
            explore.baseTable,
        )} AS (SELECT * FROM ${getDuckdbPreAggregateSqlTable(
            table.locator,
            table.columns,
        )})`;
        return {
            cte,
            cacheKeySalt: `esv:${ref.tableUuid}:${table.version}`,
            objectScope: table.locator.uri,
        };
    }

    /**
     * External source queries always run on the DuckDB engine with the file
     * reference bound as a CTE. The compiled SQL can carry user-authored
     * fragments (custom metrics, table calculations), so file access is
     * re-validated before the server-built CTE is attached.
     */
    private static resolveExternalSourceExecutionPlan(
        query: string,
        reference:
            | { cte: string; cacheKeySalt: string; objectScope: string }
            | { error: string },
    ): AsyncQueryExecutionPlan {
        if ('error' in reference) {
            return { target: 'error', error: reference.error };
        }
        try {
            DuckdbWarehouseClient.validateUserSqlFileAccess(query);
        } catch (e) {
            return { target: 'error', error: getErrorMessage(e) };
        }
        return {
            target: 'external_source',
            warehouseQuery: AsyncQueryService.wrapSqlWithReferenceCtes(query, [
                reference.cte,
            ]),
            objectScope: reference.objectScope,
        };
    }

    /**
     * Execute an external source query on the shared DuckDB engine. The
     * wrapped SQL (file CTE attached) travels only here — the stored
     * compiled_sql keeps the plain query against the table name.
     */
    private async runExternalSourceQuery(
        warehouseArgs: RunAsyncWarehouseQueryArgs,
        account: Account,
        objectScope: string,
    ): Promise<void> {
        try {
            const warehouseClient =
                this.composeEngineClient.createExecutionWarehouseClient({
                    storage: 'externalSources',
                    scope: objectScope,
                });
            await this.runAsyncWarehouseQuery({
                ...warehouseArgs,
                warehouseClientOverride: warehouseClient,
                warehouseCredentialsTypeOverride:
                    warehouseClient.credentials.type,
            });
        } catch (e) {
            await this.queryHistoryModel.update(
                warehouseArgs.queryUuid,
                warehouseArgs.projectUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: sanitizeDuckdbError(e),
                    errored_at: new Date(),
                },
                account,
            );
        }
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
            savedSqlUuid: string;
            project: Pick<Project, 'projectUuid'>;
            organization: Pick<Organization, 'organizationUuid'>;
            space: Pick<SpaceSummaryBase, 'uuid'>;
        },
    ) {
        // JWT/embed identities stay on their existing space-scoped contract.
        // Direct user grants are only resolved for registered accounts.
        const ctx = await this.spacePermissionService.resolveAccess(
            account.user.id,
            isJwtUser(account)
                ? { type: 'space', spaceUuid: savedChart.space.uuid }
                : {
                      type: 'sqlChart',
                      savedSqlUuid: savedChart.savedSqlUuid,
                      spaceUuid: savedChart.space.uuid,
                  },
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
                    metadata: {
                        spaceUuid: savedChart.space.uuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError("You don't have access to this chart");
        }
    }

    private async assertSavedChartViewAccessForUser(
        user: SessionUser,
        savedChart: {
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
            savedChartUuid?: string;
            savedSqlUuid?: string;
        },
    ) {
        const ctx = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            { type: 'space', spaceUuid: savedChart.spaceUuid },
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: savedChart.organizationUuid,
                    projectUuid: savedChart.projectUuid,
                    inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
                    access: ctx.access,
                    metadata: {
                        spaceUuid: savedChart.spaceUuid,
                        savedChartUuid: savedChart.savedChartUuid,
                        savedSqlUuid: savedChart.savedSqlUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError("You don't have access to this chart");
        }
    }

    private async assertDashboardViewAccessForUser(
        user: SessionUser,
        dashboard: {
            uuid: string;
            name: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        },
    ) {
        const ctx = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            { type: 'space', spaceUuid: dashboard.spaceUuid },
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
                    access: ctx.access,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
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
    }): Promise<{ explore: Explore; userAccessControls: UserAccessControls }> {
        if (materializationRole === undefined) {
            return this.getExploreWithUserAccessControls(
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
            throw new NotFoundError(
                `Explore "${exploreName}" has an error: ${explore.errors
                    .map((error) => error.message)
                    .join(', ')}`,
            );
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
            return { explore, userAccessControls: materializationRole };
        }

        return {
            explore: getFilteredExplore(
                explore,
                materializationRole.userAttributes,
            ),
            userAccessControls: materializationRole,
        };
    }

    public async getCacheExpiresAt(
        projectUuid: string,
        baseDate: Date,
    ): Promise<Date> {
        const ttlSeconds =
            await this.projectModel.getEffectiveResultsCacheTtlSeconds(
                projectUuid,
            );
        return new Date(baseDate.getTime() + ttlSeconds * 1000);
    }

    async findResultsCache(
        projectUuid: string,
        cacheKey: string,
        account: Account,
        invalidateCache: boolean = false,
    ): Promise<CreateCacheResult> {
        if (!invalidateCache) {
            // CommercialCacheService gates internally on the
            // ResultsCacheEnabled feature flag (DB → env fallback).
            const existingCache =
                await this.cacheService?.findCachedResultsFile(
                    projectUuid,
                    cacheKey,
                    {
                        userUuid: account.user.id,
                        organizationUuid: account.organization.organizationUuid,
                        organizationName: account.organization.name,
                    },
                );
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

        const startLine = (page - 1) * pageSize;
        const endLine = startLine + pageSize;
        let nonEmptyLineCount = 0;

        for await (const line of splitJsonlStream(cacheStream)) {
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

        const valueColumnOrder = new Map(
            pivotConfiguration.valuesColumns.map((column, index) => [
                PivotQueryBuilder.getValueColumnFieldName(
                    column.reference,
                    column.aggregation,
                ),
                index,
            ]),
        );
        const getValueColumnOrder = (column: PivotValuesColumn) =>
            valueColumnOrder.get(
                PivotQueryBuilder.getValueColumnFieldName(
                    column.referenceField,
                    column.aggregation,
                ),
            ) ?? Number.MAX_SAFE_INTEGER;
        const sortedValuesColumns = Object.values(pivotValuesColumns).sort(
            (a, b) =>
                (a.columnIndex ?? 0) - (b.columnIndex ?? 0) ||
                getValueColumnOrder(a) - getValueColumnOrder(b),
        );

        return {
            valuesColumns: sortedValuesColumns,
            totalColumnCount: pivotTotalColumnCount,
            indexColumn: pivotConfiguration.indexColumn,
            groupByColumns: pivotConfiguration.groupByColumns,
            sortBy: pivotConfiguration.sortBy,
            originalColumns: originalColumns || {},
            ...(pivotConfiguration.passthroughDimensions &&
                pivotConfiguration.passthroughDimensions.length > 0 && {
                    passthroughDimensions:
                        pivotConfiguration.passthroughDimensions,
                }),
        };
    }

    /**
     * Lists the requesting user's own query history for a project, with
     * per-trigger and per-window counts for the list page's filters.
     */
    async getQueryHistoryList({
        account,
        projectUuid,
        filters,
        paginateArgs,
    }: {
        account: Account;
        projectUuid: string;
        filters: QueryHistoryListFilters;
        paginateArgs: KnexPaginateArgs;
    }): Promise<ApiQueryHistoryListResponse['results']> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        // History is scoped to the requesting user's own runs, so an
        // anonymous (embed) account has nothing to list.
        if (!account.isRegisteredUser()) {
            throw new ForbiddenError(
                'Query history is only available to registered users',
            );
        }

        const { enabled: isEndpointEnabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid,
            },
            featureFlagId: FeatureFlags.QueryHistory,
        });
        if (!isEndpointEnabled) {
            throw new ForbiddenError('Query history is not enabled');
        }

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

        const userUuid = account.user.id;
        const [{ data: rows, pagination }, counts] = await Promise.all([
            this.queryHistoryModel.findUserHistory(
                projectUuid,
                userUuid,
                filters,
                paginateArgs,
            ),
            this.queryHistoryModel.getUserHistoryCounts(
                projectUuid,
                userUuid,
                filters,
            ),
        ]);

        return {
            data: rows.map(mapQueryHistoryRowToListItem),
            pagination,
            counts: {
                ...counts,
                // The "All" tab ignores the trigger filter, so it sums the
                // per-trigger totals rather than the trigger-filtered windows.
                total: Object.values(counts.triggers).reduce(
                    (sum, count) => sum + count,
                    0,
                ),
            },
        };
    }

    /**
     * The access check for reading a query's results by uuid: the account
     * must be able to view the project, be the embed AI JWT creator of the
     * query, or be able to view the query's explore. Note the query history
     * row itself is already creator-scoped by QueryHistoryModel.get.
     */
    private throwIfCannotReadQueryHistory(
        account: Account,
        projectUuid: string,
        organizationUuid: string,
        queryHistory: QueryHistory,
    ): void {
        const { queryUuid } = queryHistory;
        const auditedAbility = this.createAuditedAbility(account);
        const canViewProject = auditedAbility.can(
            'view',
            subject('Project', {
                organizationUuid,
                projectUuid,
                metadata: { queryUuid },
            }),
        );

        const canReadEmbedAiQuery =
            isJwtUser(account) &&
            account.embedWriteContext?.canUseAiAgent === true &&
            queryHistory.context === QueryExecutionContext.AI &&
            queryHistory.createdByUserUuid === account.embedWriteUser?.userUuid;

        const isForbidden =
            !canReadEmbedAiQuery &&
            !canViewProject &&
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
    }

    async getAsyncQueryResults({
        account,
        projectUuid,
        queryUuid,
        page = 1,
        pageSize,
    }: GetAsyncQueryResultsArgs): Promise<ApiGetAsyncQueryResults> {
        assertIsAccountWithOrg(account);

        const [{ organizationUuid }, queryHistory] = await Promise.all([
            this.projectModel.getSummary(projectUuid),
            this.queryHistoryModel.get(queryUuid, projectUuid, account),
        ]);

        this.throwIfCannotReadQueryHistory(
            account,
            projectUuid,
            organizationUuid,
            queryHistory,
        );

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

        const displayTimezone = queryHistory.metricQuery.timezone ?? null;

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
                this.getResultsPageFromS3(
                    queryUuid,
                    resultsFileName,
                    queryHistory.context,
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
            // Display timezone the SQL was built with; mirrors the
            // execute response's resolvedTimezone.
            resolvedTimezone: displayTimezone,
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
                preAggregate: queryHistory.preAggregateExecution
                    ? {
                          execution: queryHistory.preAggregateExecution,
                          fallbackReason:
                              queryHistory.preAggregateFallbackReason,
                      }
                    : null,
            },
            status,
            pivotDetails:
                AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory),
        };
    }

    async getAsyncQueryHistory({
        account,
        projectUuid,
        queryUuid,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
    }): Promise<QueryHistory> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        const canViewProject = auditedAbility.can(
            'view',
            subject('Project', {
                organizationUuid,
                projectUuid,
                metadata: { queryUuid },
            }),
        );

        if (canViewProject) {
            return this.queryHistoryModel.get(queryUuid, projectUuid, account);
        }

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );

        if (
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
            )
        ) {
            throw new ForbiddenError();
        }

        return queryHistory;
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

    /**
     * Column totals for an export, keyed by field id. For a pivoted source this
     * is one total per rendered value column; for a plain table the
     * `calculate-total` query collapses to a single grand-total row, which is
     * exactly the footer the table chart shows. Returns undefined when the
     * totals query fails so the export still succeeds without them.
     */
    private async getExportColumnTotals({
        account,
        projectUuid,
        sourceQueryUuid,
    }: {
        account: Account;
        projectUuid: string;
        sourceQueryUuid: string;
    }): Promise<Record<string, number> | undefined> {
        try {
            const { rows, fields } =
                await this.executeCalculateTotalAndGetResults({
                    account,
                    projectUuid,
                    queryUuid: sourceQueryUuid,
                    kind: 'columnTotal',
                });
            return buildWarehouseColumnTotals(formatRows(rows, fields));
        } catch (error) {
            this.logger.warn('Failed to compute column totals for export', {
                projectUuid,
                sourceQueryUuid,
                error: getErrorMessage(error),
            });
            return undefined;
        }
    }

    /**
     * Pivot totals are exclusively warehouse-computed — the export renderer has
     * no client-side fallback, so without this they come out blank. Mirrors the
     * UI: re-run the source query collapsed across the pivot (`calculate-total`)
     * and key the results so the pivot worker can match each rendered cell. A
     * failed totals query (e.g. source can't be totalled) never fails the
     * export — that total is simply left blank, as it is in the UI.
     */
    private async getExportWarehouseTotals({
        account,
        projectUuid,
        sourceQueryUuid,
        pivotConfig,
        pivotDetails,
    }: {
        account: Account;
        projectUuid: string;
        sourceQueryUuid: string;
        pivotConfig: PivotConfig;
        pivotDetails: NonNullable<ReadyQueryResultsPage['pivotDetails']>;
    }): Promise<{
        warehouseRowTotals?: PivotRowTotalsByIndex;
        warehouseColumnTotals?: Record<string, number>;
        warehouseGrandTotals?: Record<string, number>;
    }> {
        let warehouseColumnTotals: Record<string, number> | undefined;
        let warehouseRowTotals: PivotRowTotalsByIndex | undefined;
        let warehouseGrandTotals: Record<string, number> | undefined;

        if (pivotConfig.columnTotals) {
            warehouseColumnTotals = await this.getExportColumnTotals({
                account,
                projectUuid,
                sourceQueryUuid,
            });
        }

        const { indexColumn } = pivotDetails;
        const indexFieldIds = indexColumn
            ? (Array.isArray(indexColumn) ? indexColumn : [indexColumn]).map(
                  (col) => col.reference,
              )
            : [];
        if (pivotConfig.rowTotals) {
            try {
                const { rows, fields } =
                    await this.executeCalculateTotalAndGetResults({
                        account,
                        projectUuid,
                        queryUuid: sourceQueryUuid,
                        kind: 'rowTotal',
                    });
                warehouseRowTotals = buildWarehouseRowTotals(
                    formatRows(rows, fields),
                    indexFieldIds,
                );
            } catch (error) {
                this.logger.warn(
                    'Failed to compute row totals for pivot export',
                    {
                        projectUuid,
                        sourceQueryUuid,
                        error: getErrorMessage(error),
                    },
                );
            }
        }

        if (pivotConfig.rowTotals && pivotConfig.columnTotals) {
            try {
                const { rows, fields } =
                    await this.executeCalculateTotalAndGetResults({
                        account,
                        projectUuid,
                        queryUuid: sourceQueryUuid,
                        kind: 'grandTotal',
                    });
                warehouseGrandTotals = buildWarehouseColumnTotals(
                    formatRows(rows, fields),
                );
            } catch (error) {
                this.logger.warn(
                    'Failed to compute grand totals for pivot export',
                    {
                        projectUuid,
                        sourceQueryUuid,
                        error: getErrorMessage(error),
                    },
                );
            }
        }

        return {
            warehouseRowTotals,
            warehouseColumnTotals,
            warehouseGrandTotals,
        };
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
        exportPivotedData = true,
        attachmentDownloadName,
        expirationSecondsOverride,
        conditionalFormattings,
        showColumnTotals = false,
        accessMode,
    }: DownloadAsyncQueryResultsArgs): Promise<DownloadAsyncQueryResultsInternal> {
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

        const displayTimezone = queryHistory.metricQuery.timezone ?? null;

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
                    `Failed to parse JSON from first line: ${getErrorMessage(error)}`,
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
        // Pivot structure (which dimension is pivoted, layout) comes from the
        // query's stored config so the export matches the rendered results;
        // pivotConfig only adds presentation (totals, hidden fields).
        const pivotDetails =
            AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory);
        const downloadPivotConfig: PivotConfig | undefined =
            exportPivotedData && pivotDetails
                ? {
                      pivotDimensions: (pivotDetails.groupByColumns ?? []).map(
                          (col) => col.reference,
                      ),
                      metricsAsRows:
                          queryHistory.pivotConfiguration?.metricsAsRows ??
                          false,
                      rowFieldIds: pivotConfig?.rowFieldIds,
                      columnOrder: validColumnOrder,
                      hiddenMetricFieldIds: pivotConfig?.hiddenMetricFieldIds,
                      hiddenDimensionFieldIds:
                          pivotConfig?.hiddenDimensionFieldIds,
                      visibleMetricFieldIds: pivotConfig?.visibleMetricFieldIds,
                      rowTotals: pivotConfig?.rowTotals,
                      columnTotals: pivotConfig?.columnTotals,
                  }
                : undefined;

        // Warehouse-computed totals for the pivot export — without these the
        // renderer leaves total cells blank (no client-side fallback).
        const {
            warehouseRowTotals,
            warehouseColumnTotals,
            warehouseGrandTotals,
        } =
            downloadPivotConfig &&
            pivotDetails &&
            (downloadPivotConfig.rowTotals || downloadPivotConfig.columnTotals)
                ? await this.getExportWarehouseTotals({
                      account,
                      projectUuid,
                      sourceQueryUuid: queryUuid,
                      pivotConfig: downloadPivotConfig,
                      pivotDetails,
                  })
                : {
                      warehouseRowTotals: undefined,
                      warehouseColumnTotals: undefined,
                      warehouseGrandTotals: undefined,
                  };

        switch (type) {
            case DownloadFileType.CSV:
                // Check if this is a pivot table download
                if (
                    downloadPivotConfig &&
                    pivotDetails &&
                    queryHistory.metricQuery
                ) {
                    return this.pivotTableService.downloadAsyncPivotTableCsv({
                        resultsFileName,
                        fields,
                        metricQuery: queryHistory.metricQuery,
                        projectUuid,
                        storageClient: resultsStorageClient,
                        pivotDetails,
                        warehouseRowTotals,
                        warehouseColumnTotals,
                        warehouseGrandTotals,
                        options: {
                            onlyRaw,
                            showTableNames,
                            customLabels,
                            columnOrder: validColumnOrder,
                            hiddenFields,
                            pivotConfig: downloadPivotConfig,
                            attachmentDownloadName,
                        },
                        organizationUuid,
                        createdByUserUuid: isJwtUser(account)
                            ? null
                            : account.user.userUuid,
                        accessMode,
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
                        pivotConfig: downloadPivotConfig,
                    },
                    attachmentDownloadName,
                    {
                        organizationUuid,
                        projectUuid,
                        createdByUserUuid: isJwtUser(account)
                            ? null
                            : account.user.userUuid,
                        accessMode,
                        fileType: DownloadFileType.CSV,
                        expirationSecondsOverride,
                    },
                    displayTimezone ?? undefined,
                );
            case DownloadFileType.XLSX: {
                // Check if this is a pivot table download
                const isPivotXlsx =
                    downloadPivotConfig &&
                    pivotDetails &&
                    queryHistory.metricQuery;

                // Conditional formatting fills are only applied to the
                // (unpivoted) direct export. Pivoted exports remap value
                // columns and are not yet supported — log rather than fail.
                if (isPivotXlsx && conditionalFormattings?.length) {
                    this.logger.warn(
                        'Conditional formatting is not applied to pivoted XLSX exports',
                        { queryUuid },
                    );
                }

                const xlsxResult = isPivotXlsx
                    ? await ExcelService.downloadAsyncPivotTableXlsx({
                          resultsFileName,
                          fields,
                          resultsStorageClient,
                          exportsStorageClient: this.exportsStorageClient,
                          lightdashConfig: this.lightdashConfig,
                          csvCellsLimit: (
                              await resolveOrganizationExportLimits(
                                  this.organizationSettingsModel,
                                  this.lightdashConfig.query,
                                  organizationUuid,
                              )
                          ).csvCellsLimit,
                          pivotDetails,
                          warehouseRowTotals,
                          warehouseColumnTotals,
                          warehouseGrandTotals,
                          options: {
                              onlyRaw,
                              showTableNames,
                              customLabels,
                              columnOrder: validColumnOrder,
                              hiddenFields,
                              pivotConfig: downloadPivotConfig,
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
                              exportsStorageClient: this.exportsStorageClient,
                          },
                          {
                              onlyRaw,
                              showTableNames,
                              customLabels,
                              columnOrder: validColumnOrder,
                              hiddenFields,
                              attachmentDownloadName,
                              conditionalFormattings,
                              columnTotals: showColumnTotals
                                  ? await this.getExportColumnTotals({
                                        account,
                                        projectUuid,
                                        sourceQueryUuid: queryUuid,
                                    })
                                  : undefined,
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
                            accessMode,
                            expirationSeconds: expirationSecondsOverride,
                            source: 'async_query',
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
            accessMode: Exclude<
                PersistentDownloadFileAccessMode,
                PersistentDownloadFileAccessMode.LEGACY_PUBLIC
            >;
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
                    accessMode: persistentUrlContext.accessMode,
                    expirationSeconds:
                        persistentUrlContext.expirationSecondsOverride,
                    source: 'async_query',
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
        usedParameters,
        dataTimezone,
        displayTimezone,
    }: {
        warehouseClient: WarehouseClient;
        query: string;
        queryTags: RunQueryTags & { query_uuid?: string };
        write?: (rows: Record<string, unknown>[]) => void | Promise<void>;
        pivotConfiguration?: PivotConfiguration;
        itemsMap: ItemsMap;
        usedParameters?: ParametersValuesMap | null;
        dataTimezone?: string;
        displayTimezone: string | null;
    }): Promise<{
        columns: ResultColumns;
        /** Pre-pivot columns, so pivoted queries keep a record of the
         *  original result shape (original_columns). */
        unpivotedColumns: ResultColumns;
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

        // Passthrough dims should be 1-to-1 with the visible row/pivot dims —
        // they ride along through `group_by_query` GROUP BY but are not in
        // row_ranking, so multiple warehouse rows with the same row_index
        // can carry conflicting passthrough values. We keep the first one
        // (deterministic by warehouse row order) and remember which dims
        // had conflicts for a debug log — useful when devs investigate
        // "wrong image showing in pivot" reports.
        const passthroughCardinalityViolations = new Set<string>();

        const transformRows = pivotConfiguration
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
                      itemsMap,
                      usedParameters,
                  );

                  const {
                      indexColumn,
                      valuesColumns,
                      groupByColumns,
                      passthroughDimensions,
                  } = pivotConfiguration;

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
                      pivotTotalRows += rows.length;
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

                      // Carry passthrough dim values onto the row so that
                      // cross-field richText / image templates can resolve
                      // `row.<table>.<field>.raw` even when the field's own
                      // column is hidden from the rendered pivot. The first
                      // warehouse row for a row_index wins. Run on EVERY
                      // warehouse row (not just on row_index change) so we
                      // can detect cardinality violations: if a later row
                      // with the same row_index carries a different value
                      // for the same passthrough dim, the dim isn't
                      // 1-to-1 with the visible row/pivot dims.
                      if (passthroughDimensions && currentTransformedRow) {
                          for (const dim of passthroughDimensions) {
                              const incoming = row[dim.reference];
                              const existing =
                                  currentTransformedRow[dim.reference];
                              if (incoming === undefined) {
                                  // Warehouse row missing the field — nothing
                                  // to merge. Existing value (if any) wins.
                              } else if (existing === undefined) {
                                  currentTransformedRow[dim.reference] =
                                      incoming;
                              } else if (
                                  !passthroughCardinalityViolations.has(
                                      dim.reference,
                                  )
                              ) {
                                  // Compare raw values to handle the
                                  // `{value: {raw, formatted}}` envelope and
                                  // bare-value warehouse shapes. Normalise via
                                  // JSON.stringify so object-typed warehouse
                                  // values (Dates, JSON columns) are compared
                                  // by content, not reference — reference
                                  // equality would treat every row as a
                                  // violation for those types.
                                  const pickRaw = (v: unknown) => {
                                      if (
                                          v !== null &&
                                          typeof v === 'object' &&
                                          'value' in v &&
                                          v.value !== null &&
                                          typeof v.value === 'object' &&
                                          'raw' in v.value
                                      ) {
                                          return (v.value as { raw: unknown })
                                              .raw;
                                      }
                                      return v;
                                  };
                                  const existingRaw = pickRaw(existing);
                                  const incomingRaw = pickRaw(incoming);
                                  const same =
                                      existingRaw === incomingRaw ||
                                      (existingRaw !== null &&
                                          incomingRaw !== null &&
                                          typeof existingRaw === 'object' &&
                                          typeof incomingRaw === 'object' &&
                                          JSON.stringify(existingRaw) ===
                                              JSON.stringify(incomingRaw));
                                  if (!same) {
                                      passthroughCardinalityViolations.add(
                                          dim.reference,
                                      );
                                  }
                              }
                          }
                      }

                      const pivotValues =
                          groupByColumns?.map((c) => {
                              const field = itemsMap[c.reference];
                              const rawValue = formatRawValue(
                                  field,
                                  row[c.reference],
                                  displayTimezone ?? undefined,
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

                      // eslint-disable-next-line @typescript-eslint/no-loop-func -- forEach is synchronous, executes within current loop iteration
                      valuesColumns.forEach((col) => {
                          const valueColumnField =
                              PivotQueryBuilder.getValueColumnFieldName(
                                  col.reference,
                                  col.aggregation,
                              );
                          // Suffix the value column with the group by values to
                          // avoid collisions, e.g. 'value_any_a_b'.
                          const valueColumnReference = getPivotValueColumnName(
                              col.reference,
                              col.aggregation,
                              pivotValues.map((p) => p.value),
                          );

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
                      itemsMap,
                      usedParameters,
                  );
                  await write?.(rows);
              };

        if (dataTimezone && !isValidTimezone(dataTimezone)) {
            throw new ParameterError(`Invalid data timezone: ${dataTimezone}`);
        }

        let internalRowsRemoved = 0;
        const writeAndTransformRows = async (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => {
            const normalized = consumeMergeResultMetadata(rows, fields);
            internalRowsRemoved += normalized.removedRows;
            await transformRows(normalized.rows, normalized.fields);
        };

        const warehouseResults = await traceSpan(
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
                    writeAndTransformRows,
                ),
        );

        const columns = pivotConfiguration?.groupByColumns?.length
            ? getPivotedColumns(
                  unpivotedColumns,
                  pivotConfiguration,
                  Array.from(valuesColumnData.values()),
                  itemsMap,
                  usedParameters,
              )
            : unpivotedColumns;

        // Write the last row
        if (currentTransformedRow) {
            pivotTotalRows += 1;
            await write?.([currentTransformedRow]);
        }

        const passthroughCardinalityWarnings = Array.from(
            passthroughCardinalityViolations,
        );
        if (passthroughCardinalityWarnings.length > 0) {
            // Debug-level so we don't spam prod logs for misconfigured charts.
            // Surface via Logger.debug for devs investigating user reports of
            // "wrong image showing"; the dim isn't 1-to-1 with the visible
            // pivot/row dims so the first warehouse row's value wins
            // arbitrarily. No user-facing UI consumer yet — see PROD-7873 PR
            // description for the deferred surface.
            Logger.debug(
                `Pivot passthrough dimensions had multiple values per row_index — values rendered in cross-field templates are arbitrary. Fields: ${passthroughCardinalityWarnings.join(
                    ', ',
                )}`,
            );
        }

        return {
            warehouseResults: {
                ...warehouseResults,
                totalRows: Math.max(
                    0,
                    warehouseResults.totalRows - internalRowsRemoved,
                ),
            },
            columns,
            unpivotedColumns,
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
                `Pre-agg route selected for ${queryUuid} (${resolution.execution}): ${preAggregationRoute.sourceExploreName}/${preAggregationRoute.preAggregateName}`,
            );
            return {
                target: 'pre_aggregate',
                preAggregateQuery: resolution.query,
                preAggregateExecution: resolution.execution,
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
        onboardingFlow,
        projectUuid,
        queryUuid,
        queryTags,
        fieldsMap,
        usedParameters,
        cacheKey,
        warehouseCredentialsOverrides,
        pivotConfiguration,
        originalColumns,
        preAggregateQuery,
        warehouseQuery,
        preAggregateExecution,
        queryCreatedAt,
        displayTimezone,
        isPreviewProject,
    }: RunAsyncPreAggregateQueryArgs) {
        try {
            // Managed pre-aggregates run on the DuckDB client override;
            // external ones run on the normal project warehouse client.
            const duckDbWarehouseClient =
                preAggregateExecution === 'duckdb'
                    ? this.preAggregateStrategy.createPreAggregateWarehouseClient()
                    : undefined;

            await this.runAsyncWarehouseQuery({
                userUuid,
                organizationUuid,
                isPreviewProject,
                isRegisteredUser,
                isServiceAccount,
                onboardingFlow,
                projectUuid,
                queryUuid,
                queryTags,
                query: preAggregateQuery,
                fieldsMap,
                usedParameters,
                cacheKey,
                warehouseCredentialsOverrides,
                pivotConfiguration,
                originalColumns,
                queryCreatedAt,
                displayTimezone,
                rethrowOnError: true,
                ...(duckDbWarehouseClient
                    ? {
                          warehouseClientOverride: duckDbWarehouseClient,
                          warehouseCredentialsTypeOverride:
                              duckDbWarehouseClient.credentials.type,
                      }
                    : {}),
            });
        } catch (preAggregateError) {
            if (
                !(await this.isPreAggregateExecutionFallbackEnabled(
                    projectUuid,
                ))
            ) {
                Sentry.getActiveSpan()?.setAttribute(
                    'lightdash.preAggregate.fallbackDisabled',
                    true,
                );
                this.logger.warn(
                    `Pre-aggregate execution (${preAggregateExecution}) failed for ${queryUuid} and execution fallback is disabled. Marking query as errored`,
                );
                await this.markAsyncQueryErrored({
                    queryUuid,
                    projectUuid,
                    organizationUuid,
                    userUuid,
                    isRegisteredUser,
                    isPreviewProject,
                    onboardingFlow,
                    queryTags,
                    queryCreatedAt,
                    errorMessage: `Pre-aggregate execution failed, and execution fallback is disabled for this project ('pre_aggregate_execution_fallback' under 'defaults' in lightdash.config.yml).\nCause: ${getErrorMessage(
                        preAggregateError,
                    )}`,
                    errorName:
                        preAggregateError instanceof Error
                            ? preAggregateError.name
                            : undefined,
                    executionSource:
                        preAggregateExecution === 'duckdb'
                            ? 'pre_aggregate_duckdb'
                            : 'pre_aggregate_warehouse',
                    warehouseType: null,
                });
                return;
            }

            Sentry.getActiveSpan()?.setAttribute(
                'lightdash.preAggregate.fallback',
                true,
            );
            Sentry.getActiveSpan()?.setAttribute(
                'lightdash.executionSource',
                preAggregateExecution === 'duckdb'
                    ? 'warehouse_after_duckdb_fallback'
                    : 'warehouse_after_pre_aggregate_fallback',
            );
            this.logger.warn(
                `Pre-agg execution (${preAggregateExecution}) failed for ${queryUuid}: ${getErrorMessage(
                    preAggregateError,
                )}. Falling back to warehouse`,
            );
            const fallbackReason: PreAggregateFallbackReason =
                preAggregateExecution === 'duckdb'
                    ? 'duckdb_execution_error'
                    : 'external_execution_error';
            this.prometheusMetrics?.incrementPreAggregateFallback(
                fallbackReason,
            );

            // Persist the fallback before the retry so polling clients and
            // query history reflect the actual execution source.
            try {
                await this.queryHistoryModel.update(
                    queryUuid,
                    projectUuid,
                    { pre_aggregate_fallback_reason: fallbackReason },
                    {
                        isRegisteredUser: () => isRegisteredUser,
                        user: { id: userUuid },
                    },
                );
            } catch (updateError) {
                this.logger.error(
                    `Failed to record pre-aggregate fallback for ${queryUuid}: ${getErrorMessage(
                        updateError,
                    )}`,
                );
            }

            if (queryTags.explore_name) {
                this.preAggregateStrategy.recordExecutionFallback({
                    projectUuid,
                    exploreName: queryTags.explore_name,
                    chartUuid: queryTags.chart_uuid ?? null,
                    dashboardUuid: queryTags.dashboard_uuid ?? null,
                    queryContext: queryTags.query_context,
                });
            }

            await this.runAsyncWarehouseQuery({
                userUuid,
                organizationUuid,
                isPreviewProject,
                isRegisteredUser,
                isServiceAccount,
                onboardingFlow,
                projectUuid,
                queryUuid,
                queryTags,
                query: warehouseQuery,
                fieldsMap,
                usedParameters,
                cacheKey,
                warehouseCredentialsOverrides,
                pivotConfiguration,
                originalColumns,
                queryCreatedAt,
                displayTimezone,
            });
        }
    }

    // Availability-safe: any read failure keeps the default fallback behavior
    private async isPreAggregateExecutionFallbackEnabled(
        projectUuid: string,
    ): Promise<boolean> {
        try {
            const defaults =
                await this.projectModel.findProjectDefaults(projectUuid);
            return defaults?.pre_aggregate_execution_fallback ?? true;
        } catch (e) {
            this.logger.error(
                `Failed to read project defaults for ${projectUuid}, keeping pre-aggregate execution fallback enabled: ${getErrorMessage(
                    e,
                )}`,
            );
            return true;
        }
    }

    // Shared terminal-error path for async queries: analytics, query history
    // status, and prometheus stay consistent across every errored execution.
    private async markAsyncQueryErrored({
        queryUuid,
        projectUuid,
        organizationUuid,
        userUuid,
        isRegisteredUser,
        isPreviewProject,
        onboardingFlow,
        queryTags,
        queryCreatedAt,
        errorMessage,
        errorName,
        executionSource,
        warehouseType,
    }: Pick<
        RunAsyncWarehouseQueryArgs,
        | 'queryUuid'
        | 'projectUuid'
        | 'organizationUuid'
        | 'userUuid'
        | 'isRegisteredUser'
        | 'isPreviewProject'
        | 'onboardingFlow'
        | 'queryTags'
        | 'queryCreatedAt'
    > & {
        errorMessage: string;
        errorName?: string;
        executionSource:
            | 'warehouse'
            | 'pre_aggregate_duckdb'
            | 'pre_aggregate_warehouse';
        warehouseType: WarehouseTypes | null;
    }) {
        const analyticsIdentity = isRegisteredUser
            ? { userId: userUuid }
            : { anonymousId: 'embed' };
        this.analytics.track({
            ...analyticsIdentity,
            event: 'query.error',
            properties: {
                queryId: queryUuid,
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseType: warehouseType ?? undefined,
                executionSource,
                ...(isRegisteredUser ? undefined : { externalId: userUuid }),
            },
        });
        this.analytics.track({
            ...analyticsIdentity,
            event: 'query.completed',
            properties: {
                queryId: queryUuid,
                organizationId: organizationUuid,
                projectId: projectUuid,
                isPreviewProject,
                status: 'error',
                context: queryTags.query_context,
                onboardingFlow,
                exploreName: queryTags.explore_name ?? null,
                chartId: queryTags.chart_uuid ?? null,
                dashboardId: queryTags.dashboard_uuid ?? null,
                cacheHit: false,
                executionSource,
                warehouseType,
                warehouseExecutionTimeMs: null,
                totalRowCount: null,
                columnsCount: null,
                ...(isRegisteredUser ? undefined : { externalId: userUuid }),
            },
        });

        await this.queryHistoryModel.updateStatusToError(
            queryUuid,
            projectUuid,
            errorMessage,
            {
                isRegisteredUser: () => isRegisteredUser,
                user: { id: userUuid },
            },
            errorName,
        );
        if (executionSource !== 'pre_aggregate_duckdb') {
            this.prometheusMetrics?.incrementWarehouseQueryFailure();
        }
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

    public async runAsyncWarehouseQueryFromHistory(
        queryUuid: string,
        workerLabel: string,
        queryTagsOverride?: RunQueryTags,
    ): Promise<boolean> {
        const canRun = await this.prepareQueuedQueryForExecution(
            queryUuid,
            workerLabel,
        );

        if (!canRun) {
            return false;
        }

        const args = await this.buildWarehouseQueryArgs(
            queryUuid,
            queryTagsOverride,
        );
        await this.runAsyncWarehouseQuery(args);
        return true;
    }

    public async runAsyncPreAggregateQueryFromHistory(
        queryUuid: string,
        workerLabel: string,
        queryTagsOverride?: RunQueryTags,
    ): Promise<boolean> {
        const canRun = await this.prepareQueuedQueryForExecution(
            queryUuid,
            workerLabel,
        );

        if (!canRun) {
            return false;
        }

        const args = await this.buildPreAggregateQueryArgs(
            queryUuid,
            queryTagsOverride,
        );
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
        isPreviewProject,
        isRegisteredUser,
        isServiceAccount,
        onboardingFlow,
        projectUuid,
        query,
        fieldsMap,
        usedParameters,
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
        rethrowOnError,
    }: RunAsyncWarehouseQueryArgs & {
        warehouseClientOverride?: WarehouseClient;
        warehouseCredentialsTypeOverride?: CreateWarehouseCredentials['type'];
        rethrowOnError?: boolean;
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
        let tunnelConnectMs: number | null = null;

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
                tunnelConnectMs = warehouseConnection.tunnelConnectMs;
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
            const newExpiresAt = await this.getCacheExpiresAt(
                projectUuid,
                createdAt,
            );
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
                    phaseTimings,
                },
                pivotDetails,
                columns,
                unpivotedColumns,
            } = await traceSpan(
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
                        usedParameters,
                        dataTimezone: resolvedDataTimezone,
                        displayTimezone,
                    }),
            );

            const warehousePhaseTimings: WarehousePhaseTimings =
                tunnelConnectMs !== null
                    ? { ssh_tunnel: tunnelConnectMs, ...phaseTimings }
                    : phaseTimings;

            this.prometheusMetrics?.observeWarehouseDuration(
                durationMs,
                warehouseCredentialsType,
                queryTags.query_context,
            );

            this.prometheusMetrics?.observeWarehousePhaseDurations(
                warehousePhaseTimings,
                warehouseCredentialsType,
                queryTags.query_context,
            );

            if (
                this.lightdashConfig.queryPhaseMetrics.projectUuids.includes(
                    projectUuid,
                )
            ) {
                this.prometheusMetrics?.observeProjectQueryPhaseDurations(
                    projectUuid,
                    warehousePhaseTimings,
                    warehouseCredentialsType,
                    queryTags.query_context,
                );
            }

            this.analytics.track({
                ...analyticsIdentity,
                event: 'query.ready',
                properties: {
                    queryId: queryUuid,
                    organizationId: organizationUuid,
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

            this.analytics.track({
                ...analyticsIdentity,
                event: 'query.completed',
                properties: {
                    queryId: queryUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    isPreviewProject,
                    status: 'success',
                    context: queryTags.query_context,
                    onboardingFlow,
                    exploreName: queryTags.explore_name ?? null,
                    chartId: queryTags.chart_uuid ?? null,
                    dashboardId: queryTags.dashboard_uuid ?? null,
                    cacheHit: false,
                    executionSource,
                    warehouseType: warehouseClient.credentials.type,
                    warehouseExecutionTimeMs: Math.round(durationMs),
                    totalRowCount: pivotDetails?.totalRows ?? totalRows,
                    columnsCount:
                        pivotDetails?.totalColumnCount ??
                        Object.keys(fieldsMap).length,
                    ...(isRegisteredUser
                        ? undefined
                        : { externalId: userUuid }),
                },
            });

            const queryExecMs = Date.now() - queryStartTime;

            if (stream) {
                // Wait for the file to be written before marking the query as ready
                const s3UploadStart = Date.now();
                const closeResult = await traceSpan(
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
                    // Metric-path pivots don't receive originalColumns from
                    // preparation, so persist the pre-pivot columns captured
                    // during streaming — consumers need the pre-pivot shape.
                    original_columns:
                        originalColumns ??
                        (pivotDetails ? unpivotedColumns : undefined),
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
            const phasesStr = Object.keys(warehousePhaseTimings).length
                ? ` phases=[${Object.entries(warehousePhaseTimings)
                      .map(([phase, ms]) => `${phase}=${Math.round(ms)}ms`)
                      .join(' ')}]`
                : '';
            this.logger.info(
                `Query ${queryUuid} completed: source=${executionSource} s3_stream_create=${s3StreamCreatedMs}ms query_exec=${queryExecMs}ms s3_upload_close=${s3UploadCloseMs}ms db_update=${dbUpdateMs}ms total=${totalMs}ms rows=${pivotDetails?.totalRows ?? totalRows}${streamMetricsStr}${phasesStr}`,
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
                    // Surface every queryTag (chart_uuid, dashboard_uuid,
                    // saved_sql_uuid, scheduler_uuid, scheduler_name, job_id,
                    // explore_name, query_context, …) onto the error log so a
                    // single Cloud Logging filter maps a warehouse failure
                    // back to the originating chart / scheduled sync.
                    ...queryTags,
                },
            );

            // Pre-aggregate attempts rethrow so the caller can fall back to the
            // warehouse; keep the query history row non-terminal so polling
            // clients receive the retry result.
            if (warehouseClientOverride || rethrowOnError) {
                throw e;
            }

            await this.markAsyncQueryErrored({
                queryUuid,
                projectUuid,
                organizationUuid,
                userUuid,
                isRegisteredUser,
                isPreviewProject,
                onboardingFlow,
                queryTags,
                queryCreatedAt,
                errorMessage: getErrorMessage(e),
                errorName: e instanceof Error ? e.name : undefined,
                executionSource,
                warehouseType: warehouseCredentialsType ?? null,
            });
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
        userTimezone,
        sessionTimezone,
        metricQuery,
        preloadedProjectTimezone,
    }: {
        projectUuid: string | null;
        organizationUuid: string;
        userUuid: string;
        userTimezone: string | null;
        sessionTimezone: string | null;
        metricQuery: MetricQuery;
        preloadedProjectTimezone?: string;
    }): Promise<{
        resolvedTimezone: string;
        displayTimezone: string | null;
        enabled: boolean;
    }> {
        const projectTimezone =
            preloadedProjectTimezone ??
            (projectUuid
                ? await this.getQueryTimezoneForProject(projectUuid)
                : 'UTC');
        const resolvedTimezone = resolveQueryTimezone({
            sessionTimezone,
            metricQuery,
            projectTimezone,
            userTimezone,
        });
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
        queryTagsOverride?: RunQueryTags,
    ): Promise<RunAsyncWarehouseQueryArgs> {
        const query = await this.getQueryHistoryFromHistory(queryUuid);
        const actor = AsyncQueryService.getQueryHistoryActor(query);
        const queryTags =
            queryTagsOverride ?? AsyncQueryService.buildQueryTags(query);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(query);
        const displayTimezone = query.metricQuery.timezone ?? null;
        const isPreviewProject = await this.isExcludedFromUsage(
            query.projectUuid,
        );
        const onboardingFlow = await this.getOnboardingFlow({
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
        });

        return {
            projectUuid: query.projectUuid ?? '',
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
            isPreviewProject,
            queryUuid: query.queryUuid,
            isRegisteredUser: actor.isRegisteredUser,
            isServiceAccount: actor.isServiceAccount,
            onboardingFlow,
            queryTags,
            fieldsMap: query.fields,
            usedParameters: query.usedParameters,
            cacheKey: query.cacheKey,
            warehouseCredentialsOverrides,
            pivotConfiguration: query.pivotConfiguration ?? undefined,
            originalColumns: query.originalColumns ?? undefined,
            queryCreatedAt: query.createdAt,
            query: query.compiledSql,
            displayTimezone,
        };
    }

    // Preview and sample-data queries are both kept out of the usage event
    // stream. Every path that reports usage has to agree, or the numbers are
    // silently inconsistent rather than uniformly excluded.
    private async isExcludedFromUsage(
        projectUuid: string | null,
    ): Promise<boolean> {
        if (!projectUuid) return false;
        const summary = await this.projectModel.getSummary(projectUuid);
        return (
            summary.type === ProjectType.PREVIEW ||
            summary.provisioningSource === 'playground'
        );
    }

    private async buildPreAggregateQueryArgs(
        queryUuid: string,
        queryTagsOverride?: RunQueryTags,
    ): Promise<RunAsyncPreAggregateQueryArgs> {
        const query = await this.getQueryHistoryFromHistory(queryUuid);

        if (!query.preAggregateCompiledSql) {
            throw new NotFoundError(
                `Pre-aggregate query not found in query_history for ${queryUuid}`,
            );
        }

        const actor = AsyncQueryService.getQueryHistoryActor(query);
        const queryTags =
            queryTagsOverride ?? AsyncQueryService.buildQueryTags(query);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(query);
        const displayTimezone = query.metricQuery.timezone ?? null;
        const isPreviewProject = await this.isExcludedFromUsage(
            query.projectUuid,
        );
        const onboardingFlow = await this.getOnboardingFlow({
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
        });

        return {
            projectUuid: query.projectUuid ?? '',
            userUuid: actor.userUuid,
            organizationUuid: query.organizationUuid,
            isPreviewProject,
            queryUuid: query.queryUuid,
            isRegisteredUser: actor.isRegisteredUser,
            isServiceAccount: actor.isServiceAccount,
            onboardingFlow,
            queryTags,
            fieldsMap: query.fields,
            usedParameters: query.usedParameters,
            cacheKey: query.cacheKey,
            warehouseCredentialsOverrides,
            pivotConfiguration: query.pivotConfiguration ?? undefined,
            originalColumns: query.originalColumns ?? undefined,
            queryCreatedAt: query.createdAt,
            preAggregateQuery: query.preAggregateCompiledSql,
            // Default to duckdb for rows written before the column existed
            preAggregateExecution: query.preAggregateExecution ?? 'duckdb',
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

    /**
     * Reads scheduler/job context from the request-scoped ExecutionContext
     * (populated by SchedulerTask handlers when a scheduled job is running)
     * so warehouse queries can be tagged back to the originating sync/delivery.
     * Returns an empty object outside scheduler execution.
     */
    private static getSchedulerQueryTags(): Partial<RunQueryTags> {
        const ctx = getSchedulerContext();
        if (!ctx) return {};
        const tags: Partial<RunQueryTags> = {};
        if (ctx.scheduler_uuid) tags.scheduler_uuid = ctx.scheduler_uuid;
        if (ctx.scheduler_name) tags.scheduler_name = ctx.scheduler_name;
        if (ctx.saved_sql_uuid) tags.saved_sql_uuid = ctx.saved_sql_uuid;
        if (ctx.job_id) tags.job_id = ctx.job_id;
        return tags;
    }

    /**
     * Reads the originating data app from the request-scoped ExecutionContext
     * (populated by requestExecutionContextMiddleware from the app attribution
     * header) so warehouse queries can be tagged back to the app. Mirrors
     * getSchedulerQueryTags — provenance is carried ambiently, not via query
     * args. Returns an empty object outside an app-originated request. The id
     * is self-reported and not authoritative; tracking only.
     */
    private static getAppQueryTags(): Partial<RunQueryTags> {
        const { app_uuid: appUuid } = getAppContext();
        return appUuid ? { app_uuid: appUuid } : {};
    }

    private static addUserAttributeQueryTags(
        queryTags: RunQueryTags,
        userAccessControls: UserAccessControls | undefined,
    ): RunQueryTags {
        if (!userAccessControls) {
            return queryTags;
        }
        return {
            ...queryTags,
            ...getUserAttributeQueryTags(userAccessControls.userAttributes),
        };
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
        // SQL chart runs identify the chart as savedSqlUuid; slug-only runs
        // can't be attributed without a lookup and resolve to undefined.
        let chartUuid: string | undefined;
        if (params && 'chartUuid' in params) {
            chartUuid = params.chartUuid;
        } else if (params && 'savedSqlUuid' in params) {
            chartUuid = params.savedSqlUuid;
        }
        const dashboardUuid =
            params && 'dashboardUuid' in params
                ? params.dashboardUuid
                : undefined;

        return {
            ...actorTags,
            ...AsyncQueryService.getSchedulerQueryTags(),
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
        preloadedProjectParameters,
    }: Pick<
        ExecuteAsyncMetricQueryArgs,
        'metricQuery' | 'dateZoom' | 'projectUuid'
    > & {
        warehouseSqlBuilder: WarehouseSqlBuilder;
        explore: Explore;
        pivotConfiguration?: PivotConfiguration;
        preloadedProjectParameters?: DbProjectParameter[];
    }) {
        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
            preloadedProjectParameters,
        );
        const availableParameters = Object.keys(availableParameterDefinitions);

        const { explore: exploreWithOverride, dateZoomApplied } =
            updateExploreWithDateZoom(
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
        totalConfiguration,
        pivotDimensions,
        userAttributeOverrides,
        materializationRole,
        skipModelRequiredFilters,
        columnTimezone,
        dataTimezone,
        sessionTimezone,
        applyDateZoomToFilters,
        context,
        preloadedUserAccessControls,
        preloadedProjectParameters,
        preloadedProjectTimezone,
    }: Pick<
        ExecuteAsyncMetricQueryArgs,
        | 'account'
        | 'metricQuery'
        | 'dateZoom'
        | 'parameters'
        | 'projectUuid'
        | 'userAttributeOverrides'
        | 'materializationRole'
        | 'totalConfiguration'
    > & {
        warehouseSqlBuilder: WarehouseSqlBuilder;
        explore: Explore;
        pivotConfiguration?: PivotConfiguration;
        /**
         * Chart's pivotConfig.columns, for chart types that build no
         * pivotConfiguration (big number, map, sankey) but still need row_total()
         * to resolve — see BuildQueryProps.pivotDimensions. Defaults to the
         * metricQuery's own pivotDimensions (the explorer path).
         */
        pivotDimensions?: string[];
        columnTimezone?: string;
        dataTimezone?: string;
        sessionTimezone?: string | null;
        /**
         * Opt-in: rewrite WHERE filter LHS to use the zoom-grain dimension
         * for the filter that targets the zoom-rewritten field. Only the
         * underlying-data path sets this (PROD-880).
         */
        applyDateZoomToFilters?: boolean;
        skipModelRequiredFilters?: boolean;
        preloadedUserAccessControls?: UserAccessControls;
        preloadedProjectParameters?: DbProjectParameter[];
        preloadedProjectTimezone?: string;
        context?: QueryExecutionContext;
    }): Promise<QueryComposer> {
        assertIsAccountWithOrg(account);

        const resolvedUserAccessControls =
            materializationRole ??
            preloadedUserAccessControls ??
            (await this.getUserAttributes({ account }));
        const { userAttributes: baseUserAttributes, intrinsicUserAttributes } =
            resolvedUserAccessControls;
        const userAttributes =
            materializationRole === undefined && userAttributeOverrides
                ? { ...baseUserAttributes, ...userAttributeOverrides }
                : baseUserAttributes;

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
            preloadedProjectParameters,
        );

        const {
            resolvedTimezone,
            displayTimezone,
            enabled: useTimezoneAwareDateTrunc,
        } = await this.resolveTimezoneContext({
            projectUuid,
            organizationUuid: account.organization.organizationUuid,
            userUuid: account.user.id,
            // Pre-aggregate materializations build shared tables queried by
            // every viewer — they must compile against the project timezone,
            // not the triggering user's profile preference.
            userTimezone:
                materializationRole !== undefined
                    ? null
                    : getAccountUserTimezone(account),
            sessionTimezone: sessionTimezone ?? null,
            metricQuery,
            preloadedProjectTimezone,
        });

        return new QueryComposer(
            { metricQuery, pivotConfiguration, totalConfiguration },
            {
                explore,
                warehouseSqlBuilder,
                intrinsicUserAttributes,
                userAttributes,
                timezone: resolvedTimezone,
                availableParameterDefinitions,
                // ! TODO: Should validate the parameters to make sure they are valid from the options
                parameters,
                dateZoom,
                pivotDimensions: pivotDimensions ?? metricQuery.pivotDimensions,
                skipModelRequiredFilters,
                useTimezoneAwareDateTrunc,
                columnTimezone,
                dataTimezone,
                applyDateZoomToFilters,
                displayTimezone,
                queryExecutionContext: context,
            },
        );
    }

    private async assertOrganizationNotBlocked(
        account: Account,
    ): Promise<void> {
        const access =
            await this.organizationAccessService.getOrganizationAccess(account);
        if (access.status === OrganizationAccessStatus.TRIAL_EXPIRED) {
            throw new TrialExpiredError();
        }
    }

    private async executePreparedAsyncQuery(
        args: PreparedAsyncQueryArgs,
        requestParameters: ExecuteAsyncQueryRequestParams,
        organizationUuid: string,
    ): Promise<ExecuteAsyncQueryReturn> {
        await this.assertOrganizationNotBlocked(args.account);
        return wrapSentryTransaction(
            'ProjectService.executeAsyncQuery',
            {},
            async (span) => {
                const {
                    account,
                    projectUuid,
                    context,
                    queryTags,
                    chart,
                    isPreviewProject,
                    queryComposer,
                    originalColumns,
                    routingTarget,
                    preAggregationRoute,
                    warehouseCredentials,
                } = args;

                try {
                    assertIsAccountWithOrg(account);

                    const explore = queryComposer.getExplore();
                    const metricQuery = queryComposer.getMetricQuery();
                    const fieldsMap = queryComposer.getFields();
                    const pivotConfiguration =
                        queryComposer.getPivotConfiguration();
                    const missingParameterReferences =
                        queryComposer.getMissingParameterReferences();
                    const dateZoom = queryComposer.getDateZoom();
                    const timezone = queryComposer.getTimezone();
                    const displayTimezone = queryComposer.getDisplayTimezone();

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

                    const query = queryComposer.getSql({
                        columnLimit:
                            this.lightdashConfig.pivotTable.maxColumnLimit,
                    });
                    span.setAttribute('generatedSql', query);

                    const onboardingFlow = await this.getOnboardingFlow({
                        userUuid: account.user.id,
                        organizationUuid: account.organization.organizationUuid,
                    });
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
                        this.analytics.trackAccount(account, {
                            event: 'onboarding.step_completed',
                            properties: {
                                step: 'first_query',
                                stepIndex: 5,
                                onboardingFlow,
                                organizationId:
                                    account.organization.organizationUuid,
                            },
                        });
                    }

                    // Mirrors runAsyncWarehouseQuery's resolvedDataTimezone:
                    // the session (data) timezone changes results without
                    // changing the SQL text, so it is part of the cache key.
                    const isTimezoneSupportEnabled =
                        await this.isTimezoneSupportEnabled({
                            userUuid: account.user.id,
                            organizationUuid:
                                account.organization.organizationUuid,
                        });
                    const resolvedDataTimezone = isTimezoneSupportEnabled
                        ? warehouseCredentials.dataTimezone
                        : undefined;
                    // Generate cache key from project and query identifiers
                    // Include user UUID to prevent cache sharing between users when user-specific credentials are in use
                    // Use the resolved timezone (not metricQuery.timezone) because the
                    // resolved value includes project and config fallbacks. Two queries with
                    // the same SQL but different resolved timezones produce different results
                    // (e.g., timezone-aware DATE_TRUNC, filter boundaries) and must not share a cache entry.
                    const externalSourceReference =
                        explore.type === ExploreType.EXTERNAL_SOURCE
                            ? await this.resolveExternalSourceReference(
                                  projectUuid,
                                  explore,
                                  {
                                      userUuid: account.user.id,
                                      organizationUuid,
                                  },
                              )
                            : undefined;

                    const cacheKey = QueryHistoryModel.getCacheKey(
                        projectUuid,
                        {
                            sql: query,
                            timezone,
                            userUuid:
                                warehouseCredentials.userWarehouseCredentialsUuid
                                    ? account.user.id
                                    : null,
                            dataTimezone: resolvedDataTimezone,
                            externalSourceSalt:
                                externalSourceReference &&
                                'cacheKeySalt' in externalSourceReference
                                    ? externalSourceReference.cacheKeySalt
                                    : undefined,
                        },
                    );

                    const cacheCheckStart = Date.now();
                    const resultsCache = await this.findResultsCache(
                        projectUuid,
                        cacheKey,
                        account,
                        requestParameters.invalidateCache ??
                            args.invalidateCache ??
                            false,
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
                            usedParameters: queryComposer.getUsedParameters(),
                            // Persist the gated display timezone (matches
                            // what the SQL was built with). Storing the
                            // ungated resolvedTimezone leaks a +TZ shift
                            // through formatTimestamp on flag-off orgs.
                            metricQuery: {
                                ...metricQuery,
                                timezone: displayTimezone ?? undefined,
                            },
                            cacheKey,
                            pivotConfiguration: pivotConfiguration ?? null,
                            originalColumns: originalColumns ?? null,
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
                        onboardingFlow,
                        queryId: queryHistoryUuid,
                        warehouseType: warehouseCredentialsType,
                        ...ProjectService.getMetricQueryExecutionProperties({
                            metricQuery,
                            queryTags,
                            dateZoom,
                            chartUuid: chart?.uuid,
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
                        executionSource?:
                            | 'warehouse'
                            | 'pre_aggregate_duckdb'
                            | 'pre_aggregate_warehouse'
                            | 'external_source_duckdb',
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
                    // Terminal outcome for queries that never reach the
                    // background executor (cache hits and pre-execution
                    // errors). Warehouse completions emit their own
                    // query.completed in runAsyncWarehouseQuery.
                    const trackQueryCompleted = (outcome: {
                        status: 'success' | 'error';
                        cacheHit: boolean;
                        totalRowCount?: number | null;
                        columnsCount?: number | null;
                    }) =>
                        this.analytics.trackAccount(account, {
                            event: 'query.completed',
                            properties: {
                                queryId: queryHistoryUuid,
                                organizationId: organizationUuid,
                                projectId: projectUuid,
                                isPreviewProject,
                                status: outcome.status,
                                context,
                                onboardingFlow,
                                exploreName: explore.name,
                                chartId: chart?.uuid ?? null,
                                dashboardId: queryTags.dashboard_uuid ?? null,
                                cacheHit: outcome.cacheHit,
                                executionSource: null,
                                warehouseType: warehouseCredentialsType,
                                warehouseExecutionTimeMs: outcome.cacheHit
                                    ? 0
                                    : null,
                                totalRowCount: outcome.totalRowCount ?? null,
                                columnsCount: outcome.columnsCount ?? null,
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
                        trackQueryCompleted({
                            status: 'success',
                            cacheHit: true,
                            totalRowCount: resultsCache.totalRowCount,
                            columnsCount: resultsCache.columns
                                ? Object.keys(resultsCache.columns).length
                                : null,
                        });
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
                                // Cached rows created before original columns were persisted at creation may hold null — don't clobber the value this row was created with
                                original_columns:
                                    resultsCache.originalColumns ??
                                    originalColumns ??
                                    null,
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
                        trackQueryCompleted({
                            status: 'error',
                            cacheHit: false,
                        });
                        await this.queryHistoryModel.updateStatusToError(
                            queryHistoryUuid,
                            projectUuid,
                            `Missing parameters: ${missingParameterReferences.join(', ')}`,
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
                    const executionPlan = externalSourceReference
                        ? AsyncQueryService.resolveExternalSourceExecutionPlan(
                              query,
                              externalSourceReference,
                          )
                        : await this.resolveAsyncQueryExecutionPlan({
                              projectUuid,
                              warehouseQuery: query,
                              metricQuery,
                              timezone: timezone ?? 'UTC',
                              dateZoom,
                              parameters: queryComposer.getParameters(),
                              routingTarget: routingTarget ?? 'warehouse',
                              preAggregationRoute,
                              fieldsMap,
                              pivotConfiguration,
                              startOfWeek: warehouseCredentials.startOfWeek,
                              userAccessControls:
                                  queryComposer.getUserAccessControls(),
                              availableParameterDefinitions:
                                  queryComposer.getAvailableParameterDefinitions(),
                              queryUuid: queryHistoryUuid,
                              useTimezoneAwareDateTrunc:
                                  queryComposer.getUseTimezoneAwareDateTrunc(),
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
                            executionPlan.preAggregateExecution === 'duckdb'
                                ? 'pre_aggregate_duckdb'
                                : 'pre_aggregate_warehouse',
                        );
                    }

                    if (executionPlan.target === 'error') {
                        trackQueryExecuted();
                        trackQueryCompleted({
                            status: 'error',
                            cacheHit: false,
                        });
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

                    let executedSource: Parameters<
                        typeof trackQueryExecuted
                    >[0] = 'warehouse';
                    if (executionPlan.target === 'pre_aggregate') {
                        executedSource =
                            executionPlan.preAggregateExecution === 'duckdb'
                                ? 'pre_aggregate_duckdb'
                                : 'pre_aggregate_warehouse';
                    } else if (executionPlan.target === 'external_source') {
                        executedSource = 'external_source_duckdb';
                    }
                    trackQueryExecuted(executedSource);

                    const warehouseArgs: RunAsyncWarehouseQueryArgs = {
                        userUuid: account.user.id,
                        organizationUuid,
                        isPreviewProject,
                        isRegisteredUser: account.isRegisteredUser(),
                        isServiceAccount: account.isServiceAccount(),
                        onboardingFlow,
                        projectUuid,
                        query: executionPlan.warehouseQuery,
                        fieldsMap,
                        usedParameters: queryComposer.getUsedParameters(),
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
                                pre_aggregate_execution:
                                    executionPlan.preAggregateExecution,
                            },
                            account,
                        );
                    }

                    if (
                        this.lightdashConfig.natsWorker.enabled &&
                        executionPlan.target !== 'external_source'
                    ) {
                        this.logger.info(
                            `Enqueueing query ${queryHistoryUuid} on NATS JetStream (${executionPlan.target})`,
                        );

                        try {
                            const natsPayload = {
                                queryUuid: queryHistoryUuid,
                                queryTags,
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
                                        preAggregateExecution:
                                            executionPlan.preAggregateExecution,
                                    });
                                case 'external_source':
                                    return this.runExternalSourceQuery(
                                        warehouseArgs,
                                        account,
                                        executionPlan.objectScope,
                                    );
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

    private async executeAsyncQuery(
        args: ExecuteAsyncQueryArgs,
        requestParameters: ExecuteAsyncQueryRequestParams,
    ): Promise<ExecuteAsyncQueryReturn> {
        assertIsAccountWithOrg(args.account);

        const projectSummary = await this.projectModel.getSummary(
            args.projectUuid,
        );
        const organizationUuid =
            args.organizationUuid ?? projectSummary.organizationUuid;
        // Preview and sample-data queries are excluded from the usage event
        // stream while the query.completed product analytics event is retained.
        const isPreviewProject =
            projectSummary.type === ProjectType.PREVIEW ||
            projectSummary.provisioningSource === 'playground';

        const exploreName = args.queryComposer.getExplore().name;
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
                    exploreNames: [exploreName],
                    metadata: {
                        exploreName,
                    },
                }),
            );

        if (isForbidden) {
            throw new ForbiddenError();
        }

        return this.executePreparedAsyncQuery(
            { ...args, isPreviewProject },
            requestParameters,
            organizationUuid,
        );
    }

    // execute
    async executeAsyncMetricQuery(
        args: ExecuteAsyncMetricQueryArgs,
    ): Promise<ApiExecuteAsyncMetricQueryResults> {
        const {
            account,
            projectUuid,
            context,
            metricQuery: inputMetricQuery,
            materializationRole,
        } = args;
        assertIsAccountWithOrg(account);

        if (args.totalConfiguration && args.dashboardFilters) {
            throw new UnexpectedServerError(
                'totalConfiguration and dashboardFilters are mutually exclusive',
            );
        }

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
                exploreNames: [inputMetricQuery.exploreName],
                metadata: {
                    exploreName: inputMetricQuery.exploreName,
                },
            }),
        );
        if (isForbidden) {
            throw new ForbiddenError();
        }

        await this.assertCustomSqlAuthorizedForQuery({
            account,
            projectUuid,
            organizationUuid,
            exploreName: inputMetricQuery.exploreName,
            metricQuery: inputMetricQuery,
            dataAppPreviewToken: args.dataAppPreviewToken,
            customSqlProvenanceChartUuid: args.customSqlProvenanceChartUuid,
        });

        return this.runAsyncMetricQueryWithoutPermissionCheck(
            args,
            organizationUuid,
        );
    }

    // Callers MUST authorize the account for this explore/query first.
    private async runAsyncMetricQueryWithoutPermissionCheck(
        {
            account,
            projectUuid,
            dateZoom,
            context,
            metricQuery: inputMetricQuery,
            invalidateCache,
            usePreAggregateCache,
            parameters,
            pivotConfiguration,
            userAttributeOverrides,
            materializationRole,
            dashboardFilters,
            totalConfiguration,
        }: ExecuteAsyncMetricQueryArgs,
        organizationUuid: string,
    ): Promise<ApiExecuteAsyncMetricQueryResults> {
        assertIsAccountWithOrg(account);

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            ...AsyncQueryService.getAppQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: inputMetricQuery.exploreName,
            query_context: context,
        };

        const metricQueryStart = Date.now();

        // Load project warehouse config once, shared by warehouse credentials and timezone resolution
        const { organizationWarehouseCredentialsUuid, queryTimezone } =
            await this.projectModel.getProjectWarehouseConfig(projectUuid);
        const projectTimezone =
            queryTimezone ?? this.lightdashConfig.query.timezone ?? 'UTC';

        // Run independent data loads in parallel to minimize Postgres round-trips
        const [
            { explore, userAccessControls: preloadedUserAccessControls },
            warehouseCredentials,
            projectParameters,
        ] = await Promise.all([
            this.getExploreForMetricQueryExecution({
                account,
                projectUuid,
                exploreName: inputMetricQuery.exploreName,
                organizationUuid,
                materializationRole:
                    context ===
                    QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION
                        ? materializationRole
                        : undefined,
            }),
            this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
                preloadedOrgWarehouseCredentialsUuid:
                    organizationWarehouseCredentialsUuid,
            }),
            this.projectParametersModel.find(projectUuid),
        ]);
        const parallelLoadMs = Date.now() - metricQueryStart;

        // Dashboard filters (e.g. from a data-app tile) are merged once the
        // explore is known so we can drop filters that target fields outside
        // it — silent drop is intentional, see ExecuteAsyncMetricQueryRequestParams.
        let metricQuery: MetricQuery = inputMetricQuery;
        if (dashboardFilters) {
            const availableFieldIds = getAvailableFilterFieldIds(explore);
            metricQuery = addDashboardFiltersToMetricQuery(
                inputMetricQuery,
                {
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
                },
                explore,
            );
        }

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
        );

        // Combine default parameter values with request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            undefined,
            projectParameters,
        );

        const prepareStart = Date.now();
        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            dateZoom,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            totalConfiguration,
            userAttributeOverrides,
            materializationRole,
            context,
            ...(context === QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION
                ? { skipModelRequiredFilters: true }
                : {}),
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
            preloadedUserAccessControls,
            preloadedProjectParameters: projectParameters,
            preloadedProjectTimezone: projectTimezone,
        });
        const fields = queryComposer.getFields();
        const prepareMs = Date.now() - prepareStart;

        const effectiveMetricQuery = queryComposer.getMetricQuery();

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                queryTags,
                queryComposer.getUserAccessControls(),
            );

        const requestParameters: ExecuteAsyncMetricQueryRequestParams = {
            context,
            query: effectiveMetricQuery,
            parameters: combinedParameters,
            dateZoom,
        };

        const routingDecision = this.getPreAggregationRoutingDecision({
            metricQuery: effectiveMetricQuery,
            explore,
            context,
            forceWarehouse: usePreAggregateCache === false,
        });

        this.logger.info(
            `Metric query prep for ${metricQuery.exploreName}: parallel_load=${parallelLoadMs}ms prepare_query=${prepareMs}ms routing=${routingDecision.target} total=${Date.now() - metricQueryStart}ms`,
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
                projectUuid,
                organizationUuid,
                context,
                queryTags: queryTagsWithUserAttributes,
                invalidateCache,
                queryComposer,
                originalColumns: undefined,
                warehouseCredentials,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
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
            metricQuery: effectiveMetricQuery,
            fields,
            warnings: queryComposer.getWarnings(),
            parameterReferences: queryComposer.getParameterReferences(),
            usedParametersValues: queryComposer.getUsedParameters(),
            resolvedTimezone: queryComposer.getDisplayTimezone(),
        };
    }

    /**
     * Re-runs a previously-executed query without its row limit — used by app
     * deliveries to upgrade a capped (limitReached) captured query to a
     * complete result set. Reads the source's metricQuery/pivotConfiguration/
     * parameters from query_history (never a browser-transported payload) and
     * stores its own row, so it inherits cancellation, polling, download, and
     * analytics for free. `queryHistoryModel.get` enforces the source belongs
     * to this project and account, which authorizes the rerun — same as
     * `executeAsyncCalculateTotalFromQueryHistory` — so no separate CASL
     * explore check is needed. `invalidateCache: true` isn't needed to avoid
     * colliding with the capped run's cache entry (the compiled SQL embeds
     * the resolved LIMIT, so the cache key already differs) — it matches
     * every other scheduled-delivery execution path in SchedulerTask, which
     * all invalidate the cache on the same "never serve stale data" policy.
     *
     * Does NOT execute when the computed unbounded limit wouldn't beat the
     * source's own limit (a wide query's cell-based cap can land at or below
     * it) — the caller must keep delivering the already-capped result in
     * that case, not a same-or-smaller "upgrade". The applied limit is
     * returned alongside the new queryUuid so the caller can, after
     * downloading, tell whether the rerun itself still hit that cap.
     */
    async executeAsyncUnboundedRerunFromQueryHistory({
        account,
        projectUuid,
        queryUuid,
        context,
        invalidateCache,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        context: QueryExecutionContext;
        invalidateCache?: boolean;
    }): Promise<UnboundedRerunFromQueryHistoryResult> {
        assertIsAccountWithOrg(account);

        const [source, { organizationUuid }] = await Promise.all([
            this.queryHistoryModel.get(queryUuid, projectUuid, account),
            this.projectModel.getSummary(projectUuid),
        ]);

        const { csvCellsLimit, maxLimit } =
            await resolveOrganizationExportLimits(
                this.organizationSettingsModel,
                this.lightdashConfig.query,
                organizationUuid,
            );

        const unboundedMetricQuery = applyMetricQueryLimit(
            source.metricQuery,
            null,
            csvCellsLimit,
            maxLimit,
        );

        if (unboundedMetricQuery.limit <= source.metricQuery.limit) {
            return { outcome: 'noImprovementPossible' };
        }

        const { queryUuid: rerunQueryUuid } =
            await this.runAsyncMetricQueryWithoutPermissionCheck(
                {
                    account,
                    projectUuid,
                    context,
                    metricQuery: unboundedMetricQuery,
                    pivotConfiguration: source.pivotConfiguration ?? undefined,
                    parameters: source.requestParameters?.parameters,
                    dateZoom: getDateZoomFromRequestParameters(
                        source.requestParameters,
                    ),
                    invalidateCache,
                },
                organizationUuid,
            );

        return {
            outcome: 'executed',
            queryUuid: rerunQueryUuid,
            appliedLimit: unboundedMetricQuery.limit,
        };
    }

    /**
     * Calculate totals for a previously-executed async query referenced by
     * its queryUuid. The source query's metricQuery + pivotConfiguration are
     * read from query_history; this endpoint stores its own row in query_history
     * so it inherits cancellation, polling, download, and analytics for free.
     */
    async executeAsyncCalculateTotalFromQueryHistory({
        account,
        projectUuid,
        queryUuid,
        kind,
        subtotalDimensions,
        invalidateCache,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        kind: CalculateTotalKind;
        subtotalDimensions?: string[];
        invalidateCache?: boolean;
    }): Promise<ApiExecuteAsyncMetricQueryResults> {
        assertIsAccountWithOrg(account);

        // `get` enforces the query belongs to this project and was created by
        // this account — that ownership authorizes the totals query, so we skip
        // the explore-level CASL gate (which embed JWT callers can't pass).
        const [source, { organizationUuid }] = await Promise.all([
            this.queryHistoryModel.get(queryUuid, projectUuid, account),
            this.projectModel.getSummary(projectUuid),
        ]);

        // Reuse the source's parameter values so the totals query sees the
        // same parameter context as the original. The execution path
        // re-combines these against project defaults.
        const sourceParameters: ParametersValuesMap | undefined =
            source.requestParameters?.parameters;

        // The totals re-query must reproduce the source's grain. Date Zoom is a
        // runtime override not baked into the stored metricQuery, so recover it
        // from the persisted request echo.
        const sourceDateZoom = getDateZoomFromRequestParameters(
            source.requestParameters,
        );

        return this.runAsyncMetricQueryWithoutPermissionCheck(
            {
                account,
                projectUuid,
                context: QueryExecutionContext.CALCULATE_TOTAL,
                metricQuery: source.metricQuery,
                pivotConfiguration: source.pivotConfiguration ?? undefined,
                totalConfiguration: { kind, subtotalDimensions },
                parameters: sourceParameters,
                dateZoom: sourceDateZoom,
                invalidateCache,
            },
            organizationUuid,
        );
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

        const { maxLimit } = await resolveOrganizationExportLimits(
            this.organizationSettingsModel,
            this.lightdashConfig.query,
            organizationUuid,
        );

        const {
            metricQuery,
            explore,
            field,
            fieldId,
            labelFieldId,
            staticResults,
        } = await getFieldValuesMetricQuery({
            projectUuid,
            table,
            initialFieldId,
            search,
            limit,
            maxLimit,
            filters,
            exploreResolver: this.projectModel,
        });

        // The field's config turns warehouse fetching off: serve curated
        // values (empty when none) as an immediately-READY query instead of
        // running a distinct-value scan in the warehouse.
        if (staticResults) {
            const combinedParameters = await this.combineParameters(
                projectUuid,
                explore,
                parameters,
            );
            const staticRequestParameters: ExecuteAsyncFieldValueSearchRequestParams =
                {
                    context,
                    table,
                    fieldId: initialFieldId,
                    search,
                    limit,
                    filters,
                    forceRefresh,
                    parameters: combinedParameters,
                };
            const { queryUuid } = await this.queryHistoryModel.create(account, {
                projectUuid,
                organizationUuid,
                context,
                fields: { [fieldId]: field },
                compiledSql:
                    '-- served from curated filter_autocomplete values, no warehouse query',
                requestParameters: staticRequestParameters,
                usedParameters: null,
                metricQuery,
                cacheKey: `static-autocomplete-${fieldId}`,
                pivotConfiguration: null,
                originalColumns: null,
            });

            const fileName = QueryHistoryModel.createUniqueResultsFileName(
                `static-autocomplete-${fieldId}`,
            );
            const resultsStorageClient =
                this.getResultsStorageClientForContext(context);
            const stream = resultsStorageClient.createUploadStream(
                S3ResultsFileStorageClient.sanitizeFileExtension(fileName),
                { contentType: 'application/jsonl' },
            );
            const staticRows = staticResults.map(({ value }) => ({
                [fieldId]: value,
            }));
            await stream.write(staticRows);
            await stream.close();

            if (this.lightdashConfig.natsWorker.enabled) {
                await this.queryHistoryModel.updateStatusToExecuting(queryUuid);
            }
            const createdAt = new Date();
            const resultsExpiresAt = await this.getCacheExpiresAt(
                projectUuid,
                createdAt,
            );
            const staticColumns: ResultColumns = {
                [fieldId]: { reference: fieldId, type: field.type },
            };
            await this.queryHistoryModel.update(
                queryUuid,
                projectUuid,
                {
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: staticRows.length,
                    columns: staticColumns,
                    results_file_name: fileName,
                    results_created_at: createdAt,
                    results_updated_at: createdAt,
                    results_expires_at: resultsExpiresAt,
                },
                account,
            );

            this.analytics.track({
                event: 'field_value.search',
                userId: account.user.id,
                properties: {
                    projectId: projectUuid,
                    fieldId,
                    searchCharCount: search.length,
                    resultsCount: staticRows.length,
                    searchLimit: limit,
                },
            });

            return {
                queryUuid,
                cacheMetadata: { cacheHit: false },
                valueFieldId: fieldId,
                labelFieldId: null,
            };
        }

        const baseQueryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
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

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
        );

        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            userAttributeOverrides,
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
        });

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                baseQueryTags,
                queryComposer.getUserAccessControls(),
            );

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
                projectUuid,
                organizationUuid,
                context,
                queryTags: queryTagsWithUserAttributes,
                invalidateCache: invalidateCache || forceRefresh,
                queryComposer,
                originalColumns: undefined,
                warehouseCredentials,
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
            valueFieldId: fieldId,
            labelFieldId,
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
        filterOverrides,
        dashboardFilters,
    }: ExecuteAsyncSavedChartQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        // Check user is in organization
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
            {
                projectUuid,
            },
        );
        const {
            uuid: savedChartUuid,
            organizationUuid: savedChartOrganizationUuid,
            projectUuid: savedChartProjectUuid,
            spaceUuid: savedChartSpaceUuid,
            tableName: savedChartTableName,
            parameters: savedChartParameters,
        } = savedChart;

        const metricQuery = filterOverrides
            ? addFiltersToMetricQuery(savedChart.metricQuery, filterOverrides)
            : savedChart.metricQuery;

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
            const ctx = await this.spacePermissionService.resolveAccess(
                account.user.id,
                {
                    type: 'chart',
                    chartUuid: savedChart.uuid,
                    dashboardUuid: savedChart.dashboardUuid,
                    spaceUuid: savedChartSpaceUuid,
                },
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

        // Fire-and-forget: analytics tracking is non-critical and shouldn't block query execution
        void this.analyticsModel
            .addChartViewEvent(
                savedChartUuid,
                account.isRegisteredUser() ? account.user.id : null,
            )
            .catch((e) =>
                this.logger.warn('Failed to track chart view event', {
                    error: e,
                }),
            );

        const requestParameters: ExecuteAsyncSavedChartRequestParams = {
            context,
            chartUuid,
            versionUuid,
            limit,
            parameters,
            pivotResults,
            filters: filterOverrides,
            dashboardFilters,
        };

        if (savedChart.merge) {
            const mergeQuery = buildMergeQueryFromSaved(
                metricQuery,
                savedChart.merge,
            );
            const combinedParameters = {
                ...savedChartParameters,
                ...parameters,
            };
            const outcome = await this.executeAsyncMergeQuery({
                account,
                projectUuid,
                mergeQuery,
                context,
                invalidateCache,
                parameters: combinedParameters,
                mode:
                    limit === undefined
                        ? { type: 'interactive' }
                        : { type: 'export', limit },
                chart: pivotResults
                    ? {
                          chartConfig: savedChart.chartConfig,
                          pivotConfig: savedChart.pivotConfig,
                      }
                    : undefined,
            });
            if (outcome.outcome === 'refused') {
                throw new ParameterError(
                    `This saved merge cannot be run: ${outcome.errors
                        .map((error) => error.message)
                        .join(' ')}`,
                    { errors: outcome.errors },
                );
            }
            return outcome.query;
        }

        const { maxLimit, csvCellsLimit } =
            await resolveOrganizationExportLimits(
                this.organizationSettingsModel,
                this.lightdashConfig.query,
                savedChartOrganizationUuid,
            );

        const limitedMetricQuery = applyMetricQueryLimit(
            metricQuery,
            limit,
            csvCellsLimit,
            maxLimit,
        );

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: savedChartOrganizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            explore_name: savedChartTableName,
            query_context: context,
        };

        const { explore, userAccessControls: preloadedUserAccessControls } =
            await this.getExploreWithUserAccessControls(
                account,
                projectUuid,
                savedChartTableName,
                savedChartOrganizationUuid,
            );

        // Dashboard filters (from a data-app tile) are merged once the explore
        // is known so filters targeting fields outside it are dropped silently
        // — mirrors executeAsyncMetricQuery; see ExecuteAsyncSavedChartRequestParams.
        let metricQueryWithLimit = limitedMetricQuery;
        if (dashboardFilters) {
            const availableFieldIds = getAvailableFilterFieldIds(explore);
            metricQueryWithLimit = addDashboardFiltersToMetricQuery(
                limitedMetricQuery,
                {
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
                },
                explore,
            );
        }

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
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

        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: metricQueryWithLimit,
            explore,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            pivotDimensions: savedChart.pivotConfig?.columns,
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
            preloadedUserAccessControls,
        });
        const fieldsWithOverrides = queryComposer.getFields();

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

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                queryTags,
                queryComposer.getUserAccessControls(),
            );

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                organizationUuid: savedChartOrganizationUuid,
                chart: { uuid: savedChart.uuid },
                context,
                queryTags: queryTagsWithUserAttributes,
                invalidateCache,
                queryComposer,
                originalColumns: undefined,
                warehouseCredentials,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
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
            metricQuery: queryComposer.getMetricQuery(),
            fields: fieldsWithOverrides,
            warnings: queryComposer.getWarnings(),
            parameterReferences: queryComposer.getParameterReferences(),
            usedParametersValues: queryComposer.getUsedParameters(),
            resolvedTimezone: queryComposer.getDisplayTimezone(),
        };
    }

    private async checkDashboardChartQueryPermissions(
        account: Account,
        projectUuid: string,
        savedChartUuid: string,
        space: SpaceSummaryBase,
        // Set when the chart is owned by a dashboard, whose direct grants
        // then cover running it.
        owningDashboardUuid: string | null,
    ) {
        if (isJwtUser(account)) {
            const embedWriteActions = account.authentication.data.writeActions;
            if (
                account.embedWriteUser &&
                embedWriteActions?.spaceUuid === space.uuid
            ) {
                const auditedAbility = this.createAuditedAbility(
                    account.embedWriteUser,
                );
                await this.assertSavedChartViewAccessForUser(
                    account.embedWriteUser,
                    {
                        organizationUuid: space.organizationUuid,
                        projectUuid,
                        spaceUuid: space.uuid,
                        savedChartUuid,
                    },
                );
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
                return;
            }

            await this.permissionsService.checkEmbedPermissions(
                account,
                savedChartUuid,
            );
        } else {
            const auditedAbility = this.createAuditedAbility(account);
            const ctx = await this.spacePermissionService.resolveAccess(
                account.user.id,
                {
                    type: 'chart',
                    chartUuid: savedChartUuid,
                    dashboardUuid: owningDashboardUuid,
                    spaceUuid: space.uuid,
                },
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

        const auditedAbility = this.createAuditedAbility(account);
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

    private async getJwtDashboardQueryContext(
        account: AnonymousAccount,
        projectUuid: string,
        requestDashboardUuid: string | undefined,
    ): Promise<{
        dashboardUuid: string | undefined;
    }> {
        const { embedWriteUser } = account;
        const embedWriteActions = account.authentication.data.writeActions;
        const writeSpaceUuid = embedWriteUser
            ? embedWriteActions?.spaceUuid
            : undefined;

        if (writeSpaceUuid && requestDashboardUuid) {
            try {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    requestDashboardUuid,
                    { projectUuid },
                );

                if (embedWriteUser && dashboard.spaceUuid === writeSpaceUuid) {
                    await this.assertDashboardViewAccessForUser(
                        embedWriteUser,
                        dashboard,
                    );
                    return {
                        dashboardUuid: dashboard.uuid,
                    };
                }
            } catch (error) {
                if (!(error instanceof NotFoundError)) {
                    throw error;
                }
            }
        }

        return {
            dashboardUuid:
                account.access.content.type === 'dashboard'
                    ? account.access.content.dashboardUuid
                    : undefined,
        };
    }

    // Only the draft's author sees it; a corrupt draft falls back to the
    // published chart, as the chart read path does
    private async applyOpenChartDraft(
        account: Account,
        chart: SavedChartDAO,
    ): Promise<SavedChartDAO> {
        if (isJwtUser(account)) return chart;
        const draft = await this.contentDraftModel.findOpenDraft(
            chart.projectUuid,
            'chart',
            chart.uuid,
            account.user.userUuid,
        );
        if (!draft) return chart;
        try {
            return mergeDraftIntoChart(chart, draft.draft);
        } catch (error) {
            this.logger.warn(
                `Ignoring invalid chart draft ${draft.uuid} while running dashboard tile`,
                error,
            );
            return chart;
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
        includeUnpublishedDraft,
        sessionTimezone,
        preloadedSavedChart,
        preloadedProjectParameters,
    }: ExecuteAsyncDashboardChartQueryArgs): Promise<ApiExecuteAsyncDashboardChartQueryResults> {
        assertIsAccountWithOrg(account);

        const publishedChart =
            preloadedSavedChart ??
            (await this.savedChartModel.get(chartUuid, undefined, {
                projectUuid,
            }));
        const savedChart = includeUnpublishedDraft
            ? await this.applyOpenChartDraft(account, publishedChart)
            : publishedChart;
        const { organizationUuid, projectUuid: savedChartProjectUuid } =
            savedChart;

        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Chart does not belong to project');
        }

        const [space, { explore, userAccessControls }] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExploreWithUserAccessControls(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        let effectiveDashboardUuid: string | undefined = dashboardUuid;

        if (isJwtUser(account)) {
            const jwtDashboardContext = await this.getJwtDashboardQueryContext(
                account,
                projectUuid,
                dashboardUuid,
            );
            effectiveDashboardUuid = jwtDashboardContext.dashboardUuid;
        }

        if (!effectiveDashboardUuid) {
            throw new ForbiddenError(
                'JWT does not grant access to a dashboard',
            );
        }
        const resolvedDashboardUuid = effectiveDashboardUuid;

        await this.checkDashboardChartQueryPermissions(
            account,
            projectUuid,
            savedChart.uuid,
            space,
            savedChart.dashboardUuid,
        );

        // Fire-and-forget: analytics tracking is non-critical and shouldn't block query execution
        void this.analyticsModel
            .addChartViewEvent(
                savedChart.uuid,
                account.isRegisteredUser() ? account.user.id : null,
                resolvedDashboardUuid
                    ? {
                          source: 'dashboard',
                          dashboardUuid: resolvedDashboardUuid,
                      }
                    : undefined,
            )
            .catch((e) =>
                this.logger.warn('Failed to track chart view event', {
                    error: e,
                }),
            );

        const { metricQuery: metricQueryWithFilters, appliedDashboardFilters } =
            applyDashboardFiltersForTile({
                tileUuid,
                metricQuery: savedChart.metricQuery,
                dashboardFilters,
                explore,
            });

        const validatedDashboardSorts = getValidatedDashboardSorts(
            dashboardSorts,
            metricQueryWithFilters,
        );

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...metricQueryWithFilters,
            sorts: validatedDashboardSorts ?? savedChart.metricQuery.sorts,
        };

        const { maxLimit, csvCellsLimit } =
            await resolveOrganizationExportLimits(
                this.organizationSettingsModel,
                this.lightdashConfig.query,
                organizationUuid,
            );

        const metricQueryWithLimit = applyMetricQueryLimit(
            metricQueryWithDashboardOverrides,
            limit,
            csvCellsLimit,
            maxLimit,
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

        const baseQueryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: resolvedDashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        // Load project warehouse config once, shared by warehouse credentials and timezone resolution
        const { organizationWarehouseCredentialsUuid, queryTimezone } =
            await this.projectModel.getProjectWarehouseConfig(projectUuid);
        const projectTimezone =
            queryTimezone ?? this.lightdashConfig.query.timezone ?? 'UTC';

        // Run independent data loads in parallel to minimize Postgres round-trips
        const [
            warehouseCredentials,
            rawDashboardParameters,
            projectParameters,
        ] = await Promise.all([
            this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
                preloadedOrgWarehouseCredentialsUuid:
                    organizationWarehouseCredentialsUuid,
            }),
            this.dashboardModel.getDashboardParametersByIdOrSlug(
                resolvedDashboardUuid,
                projectUuid,
            ),
            preloadedProjectParameters ??
                this.projectParametersModel.find(projectUuid),
        ]);

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
        );

        const dashboardParameters = convertDashboardParametersToValuesMap(
            rawDashboardParameters,
        );

        // Combine default parameter values, dashboard parameters, and request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            dashboardParameters,
            projectParameters,
        );

        const requestParameters: ExecuteAsyncDashboardChartRequestParams = {
            tileUuid,
            chartUuid,
            context,
            dashboardUuid: resolvedDashboardUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoom,
            limit,
            parameters: combinedParameters,
        };

        const { fields, dateZoomApplied } = await this.getMetricQueryFields({
            metricQuery: metricQueryWithLimit,
            explore,
            warehouseSqlBuilder,
            projectUuid,
            dateZoom,
            preloadedProjectParameters: projectParameters,
        });

        const pivotConfiguration = pivotResults
            ? derivePivotConfigurationFromChart(
                  savedChart,
                  metricQueryWithLimit,
                  fields,
              )
            : undefined;

        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: metricQueryWithLimit,
            explore,
            dateZoom,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            pivotConfiguration,
            pivotDimensions: savedChart.pivotConfig?.columns,
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
            sessionTimezone,
            preloadedUserAccessControls: userAccessControls,
            preloadedProjectParameters: projectParameters,
            preloadedProjectTimezone: projectTimezone,
        });
        const fieldsWithOverrides = queryComposer.getFields();
        const parameterReferences = queryComposer.getParameterReferences();

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
                dashboardId: resolvedDashboardUuid,
            });
        }

        this.recordPreAggregateStats({
            projectUuid,
            exploreName: explore.name,
            routingDecision,
            chartUuid: savedChart.uuid,
            dashboardUuid: resolvedDashboardUuid,
            queryContext: context,
        });

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                baseQueryTags,
                queryComposer.getUserAccessControls(),
            );

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                organizationUuid,
                chart: { uuid: savedChart.uuid },
                context,
                queryTags: queryTagsWithUserAttributes,
                invalidateCache,
                queryComposer,
                originalColumns: undefined,
                warehouseCredentials,
                routingTarget: routingDecision.target,
                ...(routingDecision.target === 'pre_aggregate' && {
                    preAggregationRoute: routingDecision.route,
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
            metricQuery: queryComposer.getMetricQuery(),
            fields: fieldsWithOverrides,
            parameterReferences,
            usedParametersValues: queryComposer.getUsedParameters(),
            // In effect when a date dimension was overridden, or a grain is selected and
            // the chart references a reserved date-zoom parameter.
            dateZoomApplied:
                dateZoomApplied ||
                (!!dateZoom?.granularity &&
                    hasReservedParameterReference(parameterReferences)),
            resolvedTimezone: queryComposer.getDisplayTimezone(),
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
                    metadata: {
                        underlyingDataSourceQueryUuid,
                    },
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

        const { metricQuery, fields: metricQueryFields } =
            await this.queryHistoryModel.get(
                underlyingDataSourceQueryUuid,
                projectUuid,
                account,
            );

        const { exploreName } = metricQuery;

        const { explore, userAccessControls: preloadedUserAccessControls } =
            await this.getExploreWithUserAccessControls(
                account,
                projectUuid,
                exploreName,
                organizationUuid,
            );

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
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

        const baseQueryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
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

        const { maxLimit, csvCellsLimit } =
            await resolveOrganizationExportLimits(
                this.organizationSettingsModel,
                this.lightdashConfig.query,
                organizationUuid,
            );

        const underlyingDataMetricQueryWithLimit = applyMetricQueryLimit(
            underlyingDataMetricQuery,
            limit,
            csvCellsLimit,
            maxLimit,
        );

        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery: underlyingDataMetricQueryWithLimit,
            explore,
            dateZoom,
            warehouseSqlBuilder,
            parameters: combinedParameters,
            projectUuid,
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
            // PROD-880: rewrite WHERE LHS to zoom grain (safe here — filters are click-only)
            applyDateZoomToFilters: true,
            preloadedUserAccessControls,
        });

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                baseQueryTags,
                queryComposer.getUserAccessControls(),
            );

        const { queryUuid: underlyingDataQueryUuid, cacheMetadata } =
            await this.executeAsyncQuery(
                {
                    account,
                    projectUuid,
                    organizationUuid,
                    context,
                    queryTags: queryTagsWithUserAttributes,
                    invalidateCache,
                    queryComposer,
                    originalColumns: undefined,
                    warehouseCredentials,
                },
                requestParameters,
            );

        return {
            queryUuid: underlyingDataQueryUuid,
            cacheMetadata,
            metricQuery: queryComposer.getMetricQuery(),
            fields: queryComposer.getFields(),
            warnings: queryComposer.getWarnings(),
            parameterReferences: queryComposer.getParameterReferences(),
            usedParametersValues: queryComposer.getUsedParameters(),
            resolvedTimezone: queryComposer.getDisplayTimezone(),
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
        userAttributeOverrides,
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

        // Agent-run SQL is additionally constrained to the project's agent SQL
        // scope. Both the AI agent and the MCP run_sql tool land here, so this
        // is the one place a new agent SQL path cannot bypass. The human SQL
        // Runner is deliberately not scoped.
        if (isAgentScopedQueryContext(context)) {
            const sqlScope =
                await this.projectModel.getAgentSqlScope(projectUuid);
            const violations = findSqlScopeViolations(sql, sqlScope);
            if (violations.length > 0 && sqlScope) {
                this.logger.warn('Blocked out-of-scope agent SQL', {
                    projectUuid,
                    context,
                    references: violations.map((v) => v.reference),
                });
                throw new ForbiddenError(
                    formatSqlScopeError(violations, sqlScope),
                );
            }
        }

        // Combine default parameter values with request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            parameters,
        );

        const {
            warehouseConnection,
            warehouseCredentials,
            queryTags,
            queryComposer,
            originalColumns,
            parameterReferences,
            usedParameters,
        } = await this.prepareSqlChartAsyncQueryArgs({
            account,
            context,
            projectUuid,
            organizationUuid,
            sql,
            limit,
            parameters: combinedParameters,
            pivotConfiguration,
            userAttributeOverrides,
        });

        // Disconnect the ssh tunnel to avoid leaking connections, another client is created in the scheduler task
        await warehouseConnection.sshTunnel.disconnect();

        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                organizationUuid,
                queryTags,
                context,
                queryComposer,
                originalColumns,
                warehouseCredentials,
            },
            {
                sql,
                limit,
                pivotConfiguration,
                invalidateCache,
                parameters,
                context,
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

    /**
     * Validates and authorizes a compose query's references at submit time:
     * well-formed table names and query uuids, and each referenced query
     * authorized with the exact checks used when fetching its results by
     * uuid (the creator-scoped QueryHistoryModel.get lookup plus
     * throwIfCannotReadQueryHistory). The referenced query does NOT need to
     * be finished — waiting for results happens in the background execution
     * phase (waitForQueryReferences).
     */
    private async authorizeQueryReferences({
        account,
        projectUuid,
        organizationUuid,
        references,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        references: Record<string, string>;
    }): Promise<void> {
        const validTableName = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
        const validUuid =
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        // Each reference costs a DB lookup and authorization check in parallel
        const MAX_REFERENCES = 20;
        if (Object.keys(references).length > MAX_REFERENCES) {
            throw new ParameterError(
                `Too many references: maximum allowed is ${MAX_REFERENCES}`,
            );
        }

        await Promise.all(
            Object.entries(references).map(async ([tableName, queryUuid]) => {
                if (!validTableName.test(tableName)) {
                    throw new ParameterError(
                        `Invalid reference table name "${tableName}": use letters, digits and underscores, starting with a letter or underscore`,
                    );
                }
                if (!validUuid.test(queryUuid)) {
                    throw new ParameterError(
                        `Invalid query uuid "${queryUuid}" for reference "${tableName}"`,
                    );
                }

                const queryHistory = await this.queryHistoryModel.get(
                    queryUuid,
                    projectUuid,
                    account,
                );

                this.throwIfCannotReadQueryHistory(
                    account,
                    projectUuid,
                    organizationUuid,
                    queryHistory,
                );
            }),
        );
    }

    /**
     * Waits for every referenced query to complete and returns what each one
     * produced, keyed by the table name it is exposed under. This is the
     * whole of pipeline orchestration: a query that reads another query's
     * results starts once those results exist, and fails if the referenced
     * query fails. References must already be authorized
     * (authorizeQueryReferences).
     */
    private async waitForQueryReferences({
        account,
        projectUuid,
        references,
    }: {
        account: Account;
        projectUuid: string;
        references: Record<string, string>;
    }): Promise<Record<string, QueryHistory>> {
        const completed = await Promise.all(
            Object.entries(references).map(async ([tableName, queryUuid]) => {
                try {
                    const queryHistory =
                        await this.queryHistoryModel.pollForQueryCompletion({
                            queryUuid,
                            account,
                            projectUuid,
                            timeoutMs:
                                AsyncQueryService.REFERENCE_WAIT_TIMEOUT_MS,
                        });
                    return [tableName, queryHistory] as const;
                } catch (e) {
                    throw new ParameterError(
                        `Referenced query "${tableName}" (${queryUuid}) did not complete: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
            }),
        );
        return Object.fromEntries(completed);
    }

    /**
     * Builds one CTE per completed reference so the user SQL can select from
     * semantically-named tables: {"orders": "<queryUuid>"} exposes that
     * query's results as `orders`.
     */
    private buildQueryReferenceCtes(
        queryHistoryByTableName: Record<string, QueryHistory>,
    ): string[] {
        return Object.entries(queryHistoryByTableName).map(
            ([tableName, queryHistory]) => {
                if (
                    queryHistory.resultsExpiresAt &&
                    queryHistory.resultsExpiresAt < new Date()
                ) {
                    throw new ResultsExpiredError();
                }

                if (!queryHistory.resultsFileName) {
                    throw new NotFoundError(
                        `Result file not found for query ${queryHistory.queryUuid}`,
                    );
                }

                const storageClient = this.getResultsStorageClientForContext(
                    queryHistory.context,
                );
                const bucket = storageClient.configuration?.bucket;
                if (!storageClient.isEnabled || !bucket) {
                    throw new S3Error('S3 is not enabled');
                }

                const key = S3ResultsFileStorageClient.sanitizeFileExtension(
                    queryHistory.resultsFileName,
                );
                const table = getJsonlSqlTable(
                    `s3://${bucket}/${key}`,
                    queryHistory.columns,
                );

                return `${quoteDuckdbIdentifier(
                    tableName,
                )} AS (SELECT * FROM ${table})`;
            },
        );
    }

    /**
     * Runs raw SQL directly on the compose engine and streams results
     * through the standard async query pipeline, so results are polled with
     * getAsyncQueryResults like any other async query.
     *
     * The references map ({"orders": "<queryUuid>"}) exposes previous
     * queries' results files as named tables, gated by the exact access
     * checks of the results-by-uuid endpoint. Direct file access
     * (read_parquet, read_json, ...) in the user SQL is rejected, so
     * referenced results are the only data this endpoint can reach — which
     * is why run-queries access (interactive viewer and up) suffices.
     *
     * Threat model: the user authors the whole statement by design, so SQL
     * injection in the classic sense does not apply — the boundaries are
     * which data the statement can reach and what statement kinds run. The
     * textual file-access block on the raw SQL is backed by execution-time
     * validation inside the DuckDB client, which parses the final statement
     * with DuckDB itself (extractStatements) and rejects multiple
     * statements, non-SELECT statement types, and blocked functions;
     * escaping the CTE wrapper still lands inside that same sandbox on a
     * hardened instance (no extension autoload, no attach/install).
     */
    async executeAsyncComposeSqlQuery({
        account,
        projectUuid,
        sql,
        context,
        limit,
        references,
        parameters,
    }: ExecuteAsyncComposeSqlQueryArgs): Promise<ApiExecuteAsyncSqlQueryResults> {
        assertIsAccountWithOrg(account);

        const { enabled: isEndpointEnabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.ComposeSqlRunner,
        });
        if (!isEndpointEnabled) {
            throw new ForbiddenError('Compose SQL queries are not enabled');
        }

        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const { organizationUuid } = projectSummary;

        // Same ability that gates running a metric query from the explorer:
        // interactive viewers and up, but not plain viewers.
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Blocks read_parquet/read_json/... and file table paths in the raw
        // user SQL; the only file reads in the executed SQL are the reference
        // CTEs injected below after authorizing them.
        try {
            DuckdbWarehouseClient.validateUserSqlFileAccess(sql);
        } catch (e) {
            throw new ParameterError(getErrorMessage(e));
        }

        const normalizedReferences =
            references && Object.keys(references).length > 0
                ? references
                : undefined;
        if (normalizedReferences) {
            await this.authorizeQueryReferences({
                account,
                projectUuid,
                organizationUuid,
                references: normalizedReferences,
            });
        }

        // Throws MissingConfigError when results storage is not configured
        const warehouseClient =
            this.composeEngineClient.createExecutionWarehouseClient({
                storage: 'results',
            });

        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            parameters,
        );

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
        };

        // The row is created before references are resolved so the queryUuid
        // returns immediately even when referenced queries are still running;
        // compiled sql, fields and columns are filled in by the background
        // phase once referenced results exist.
        const placeholderComposer = new SqlQueryComposer({
            userSql: sql,
            columns: [],
            warehouseClient,
            pivotConfiguration: undefined,
            limit,
            parameters: combinedParameters,
            dashboardFilters: undefined,
            tileUuid: undefined,
            dashboardSorts: undefined,
        });

        AsyncQueryService.throwIfMissingParameterValues(placeholderComposer);

        // Parameter values change the executed SQL without changing its text
        const cacheKey = QueryHistoryModel.getCacheKey(projectUuid, {
            sql: JSON.stringify({
                sql,
                references: normalizedReferences ?? null,
                parameters: combinedParameters,
            }),
            userUuid: null,
        });

        const requestParameters: ExecuteAsyncComposeSqlQueryRequestParams = {
            sql,
            limit,
            context,
            references,
            parameters: combinedParameters,
        };

        const queryCreatedAt = new Date();
        const { queryUuid } = await this.queryHistoryModel.create(account, {
            projectUuid,
            organizationUuid,
            context,
            fields: {},
            compiledSql: sql,
            requestParameters,
            usedParameters: placeholderComposer.getUsedParameters(),
            metricQuery: placeholderComposer.getMetricQuery(),
            cacheKey,
            pivotConfiguration: null,
            originalColumns: {},
        });
        this.prometheusMetrics?.trackQueryStateTransition(
            'new',
            QueryHistoryStatus.PENDING,
            context,
        );

        const onboardingFlow = await this.getOnboardingFlow({
            userUuid: account.user.id,
            organizationUuid,
        });

        void this.runDuckdbQuery({
            account,
            projectUuid,
            organizationUuid,
            isPreviewProject:
                projectSummary.type === ProjectType.PREVIEW ||
                projectSummary.provisioningSource === 'playground',
            onboardingFlow,
            queryUuid,
            sql,
            references: {
                kind: 'queries',
                references: normalizedReferences ?? {},
                guard: null,
            },
            columns: {
                mode: 'discover',
                limit,
                parameters: combinedParameters,
            },
            storedCompiledSql: null,
            warehouseClient,
            queryTags,
            queryCreatedAt,
            cacheKey,
            context,
        }).catch((e) => {
            this.logger.error(
                `Async compose SQL query ${queryUuid} failed: ${getErrorMessage(
                    e,
                )}`,
            );
        });

        return {
            queryUuid,
            cacheMetadata: { cacheHit: false },
            parameterReferences: [],
            usedParametersValues: {},
            resolvedTimezone: null,
        };
    }

    /** Executes DuckDB SQL over versioned external tables without persisting file URIs. */
    async executeAsyncExternalSqlQuery({
        account,
        projectUuid,
        sql,
        context,
        limit,
        tables,
        parameters,
    }: ExecuteAsyncExternalSqlQueryArgs): Promise<ApiExecuteAsyncSqlQueryResults> {
        assertIsAccountWithOrg(account);

        const user = {
            userUuid: account.user.id,
            organizationUuid: account.organization.organizationUuid,
        };
        const [externalSourcesFlag, composeSqlFlag] = await Promise.all([
            this.featureFlagModel.get({
                user,
                featureFlagId: FeatureFlags.ExternalSources,
            }),
            this.featureFlagModel.get({
                user,
                featureFlagId: FeatureFlags.ComposeSqlRunner,
            }),
        ]);
        if (!externalSourcesFlag.enabled) {
            throw new ForbiddenError('External sources are not enabled');
        }
        if (!composeSqlFlag.enabled) {
            throw new ForbiddenError('Compose SQL queries are not enabled');
        }

        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const { organizationUuid } = projectSummary;

        // External SQL uses the same ability as compose SQL.
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        try {
            DuckdbWarehouseClient.validateUserSqlFileAccess(sql);
        } catch (e) {
            throw new ParameterError(getErrorMessage(e));
        }

        const tableEntries = Object.entries(tables);
        if (tableEntries.length === 0) {
            throw new ParameterError(
                'External SQL queries must name at least one external source table',
            );
        }
        const resolver = this.externalSourceTableResolver;
        if (!resolver) {
            throw new NotImplementedError(
                'External source queries need the enterprise DuckDB engine',
            );
        }

        const resolvedTables = await Promise.all(
            tableEntries.map(async ([tableName, reference]) => {
                const table = await resolver(projectUuid, reference);
                if (!table) {
                    throw new ParameterError(
                        `Unknown external source table "${reference}"`,
                    );
                }
                if (
                    table.external_source_scope ===
                        ExternalSourceScope.ATTACHMENT &&
                    table.external_source_created_by_user_uuid !==
                        account.user.id
                ) {
                    throw new ForbiddenError(
                        'This attachment belongs to another user',
                    );
                }
                if (!table.locator || !table.columns) {
                    throw new ParameterError(
                        `External source table "${reference}" has no ingested data yet. Refresh the source and try again`,
                    );
                }
                return {
                    tableName,
                    tableUuid: table.external_source_table_uuid,
                    version: table.version,
                    locator: table.locator,
                    columns: table.columns,
                };
            }),
        );

        const referenceCtes = resolvedTables.map(
            ({ tableName, locator, columns }) =>
                `${quoteDuckdbIdentifier(
                    tableName,
                )} AS (SELECT * FROM ${getDuckdbPreAggregateSqlTable(
                    locator,
                    columns,
                )})`,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            parameters,
        );

        // Table versions invalidate cached SQL results after refresh.
        const externalSourceSalt = resolvedTables
            .map(({ tableUuid, version }) => `esv:${tableUuid}:${version}`)
            .sort()
            .join('|');
        const cacheKey = QueryHistoryModel.getCacheKey(projectUuid, {
            sql: JSON.stringify({
                sql,
                tables: [...tableEntries].sort(([a], [b]) =>
                    a.localeCompare(b),
                ),
                parameters: combinedParameters,
            }),
            userUuid: null,
            externalSourceSalt,
        });

        // External-source files live in the pre-aggregates bucket, so the
        // session is that bucket's. Throws MissingConfigError without it
        const warehouseClient =
            this.composeEngineClient.createExecutionWarehouseClient({
                storage: 'externalSources',
                scope: null,
            });

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
        };

        const placeholderComposer = new SqlQueryComposer({
            userSql: sql,
            columns: [],
            warehouseClient,
            pivotConfiguration: undefined,
            limit,
            parameters: combinedParameters,
            dashboardFilters: undefined,
            tileUuid: undefined,
            dashboardSorts: undefined,
        });

        AsyncQueryService.throwIfMissingParameterValues(placeholderComposer);

        const requestParameters: ExecuteAsyncExternalSqlQueryRequestParams = {
            sql,
            limit,
            context,
            tables,
            parameters: combinedParameters,
        };

        const queryCreatedAt = new Date();
        const { queryUuid } = await this.queryHistoryModel.create(account, {
            projectUuid,
            organizationUuid,
            context,
            fields: {},
            compiledSql: sql,
            requestParameters,
            usedParameters: placeholderComposer.getUsedParameters(),
            metricQuery: placeholderComposer.getMetricQuery(),
            cacheKey,
            pivotConfiguration: null,
            originalColumns: {},
        });
        this.prometheusMetrics?.trackQueryStateTransition(
            'new',
            QueryHistoryStatus.PENDING,
            context,
        );

        const onboardingFlow = await this.getOnboardingFlow({
            userUuid: account.user.id,
            organizationUuid,
        });

        void this.runDuckdbQuery({
            account,
            projectUuid,
            organizationUuid,
            isPreviewProject:
                projectSummary.type === ProjectType.PREVIEW ||
                projectSummary.provisioningSource === 'playground',
            onboardingFlow,
            queryUuid,
            sql,
            references: { kind: 'bound', referenceCtes },
            columns: {
                mode: 'discover',
                limit,
                parameters: combinedParameters,
            },
            // Only persist the user SQL; resolved SQL contains private URIs.
            storedCompiledSql: sql,
            warehouseClient,
            queryTags,
            queryCreatedAt,
            cacheKey,
            context,
        }).catch((e) => {
            this.logger.error(
                `Async external SQL query ${queryUuid} failed: ${getErrorMessage(
                    e,
                )}`,
            );
        });

        return {
            queryUuid,
            cacheMetadata: { cacheHit: false },
            parameterReferences: [],
            usedParametersValues: {},
            resolvedTimezone: null,
        };
    }

    /** How long a compose query waits for a referenced query's results. */
    private static readonly REFERENCE_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

    /** The wrap keeps reference CTEs valid for SQL that starts with its own WITH chain. */
    private static wrapSqlWithReferenceCtes(
        sql: string,
        referenceCtes: string[],
    ): string {
        return referenceCtes.length > 0
            ? `WITH ${referenceCtes.join(
                  ',\n',
              )}\nSELECT * FROM (\n${sql}\n) AS lightdash_user_query`
            : sql;
    }

    /** Refuses at submit time, before a query history row exists. */
    private static throwIfMissingParameterValues(
        composer: SqlQueryComposer,
    ): void {
        const missing = composer.getMissingParameterReferences();
        if (missing.length > 0) {
            throw new ParameterError(
                `Missing values for SQL parameter(s): ${missing.join(', ')}`,
                { missingReferences: missing },
            );
        }
    }

    /**
     * The one execution tail for DuckDB queries over referenced results,
     * whatever submitted them: bind the references, resolve the output
     * columns, then execute through the standard async pipeline. Failures
     * before execution mark the query history row errored so pollers see
     * them through the standard status lifecycle.
     */
    private async runDuckdbQuery({
        account,
        projectUuid,
        organizationUuid,
        isPreviewProject,
        onboardingFlow,
        queryUuid,
        sql,
        references,
        columns,
        storedCompiledSql,
        warehouseClient,
        queryTags,
        queryCreatedAt,
        cacheKey,
        context,
    }: RunDuckdbQueryArgs): Promise<void> {
        try {
            const referenceCtes = await this.bindDuckdbQueryReferences({
                account,
                projectUuid,
                references,
            });
            const resolvedSql = AsyncQueryService.wrapSqlWithReferenceCtes(
                sql,
                referenceCtes,
            );
            const execution = await this.resolveDuckdbQueryColumns({
                resolvedSql,
                columns,
                warehouseClient,
                queryTags,
            });

            await this.queryHistoryModel.update(
                queryUuid,
                projectUuid,
                {
                    compiled_sql: storedCompiledSql ?? execution.query,
                    fields: execution.fieldsMap,
                    original_columns: execution.originalColumns,
                },
                account,
            );

            // Always run in-process with the DuckDB client override: the NATS
            // pre-aggregate consumer falls back to the project warehouse on
            // DuckDB errors, which must never happen for SQL written for
            // DuckDB.
            this.prometheusMetrics?.trackQueryStateTransition(
                QueryHistoryStatus.PENDING,
                QueryHistoryStatus.EXECUTING,
                context,
            );
            this.prometheusMetrics?.observeQueueWaitDuration(0, context);

            await this.runAsyncWarehouseQuery({
                userUuid: account.user.id,
                organizationUuid,
                isPreviewProject,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
                onboardingFlow,
                projectUuid,
                queryUuid,
                queryTags,
                query: execution.query,
                fieldsMap: execution.fieldsMap,
                usedParameters: execution.usedParameters,
                cacheKey,
                pivotConfiguration: execution.pivotConfiguration,
                originalColumns: execution.originalColumns,
                queryCreatedAt,
                displayTimezone: null,
                warehouseClientOverride: warehouseClient,
                warehouseCredentialsTypeOverride:
                    warehouseClient.credentials.type,
            });
        } catch (e) {
            await this.queryHistoryModel.update(
                queryUuid,
                projectUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: getErrorMessage(e),
                    errored_at: new Date(),
                },
                account,
            );
        }
    }

    /**
     * Resolves a query's references to the CTEs that expose them. Referenced
     * queries are waited on, then the guard runs before anything is built,
     * so a refusal never costs an execution.
     */
    private async bindDuckdbQueryReferences({
        account,
        projectUuid,
        references,
    }: {
        account: Account;
        projectUuid: string;
        references: DuckdbQueryReferences;
    }): Promise<string[]> {
        switch (references.kind) {
            case 'bound':
                return references.referenceCtes;
            case 'queries': {
                const completed = await this.waitForQueryReferences({
                    account,
                    projectUuid,
                    references: references.references,
                });
                const refusal = references.guard?.(completed) ?? null;
                if (refusal !== null) throw new ParameterError(refusal);
                return this.buildQueryReferenceCtes(completed);
            }
            default:
                return assertUnreachable(
                    references,
                    'Unknown DuckDB query reference kind',
                );
        }
    }

    /**
     * Discover mode probes the SQL and compiles it around the columns found;
     * supplied mode executes with the caller's compile-time fields, columns
     * and pivot as they are.
     */
    private async resolveDuckdbQueryColumns({
        resolvedSql,
        columns,
        warehouseClient,
        queryTags,
    }: {
        resolvedSql: string;
        columns: DuckdbQueryColumns;
        warehouseClient: WarehouseClient;
        queryTags: RunQueryTags;
    }): Promise<DuckdbQueryExecution> {
        switch (columns.mode) {
            case 'supplied':
                return {
                    query: resolvedSql,
                    fieldsMap: columns.fieldsMap,
                    usedParameters: columns.usedParameters,
                    originalColumns: columns.originalColumns,
                    pivotConfiguration: columns.pivotConfiguration,
                };
            case 'discover':
                return this.discoverDuckdbQueryColumns({
                    resolvedSql,
                    limit: columns.limit,
                    parameters: columns.parameters,
                    warehouseClient,
                    queryTags,
                });
            default:
                return assertUnreachable(
                    columns,
                    'Unknown DuckDB query columns mode',
                );
        }
    }

    private async discoverDuckdbQueryColumns({
        resolvedSql,
        limit,
        parameters,
        warehouseClient,
        queryTags,
    }: {
        resolvedSql: string;
        limit: number | undefined;
        parameters: ParametersValuesMap;
        warehouseClient: WarehouseClient;
        queryTags: RunQueryTags;
    }): Promise<DuckdbQueryExecution> {
        // Column discovery (LIMIT 1) also validates the SQL, so
        // parameters resolve first and a missing value refuses here
        const { replacedSql: sqlWithParameters, missingReferences } =
            safeReplaceParametersWithSqlBuilder(
                resolvedSql,
                parameters,
                warehouseClient,
            );
        if (missingReferences.size > 0) {
            const missing = Array.from(missingReferences);
            throw new ParameterError(
                `Missing values for SQL parameter(s): ${missing.join(', ')}`,
                { missingReferences: missing },
            );
        }
        const columns: { name: string; type: DimensionType }[] = [];
        const columnDiscoverySql = applyLimitToSqlQuery({
            sqlQuery: sqlWithParameters,
            limit: 1,
        });
        try {
            await warehouseClient.streamQuery(
                columnDiscoverySql,
                (chunk) => {
                    if (columns.length === 0 && chunk.fields) {
                        Object.keys(chunk.fields).forEach((key) => {
                            columns.push({
                                name: key,
                                type: chunk.fields[key].type,
                            });
                        });
                    }
                },
                { tags: queryTags },
            );
        } catch (e) {
            // The DuckDB client throws raw errors (validation + engine)
            if (e instanceof LightdashError) throw e;
            throw new WarehouseQueryError(getErrorMessage(e));
        }

        const composer = new SqlQueryComposer({
            userSql: resolvedSql,
            columns,
            warehouseClient,
            pivotConfiguration: undefined,
            limit,
            parameters,
            dashboardFilters: undefined,
            tileUuid: undefined,
            dashboardSorts: undefined,
        });

        // Compose columns carry only the reference, the probed type, and
        // a label derived from the reference. Metadata is never inferred
        // from the referenced queries' columns.
        const originalColumns: ResultColumns = columns.reduce((acc, col) => {
            acc[col.name] = {
                reference: col.name,
                type: col.type,
                label: friendlyName(col.name),
            };
            return acc;
        }, {} as ResultColumns);

        return {
            query: composer.getSql({
                columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
            }),
            fieldsMap: composer.getFields(),
            usedParameters: composer.getUsedParameters(),
            originalColumns,
            pivotConfiguration: undefined,
        };
    }

    /**
     * Validates, prepares and starts a merge through one interface.
     *
     * Validation is data rather than an HTTP failure so the editor can attach
     * errors to the source that caused them. A valid compilation is passed
     * into execution and never repeated.
     */
    async executeAsyncMergeQuery(
        args: ExecuteAsyncMergeQueryArgs,
    ): Promise<ApiExecuteAsyncMergeQueryResults> {
        const { chart, ...execution } = args;
        return this.executeAsyncMergeQueryInternal({
            ...execution,
            pivotInput: chart ? { type: 'chart', chart } : undefined,
        });
    }

    /** Execute a merge query and wait for all results. */
    async executeMergeQueryAndGetResults(
        args: ExecuteAsyncMergeQueryArgs,
        pollingOptions?: PollingOptions,
    ): Promise<{
        queryUuid: string;
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
        metricQuery: MetricQuery;
    }> {
        const { account, projectUuid } = args;
        const outcome = await this.executeAsyncMergeQuery(args);
        if (outcome.outcome === 'refused') {
            throw new ParameterError(formatMergeQueryRefusal(outcome.errors), {
                errors: outcome.errors,
            });
        }

        const { queryUuid, cacheMetadata, fields, metricQuery } = outcome.query;
        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });
        const results = await this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });
        return { queryUuid, metricQuery, ...results };
    }

    /** Compatibility seam for the v1 endpoint's already-derived pivot. */
    async executeLegacyAsyncMergeQuery({
        pivotConfiguration,
        ...execution
    }: Omit<ExecuteAsyncMergeQueryArgs, 'chart'> & {
        pivotConfiguration?: PivotConfiguration;
    }): Promise<ApiExecuteAsyncMergeQueryResults> {
        return this.executeAsyncMergeQueryInternal({
            ...execution,
            pivotInput: pivotConfiguration
                ? { type: 'resolved', configuration: pivotConfiguration }
                : undefined,
        });
    }

    private async executeAsyncMergeQueryInternal({
        account,
        projectUuid,
        mergeQuery,
        context,
        invalidateCache,
        parameters,
        mode,
        pivotInput,
        userAttributeOverrides,
    }: ExecuteMergeQueryInternalArgs): Promise<ApiExecuteAsyncMergeQueryResults> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const effectiveMergeQuery =
            mode.type === 'export'
                ? applyMergeExportLimit({
                      mergeQuery,
                      requestedRows: mode.limit,
                      csvCellsLimit: (
                          await resolveOrganizationExportLimits(
                              this.organizationSettingsModel,
                              this.lightdashConfig.query,
                              organizationUuid,
                          )
                      ).csvCellsLimit,
                  })
                : mergeQuery;
        const compiledMerge = await this.compileMergeQuery({
            account,
            projectUuid,
            mergeQuery: effectiveMergeQuery,
            parameters,
            userAttributeOverrides,
        });
        if (!isComposableCompiledMergeQuery(compiledMerge)) {
            return {
                outcome: 'refused',
                errors: compiledMerge.errors,
                parameterReferences: compiledMerge.parameterReferences,
                fieldOrigins: compiledMerge.fieldOrigins,
            };
        }

        const columnOrder = Object.values(compiledMerge.fieldIdByColumn);
        const pivotConfiguration = (() => {
            if (pivotInput?.type === 'resolved') {
                return pivotInput.configuration;
            }
            if (pivotInput?.type === 'chart') {
                return derivePivotConfigurationFromChart(
                    pivotInput.chart,
                    buildMergeResultMetricQuery({
                        itemsMap: compiledMerge.itemsMap,
                        columnOrder,
                        limit: effectiveMergeQuery.limit,
                    }),
                    compiledMerge.itemsMap,
                );
            }
            return undefined;
        })();

        const composeQuery = await this.tryExecuteComposeMergeQuery({
            account,
            projectUuid,
            organizationUuid,
            mergeQuery: effectiveMergeQuery,
            context,
            invalidateCache,
            parameters,
            userAttributeOverrides,
            pivotConfiguration,
            compiledMerge,
        });
        if (composeQuery !== null) {
            return {
                outcome: 'started',
                query: composeQuery,
                parameterReferences: compiledMerge.parameterReferences,
                fieldOrigins: compiledMerge.fieldOrigins,
            };
        }

        // Result sources and external source tables have no warehouse
        // statement to fall back to
        if (compiledMerge.requiresCompose) {
            return {
                outcome: 'refused',
                errors: [
                    {
                        kind: MergeQueryErrorKind.COMPOSE_REQUIRED,
                        sourceId: null,
                        fieldIds: [],
                        message:
                            'This merge reads existing query results or external source tables, which need the compose engine. It is not enabled or not available on this instance.',
                    },
                ],
                parameterReferences: compiledMerge.parameterReferences,
                fieldOrigins: compiledMerge.fieldOrigins,
            };
        }

        if (!isRunnableCompiledMergeQuery(compiledMerge)) {
            return {
                outcome: 'refused',
                errors: compiledMerge.errors,
                parameterReferences: compiledMerge.parameterReferences,
                fieldOrigins: compiledMerge.fieldOrigins,
            };
        }

        const query = await this.executeCompiledAsyncMergeQuery({
            account,
            projectUuid,
            organizationUuid,
            mergeQuery: effectiveMergeQuery,
            context,
            invalidateCache,
            parameters,
            pivotConfiguration,
            compiledMerge,
            userAttributeOverrides,
        });

        return {
            outcome: 'started',
            query,
            parameterReferences: compiledMerge.parameterReferences,
            fieldOrigins: compiledMerge.fieldOrigins,
        };
    }

    /**
     * Runs a merge as one statement on the org's own warehouse.
     *
     * The compile is the merge: both sides become CTEs of one statement in
     * the warehouse's dialect, and that statement runs through the ordinary
     * async tail — query history, paging, formatting, pivoting, caching and
     * downloads all behave as for any other query. Nothing materialises to
     * S3 and nothing runs anywhere but the project warehouse.
     */
    private async executeCompiledAsyncMergeQuery({
        account,
        projectUuid,
        mergeQuery,
        context,
        invalidateCache,
        pivotConfiguration,
        parameters,
        organizationUuid,
        compiledMerge,
        userAttributeOverrides,
    }: ExecuteCompiledAsyncMergeQueryArgs): Promise<ApiExecuteAsyncMetricQueryResults> {
        // Only for composing SQL — quoting and the pivot stage need the
        // dialect. The async runtime opens its own connection to execute.
        const [warehouseCredentials, userAccessControls] = await Promise.all([
            this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
            this.getUserAttributes({ account }),
        ]);
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            warehouseCredentials,
        );

        let composer: MergeQueryComposer;
        try {
            composer = new MergeQueryComposer({
                coreSql: compiledMerge.coreSql,
                terminalWrapper: compiledMerge.terminalWrapper,
                itemsMap: compiledMerge.itemsMap,
                typedColumns: compiledMerge.typedColumns,
                columnOrder: Object.values(compiledMerge.fieldIdByColumn),
                limit: mergeQuery.limit,
                parameterReferences: compiledMerge.parameterReferences,
                usedParametersValues: compiledMerge.usedParametersValues,
                warehouseClient,
                pivotConfiguration,
            });
        } finally {
            await sshTunnel.disconnect();
        }

        const baseQueryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
        };
        const queryTags = AsyncQueryService.addUserAttributeQueryTags(
            baseQueryTags,
            userAttributeOverrides
                ? {
                      ...userAccessControls,
                      userAttributes: {
                          ...userAccessControls.userAttributes,
                          ...userAttributeOverrides,
                      },
                  }
                : userAccessControls,
        );
        // Routing guarantees this: merges with result sources never reach
        // the warehouse path (they require the compose engine)
        if (!isMetricSourcedMergeQuery(mergeQuery)) {
            throw new UnexpectedServerError(
                'A merge with result sources cannot run as a warehouse statement',
            );
        }
        const requestParameters: ExecuteAsyncMergeQueryRequestParams = {
            context,
            invalidateCache,
            mergeQuery,
            parameters,
            pivotConfiguration,
        };
        const { queryUuid, cacheMetadata } = await this.executeAsyncQuery(
            {
                account,
                projectUuid,
                organizationUuid,
                context,
                queryTags,
                invalidateCache,
                queryComposer: composer,
                warehouseCredentials,
                routingTarget: 'warehouse',
            },
            requestParameters,
        );

        return {
            queryUuid,
            cacheMetadata,
            metricQuery: composer.getMetricQuery(),
            fields: composer.getFields(),
            warnings: composer.getWarnings(),
            parameterReferences: composer.getParameterReferences(),
            usedParametersValues: composer.getUsedParameters(),
            resolvedTimezone: composer.getDisplayTimezone(),
        };
    }

    /**
     * Runs a merge as composition when the merge-on-compose flag is on and
     * the compose engine is available; returns null to fall back to the
     * single-statement warehouse merge otherwise.
     *
     * Each source executes as its own metric query — inheriting that query's
     * access rules and the metric-query result cache — and the DuckDB
     * compose engine joins the materialized results. The join is the same
     * MergeQueryBuilder assembly as the warehouse statement, in the DuckDB
     * dialect over reference tables, so join semantics are shared by
     * construction. Submission never blocks on the legs: the background
     * phase waits for their results through the standard reference wait.
     */
    private async tryExecuteComposeMergeQuery({
        account,
        projectUuid,
        organizationUuid,
        mergeQuery,
        context,
        invalidateCache,
        parameters,
        userAttributeOverrides,
        pivotConfiguration,
        compiledMerge,
    }: {
        account: Account;
        projectUuid: string;
        organizationUuid: string;
        mergeQuery: MergeQuery;
        context: QueryExecutionContext;
        invalidateCache: boolean | undefined;
        parameters: ParametersValuesMap | undefined;
        userAttributeOverrides: UserAttributeValueMap | undefined;
        pivotConfiguration: PivotConfiguration | undefined;
        compiledMerge: ComposableCompiledMergeQuery;
    }): Promise<ApiExecuteAsyncMetricQueryResults | null> {
        assertIsAccountWithOrg(account);

        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.MergeOnCompose,
        });
        if (!enabled) return null;

        // Throws MissingConfigError when results storage is not configured:
        // a merge without an engine is refused, never silently downgraded
        const warehouseClient =
            this.composeEngineClient.createExecutionWarehouseClient({
                storage: 'results',
            });

        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const sourceRowCap = this.lightdashConfig.query.maxLimit;

        // Metric sources run whole (the merged statement sorts and limits,
        // and a side is never silently truncated below the source row cap);
        // result sources are already materialized and join as they are —
        // referencing them costs no warehouse query at all.
        const legs = await Promise.all(
            mergeQuery.sources.map(async (source) => {
                if (isMergeResultSource(source)) {
                    return [source.id, source.queryUuid] as const;
                }
                const leg = await this.executeAsyncMetricQuery({
                    account,
                    projectUuid,
                    context,
                    invalidateCache,
                    parameters,
                    userAttributeOverrides,
                    metricQuery: {
                        ...source.metricQuery,
                        sorts: [],
                        limit: sourceRowCap,
                    },
                });
                return [source.id, leg.queryUuid] as const;
            }),
        );
        const legQueryUuidBySourceId = Object.fromEntries(legs);

        const fieldTypes = await this.getMergeFieldTypesForQuery(
            account,
            projectUuid,
            mergeQuery,
        );
        const columnOrder = Object.values(compiledMerge.fieldIdByColumn);
        const { coreSql, terminalWrapper, referenceTableBySourceId } =
            buildComposeMergeSql({
                sources: mergeQuery.sources.map((source) => ({
                    id: source.id,
                    valueColumns: Object.keys(
                        compiledMerge.columns.valueColumnBySourceColumn[
                            source.id
                        ] ?? {},
                    ),
                })),
                joinKey: mergeQuery.joinKey,
                joinType: mergeQuery.joinType,
                tableCalculations: mergeQuery.tableCalculations,
                fieldTypes,
                outputAliasByColumn: compiledMerge.fieldIdByColumn,
                limit: Math.min(mergeQuery.limit, sourceRowCap),
            });

        // The same composer as the warehouse merge, with the compose engine
        // as the dialect: the pivot stage and terminal wrapper compile for
        // DuckDB through the one shared seam
        const composer = new MergeQueryComposer({
            coreSql,
            terminalWrapper,
            itemsMap: compiledMerge.itemsMap,
            typedColumns: compiledMerge.typedColumns,
            columnOrder,
            limit: mergeQuery.limit,
            parameterReferences: compiledMerge.parameterReferences,
            usedParametersValues: compiledMerge.usedParametersValues,
            warehouseClient,
            pivotConfiguration,
        });
        const sql = composer.getSql({
            columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
        });
        const fieldsMap = composer.getFields();

        // Merge table calculations carry user-authored SQL into the DuckDB
        // statement, so the same file-access block as raw compose SQL applies
        try {
            DuckdbWarehouseClient.validateUserSqlFileAccess(sql);
        } catch (e) {
            throw new ParameterError(getErrorMessage(e));
        }

        const references = Object.fromEntries(
            Object.entries(referenceTableBySourceId).map(
                ([sourceId, tableName]) => [
                    tableName,
                    legQueryUuidBySourceId[sourceId],
                ],
            ),
        );
        const labelBySourceId = getMergeSourceLabels({
            sources: mergeQuery.sources,
            typedColumns: compiledMerge.typedColumns,
            itemsMap: compiledMerge.itemsMap,
        });
        // Only the legs this merge ran are checked against the cap; a
        // referenced result's row count is its own query's concern
        const legLabelByReferenceTable = Object.fromEntries(
            mergeQuery.sources
                .filter(isMergeMetricSource)
                .map((source) => [
                    referenceTableBySourceId[source.id],
                    labelBySourceId[source.id],
                ]),
        );
        await this.authorizeQueryReferences({
            account,
            projectUuid,
            organizationUuid,
            references,
        });

        const originalColumns: ResultColumns = buildComposeMergeOriginalColumns(
            {
                typedColumns: compiledMerge.typedColumns,
                itemsMap: compiledMerge.itemsMap,
                usedParametersValues: compiledMerge.usedParametersValues,
                legQueryUuidBySourceId,
            },
        );

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
        };

        // Keyed to the user: legs compile under per-user attributes, so the
        // merged result is per-user too
        const cacheKey = QueryHistoryModel.getCacheKey(projectUuid, {
            sql: JSON.stringify({ mergeSql: sql, references }),
            userUuid: account.user.id,
        });

        const requestParameters: ExecuteAsyncComposeMergeQueryRequestParams = {
            context,
            invalidateCache,
            mergeQuery,
            parameters,
            pivotConfiguration,
        };

        const queryCreatedAt = new Date();
        const { queryUuid } = await this.queryHistoryModel.create(account, {
            projectUuid,
            organizationUuid,
            context,
            fields: fieldsMap,
            compiledSql: sql,
            requestParameters,
            usedParameters: composer.getUsedParameters(),
            metricQuery: composer.getMetricQuery(),
            cacheKey,
            pivotConfiguration: pivotConfiguration ?? null,
            originalColumns,
        });
        this.prometheusMetrics?.trackQueryStateTransition(
            'new',
            QueryHistoryStatus.PENDING,
            context,
        );

        const onboardingFlow = await this.getOnboardingFlow({
            userUuid: account.user.id,
            organizationUuid,
        });

        void this.runDuckdbQuery({
            account,
            projectUuid,
            organizationUuid,
            isPreviewProject:
                projectSummary.type === ProjectType.PREVIEW ||
                projectSummary.provisioningSource === 'playground',
            onboardingFlow,
            queryUuid,
            sql,
            references: {
                kind: 'queries',
                references,
                guard: buildMergeRowCapGuard({
                    legLabelByReferenceTable,
                    sourceRowCap,
                }),
            },
            columns: {
                mode: 'supplied',
                fieldsMap,
                usedParameters: composer.getUsedParameters(),
                originalColumns,
                pivotConfiguration,
            },
            storedCompiledSql: null,
            warehouseClient,
            queryTags,
            queryCreatedAt,
            cacheKey,
            context,
        }).catch((e) => {
            this.logger.error(
                `Async compose merge query ${queryUuid} failed: ${getErrorMessage(
                    e,
                )}`,
            );
        });

        return {
            queryUuid,
            cacheMetadata: { cacheHit: false },
            metricQuery: composer.getMetricQuery(),
            fields: fieldsMap,
            warnings: composer.getWarnings(),
            parameterReferences: composer.getParameterReferences(),
            usedParametersValues: composer.getUsedParameters(),
            resolvedTimezone: composer.getDisplayTimezone(),
        };
    }

    /**
     * Result sources resolve from the caller's own query history: creator-
     * scoped lookup, READY with unexpired results, and stored field metadata
     * to validate and type the merge against. Failures phrase as fragments —
     * the compiler prefixes them with the source at fault.
     */
    protected async getMergeResultSourceMetadata(
        account: Account,
        projectUuid: string,
        queryUuid: string,
    ): Promise<{ metricQuery: MetricQuery; fields: ItemsMap }> {
        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );
        if (queryHistory.status !== QueryHistoryStatus.READY) {
            throw new ParameterError(
                `its results are not ready (status: ${queryHistory.status}).`,
            );
        }
        if (
            queryHistory.resultsExpiresAt &&
            queryHistory.resultsExpiresAt < new Date()
        ) {
            throw new ParameterError(
                'its results have expired. Re-run the query and merge the new result.',
            );
        }
        if (Object.keys(queryHistory.fields).length === 0) {
            throw new ParameterError(
                'its results carry no field metadata to merge on.',
            );
        }
        return {
            metricQuery: queryHistory.metricQuery,
            fields: queryHistory.fields,
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
        pivotConfiguration,
        chartUuid,
        dashboardUuid,
        userAttributeOverrides,
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
        pivotConfiguration?: PivotConfiguration;
        chartUuid?: string;
        dashboardUuid?: string;
        userAttributeOverrides?: UserAttributeValueMap;
    }) {
        const startTime = performance.now();

        // 1. Warehouse Client & Credentials + 2. User Attributes
        // These are independent, so load them in parallel.
        const sectionStartWarehouse = performance.now();
        const [
            warehouseCredentials,
            { userAttributes: baseUserAttributes, intrinsicUserAttributes },
        ] = await Promise.all([
            this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
            this.getUserAttributes({ account }),
        ]);
        const userAttributes = userAttributeOverrides
            ? { ...baseUserAttributes, ...userAttributeOverrides }
            : baseUserAttributes;
        const warehouseConnection = await this._getWarehouseClient(
            projectUuid,
            warehouseCredentials,
        );

        const baseQueryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            ...AsyncQueryService.getSchedulerQueryTags(),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            query_context: context,
            ...(chartUuid ? { chart_uuid: chartUuid } : {}),
            ...(dashboardUuid ? { dashboard_uuid: dashboardUuid } : {}),
        };
        const queryTags = AsyncQueryService.addUserAttributeQueryTags(
            baseQueryTags,
            { userAttributes, intrinsicUserAttributes },
        );
        const durationWarehouseAndUserAttributes =
            performance.now() - sectionStartWarehouse;

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
        const {
            replacedSql: columnDiscoverySql,
            missingReferences: columnDiscoveryMissingParameters,
        } = safeReplaceParametersWithSqlBuilder(
            sqlWithUserAttributes,
            parameters ?? {},
            warehouseConnection.warehouseClient,
        );

        if (columnDiscoveryMissingParameters.size > 0) {
            const missing = Array.from(columnDiscoveryMissingParameters);
            throw new ParameterError(
                `Missing values for SQL parameter(s): ${missing.join(', ')}`,
                { missingReferences: missing },
            );
        }

        const limitedColumnDiscoverySql = applyLimitToSqlQuery({
            sqlQuery: columnDiscoverySql,
            limit: 1,
        });
        this.logger.info('column_discovery.started', {
            event: 'column_discovery.started',
            projectUuid,
            sqlBytes: Buffer.byteLength(limitedColumnDiscoverySql, 'utf8'),
            ...queryTags,
        });
        try {
            await warehouseConnection.warehouseClient.streamQuery(
                limitedColumnDiscoverySql,
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
        } catch (e) {
            const durationMs = performance.now() - sectionStartColumnDiscovery;
            this.logger.error('column_discovery.failed', {
                event: 'column_discovery.failed',
                projectUuid,
                durationMs,
                sqlBytes: Buffer.byteLength(limitedColumnDiscoverySql, 'utf8'),
                errorName: e instanceof Error ? e.name : undefined,
                errorCode: (e as { code?: string })?.code,
                errorMessage: getErrorMessage(e),
                ...queryTags,
            });
            await warehouseConnection.sshTunnel.disconnect();
            throw e;
        }
        const durationColumnDiscovery =
            performance.now() - sectionStartColumnDiscovery;
        this.logger.info('column_discovery.completed', {
            event: 'column_discovery.completed',
            projectUuid,
            durationMs: durationColumnDiscovery,
            sqlBytes: Buffer.byteLength(limitedColumnDiscoverySql, 'utf8'),
            columnCount: columns.length,
            ...queryTags,
        });

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

        // Pivot comes from the request (SQL runner) or the chart config
        // (saved/dashboard SQL charts).
        const resolvedPivotConfiguration: PivotConfiguration | undefined =
            pivotConfiguration ??
            (config && !isVizTableConfig(config) && config.fieldConfig
                ? {
                      indexColumn: config.fieldConfig.x,
                      valuesColumns: config.fieldConfig.y,
                      groupByColumns: config.fieldConfig.groupBy,
                      sortBy: config.fieldConfig.sortBy,
                  }
                : undefined);

        const composer = new SqlQueryComposer({
            userSql: sqlWithUserAttributes,
            columns,
            warehouseClient: warehouseConnection.warehouseClient,
            pivotConfiguration: resolvedPivotConfiguration,
            limit,
            parameters,
            dashboardFilters,
            tileUuid,
            dashboardSorts,
        });
        const durationQueryBuilding =
            performance.now() - sectionStartQueryBuilding;

        const sectionStartSqlGeneration = performance.now();
        const compiled = composer.compile();
        const durationSqlGeneration =
            performance.now() - sectionStartSqlGeneration;

        const totalTime = performance.now() - startTime;

        this.logger.info(
            `prepareSqlChartAsyncQueryArgs completed in ${totalTime.toFixed(2)}`,
            {
                event: 'prepare_sql_chart_async_query_args.completed',
                projectUuid,
                totalTimeMs: totalTime,
                warehouseAndUserAttributesMs:
                    durationWarehouseAndUserAttributes,
                columnDiscoveryMs: durationColumnDiscovery,
                queryBuildingMs: durationQueryBuilding,
                sqlGenerationMs: durationSqlGeneration,
                ...queryTags,
            },
        );

        return {
            metricQuery: composer.getMetricQuery(),
            pivotConfiguration: composer.getPivotConfiguration(),
            virtualView: composer.getExplore(),
            queryTags,
            warehouseConnection,
            warehouseCredentials,
            queryComposer: composer,
            parameterReferences: Array.from(compiled.parameterReferences),
            missingParameterReferences: Array.from(
                compiled.missingParameterReferences,
            ),
            appliedDashboardFilters: composer.getAppliedDashboardFilters(),
            originalColumns,
            usedParameters: compiled.usedParameters,
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
            warehouseCredentials,
            queryTags,
            metricQuery,
            queryComposer,
            originalColumns,
            parameterReferences,
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
                organizationUuid: sqlChart.organization.organizationUuid,
                chart: { uuid: sqlChart.savedSqlUuid },
                queryTags,
                context,
                queryComposer,
                originalColumns,
                warehouseCredentials,
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
            dashboardUuid: requestDashboardUuid,
            context,
            invalidateCache,
            dashboardFilters,
            dashboardSorts,
            limit,
        } = args;

        let dashboardUuid: string | undefined = requestDashboardUuid;

        // For JWT users without write actions, the dashboard scope is bound to
        // the token. Write-action embeds may use a dashboard from their write
        // space so newly added draft tiles can preview with dashboard context.
        if (isJwtUser(account)) {
            const jwtDashboardContext = await this.getJwtDashboardQueryContext(
                account,
                projectUuid,
                requestDashboardUuid,
            );
            dashboardUuid = jwtDashboardContext.dashboardUuid;
        }

        if (!dashboardUuid) {
            throw new ForbiddenError(
                'JWT does not grant access to a dashboard',
            );
        }
        const resolvedDashboardUuid = dashboardUuid;

        if (isJwtUser(account)) {
            const { embedWriteUser } = account;
            const embedWriteActions = account.authentication.data.writeActions;
            const canUseWriteDashboard =
                embedWriteUser &&
                embedWriteActions?.spaceUuid === savedChart.space.uuid;

            if (canUseWriteDashboard) {
                await this.assertSavedChartViewAccessForUser(embedWriteUser, {
                    organizationUuid: savedChart.organization.organizationUuid,
                    projectUuid: savedChart.project.projectUuid,
                    spaceUuid: savedChart.space.uuid,
                    savedSqlUuid: savedChart.savedSqlUuid,
                });
            } else {
                await this.permissionsService.checkEmbedSqlChartPermissions(
                    account,
                    savedChart.savedSqlUuid,
                );
            }
        } else {
            await this.assertSavedChartAccess(account, 'view', savedChart);
        }

        const [rawDashboardParameters, projectParameters] = await Promise.all([
            this.dashboardModel.getDashboardParametersByIdOrSlug(
                resolvedDashboardUuid,
                projectUuid,
            ),
            this.projectParametersModel.find(projectUuid),
        ]);

        const dashboardParameters = convertDashboardParametersToValuesMap(
            rawDashboardParameters,
        );

        // Combine default parameter values, dashboard parameters, and request parameters first
        const combinedParameters = await this.combineParameters(
            projectUuid,
            undefined,
            args.parameters,
            dashboardParameters,
            projectParameters,
        );

        const {
            warehouseConnection,
            warehouseCredentials,
            queryTags,
            metricQuery,
            queryComposer,
            appliedDashboardFilters,
            originalColumns,
            parameterReferences,
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
                organizationUuid: savedChart.organization.organizationUuid,
                chart: { uuid: savedChart.savedSqlUuid },
                queryTags,
                context,
                queryComposer,
                originalColumns,
                warehouseCredentials,
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

    async pollQueryHistoryUntilDeadline({
        account,
        projectUuid,
        queryUuid,
        deadlineMs,
        pollIntervalMs,
        signal,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        deadlineMs: number;
        pollIntervalMs: number;
        signal?: AbortSignal;
    }): Promise<QueryHistory> {
        let lastQueryHistory: QueryHistory | undefined;

        for await (const queryHistory of this.streamQueryHistoryUntilDeadline({
            account,
            projectUuid,
            queryUuid,
            deadlineMs,
            pollIntervalMs,
            signal,
        })) {
            lastQueryHistory = queryHistory;

            switch (queryHistory.status) {
                case QueryHistoryStatus.PENDING:
                case QueryHistoryStatus.QUEUED:
                case QueryHistoryStatus.EXECUTING:
                    break;
                case QueryHistoryStatus.CANCELLED:
                case QueryHistoryStatus.ERROR:
                case QueryHistoryStatus.EXPIRED:
                case QueryHistoryStatus.READY:
                    return queryHistory;
                default:
                    return assertUnreachable(
                        queryHistory.status,
                        'Unknown query status',
                    );
            }
        }

        if (!lastQueryHistory) {
            throw new UnexpectedServerError('Query polling did not run');
        }

        return lastQueryHistory;
    }

    /**
     * Execute metric query and wait for all results.
     * Returns raw rows from warehouse
     */
    async executeMetricQueryAndGetResults(
        args: ExecuteAsyncMetricQueryArgs,
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
            await this.executeAsyncMetricQuery(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid,
            ...pollingOptions,
        });

        const results = await this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid,
            cacheMetadata,
            fields,
        });

        return { queryUuid, ...results };
    }

    async extendQueryResultsExpiration({
        account,
        projectUuid,
        queryUuid,
        expiresAt,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        expiresAt: Date;
    }): Promise<void> {
        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            account,
        );
        if (
            !queryHistory.resultsFileName ||
            (queryHistory.resultsExpiresAt &&
                queryHistory.resultsExpiresAt >= expiresAt)
        ) {
            return;
        }

        await this.queryHistoryModel.update(
            queryUuid,
            projectUuid,
            { results_expires_at: expiresAt },
            account,
        );
    }

    /**
     * Execute a calculate-total query (row/column totals) derived from a source
     * query and wait for all results. Mirrors `executeMetricQueryAndGetResults`
     * but starts from `executeAsyncCalculateTotalFromQueryHistory`.
     */
    private async executeCalculateTotalAndGetResults(
        args: {
            account: Account;
            projectUuid: string;
            queryUuid: string;
            kind: CalculateTotalKind;
            subtotalDimensions?: string[];
            invalidateCache?: boolean;
        },
        pollingOptions?: PollingOptions,
    ): Promise<{
        rows: Record<string, unknown>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
    }> {
        const { account, projectUuid } = args;

        const {
            queryUuid: totalsQueryUuid,
            cacheMetadata,
            fields,
        } = await this.executeAsyncCalculateTotalFromQueryHistory(args);

        await this.pollForQueryCompletion({
            account,
            projectUuid,
            queryUuid: totalsQueryUuid,
            ...pollingOptions,
        });

        return this.getReadyQueryResults({
            account,
            projectUuid,
            queryUuid: totalsQueryUuid,
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

        const displayTimezone = queryHistory.metricQuery.timezone ?? null;

        return {
            rows,
            cacheMetadata,
            fields,
            pivotDetails:
                AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory),
            displayTimezone,
        };
    }

    async getRawAsyncQueryResults({
        account,
        projectUuid,
        queryUuid,
        maxRows,
    }: {
        account: Account;
        projectUuid: string;
        queryUuid: string;
        maxRows?: number;
    }): Promise<{
        rows: Record<string, unknown>[];
        fields: ItemsMap;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        displayTimezone: string | null;
        truncated: boolean;
        metricQuery: MetricQuery;
    }> {
        const queryHistory = await this.getAsyncQueryHistory({
            account,
            projectUuid,
            queryUuid,
        });

        if (queryHistory.status !== QueryHistoryStatus.READY) {
            throw new UnexpectedServerError(
                `Query ${queryUuid} is not ready to fetch results`,
            );
        }

        if (
            queryHistory.resultsExpiresAt &&
            queryHistory.resultsExpiresAt < new Date()
        ) {
            throw new ResultsExpiredError();
        }

        if (!queryHistory.resultsFileName) {
            throw new UnexpectedServerError(
                `No results file found for query ${queryUuid}`,
            );
        }

        const resultsStream = await this.getResultsStorageClientForContext(
            queryHistory.context,
        ).getDownloadStream(queryHistory.resultsFileName);

        const rows: Record<string, unknown>[] = [];
        const { truncated } = await streamJsonlData<void>({
            readStream: resultsStream,
            onRow: (rawRow) => {
                rows.push(rawRow);
            },
            maxLines: maxRows,
        });

        return {
            rows,
            fields: queryHistory.fields,
            pivotDetails:
                AsyncQueryService.getPivotDetailsFromQueryHistory(queryHistory),
            displayTimezone: queryHistory.metricQuery.timezone ?? null,
            truncated,
            metricQuery: queryHistory.metricQuery,
        };
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

        const warehouseSqlBuilder = getSqlBuilderForExplore(
            explore,
            warehouseCredentials,
        );

        const queryComposer = await this.prepareMetricQueryAsyncQueryArgs({
            account,
            metricQuery,
            dateZoom,
            explore,
            warehouseSqlBuilder,
            parameters,
            projectUuid,
            materializationRole: userAccessControls,
            columnTimezone: getColumnTimezone(warehouseCredentials),
            dataTimezone: warehouseCredentials.dataTimezone,
        });
        const fields = queryComposer.getFields();

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

        const queryTagsWithUserAttributes =
            AsyncQueryService.addUserAttributeQueryTags(
                queryTags,
                queryComposer.getUserAccessControls(),
            );

        const { queryUuid, cacheMetadata } =
            await this.executePreparedAsyncQuery(
                {
                    account,
                    projectUuid,
                    isPreviewProject:
                        await this.isExcludedFromUsage(projectUuid),
                    context,
                    queryTags: queryTagsWithUserAttributes,
                    invalidateCache,
                    queryComposer,
                    originalColumns: undefined,
                    warehouseCredentials,
                    routingTarget: routingDecision.target,
                    ...(routingDecision.target === 'pre_aggregate' && {
                        preAggregationRoute: routingDecision.route,
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
        const { metricQuery: totalMetricQuery } = new TotalQueryBuilder({
            metricQuery,
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery();

        // This legacy path hand-compiles the collapsed query, so it can't
        // embed the source query to enforce metric / table-calc filters;
        // callers catch this error and return empty totals, matching the old
        // behavior. (Sum-of-rows calc totals just stay blank here.)
        if (hasBlockingTotalFilters(metricQuery)) {
            throw new NotSupportedError(
                'Totals cannot be correctly calculated with metric filters or table calculation filters',
            );
        }

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

    /** @deprecated Superseded by executeAsyncCalculateTotalFromQueryHistory (kind 'columnSubtotal'). */
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

        // GLITCH-452: format subtotal raw values with the same resolved display
        // timezone as the main rows so DATE dimensions compare and render
        // identically (null when the timezone flag is off → legacy ISO output).
        const { displayTimezone } = await this.resolveTimezoneContext({
            projectUuid,
            organizationUuid,
            userUuid: account.user.id,
            userTimezone: getAccountUserTimezone(account),
            // Only used as a presence gate for DATE raw formatting; the flag
            // null-vs-set gating is independent of sessionTimezone.
            sessionTimezone: null,
            metricQuery,
        });

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

                subtotals = formatRawRows(
                    rows,
                    fields,
                    displayTimezone ?? undefined,
                );
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

    /** @deprecated Superseded by executeAsyncCalculateTotalFromQueryHistory. */
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

        const spaceCtx = await this.spacePermissionService.resolveAccess(
            account.user.id,
            {
                type: 'chart',
                chartUuid: savedChart.uuid,
                dashboardUuid: savedChart.dashboardUuid,
                spaceUuid: savedChart.spaceUuid,
            },
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
                    ...AsyncQueryService.getSchedulerQueryTags(),
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

    /** @deprecated Superseded by executeAsyncCalculateTotalFromQueryHistory. */
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
                    ...AsyncQueryService.getSchedulerQueryTags(),
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

    /** @deprecated Superseded by the V2 calculate-total path (kind 'columnSubtotal'). */
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
                ...AsyncQueryService.getSchedulerQueryTags(),
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
                    metadata: {
                        exploreName: filters?.exploreName,
                    },
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
            {
                projectUuid,
            },
        );

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid,
                    },
                }),
            )
        ) {
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
