import {
    Account,
    DownloadFileType,
    MergeQuery,
    MergeQueryChart,
    MergeQueryExecutionMode,
    MetricQuery,
    PersistentDownloadFileAccessMode,
    PivotConfig,
    PivotConfiguration,
    type AndFilterGroup,
    type ApiExecuteAsyncMetricQueryResults,
    type CacheMetadata,
    type ConditionalFormattingConfig,
    type DashboardFilters,
    type DateZoom,
    type DownloadAsyncQueryResultsPayload,
    type ExternalSourceTableReference,
    type Filters,
    type ItemsMap,
    type ParametersValuesMap,
    type PreAggregateExecutionEngine,
    type QueryExecutionContext,
    type QueryHistory,
    type QuerySourceTableName,
    type ResultColumns,
    type ResultsPaginationArgs,
    type RunQueryTags,
    type SavedChartDAO,
    type SortField,
    type UserAccessControls,
    type UserAttributeValueMap,
    type UUID,
    type WarehouseClient,
} from '@lightdash/common';
import type { OnboardingFlow } from '../../analytics/LightdashAnalytics';
import type { DbProjectParameter } from '../../database/entities/projectParameters';
import type { TotalConfiguration } from '../../utils/QueryBuilder/QueryComposer';

export type CommonAsyncQueryArgs = {
    account: Account;
    projectUuid: string;
    invalidateCache?: boolean;
    usePreAggregateCache?: boolean;
    context: QueryExecutionContext;
    parameters?: ParametersValuesMap;
    userAttributeOverrides?: UserAttributeValueMap;
};

export type GetAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'context' | 'invalidateCache' | 'parameters'
> &
    ResultsPaginationArgs & {
        queryUuid: string;
    };

export type DownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context' | 'parameters'
> & {
    accessMode: Exclude<
        PersistentDownloadFileAccessMode,
        PersistentDownloadFileAccessMode.LEGACY_PUBLIC
    >;
    queryUuid: string;
    type?: DownloadFileType;
    onlyRaw?: boolean;
    showTableNames?: boolean;
    customLabels?: Record<string, string>;
    columnOrder?: string[];
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
    exportPivotedData?: boolean;
    attachmentDownloadName?: string;
    expirationSecondsOverride?: number;
    conditionalFormattings?: ConditionalFormattingConfig[];
    showColumnTotals?: boolean;
};

export type ScheduleDownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context' | 'parameters'
> &
    Omit<DownloadAsyncQueryResultsPayload, 'userUuid' | 'organizationUuid'>;

export type ExecuteAsyncFieldValueSearchArgs = CommonAsyncQueryArgs & {
    table: string;
    fieldId: string;
    search: string;
    limit?: number;
    filters?: AndFilterGroup;
    forceRefresh?: boolean;
};

export type ExecuteAsyncMetricQueryArgs = CommonAsyncQueryArgs & {
    metricQuery: MetricQuery;
    dataAppPreviewToken?: string;
    customSqlProvenanceChartUuid?: UUID;
    dateZoom?: DateZoom;
    pivotConfiguration?: PivotConfiguration;
    materializationRole?: UserAccessControls;
    dashboardFilters?: DashboardFilters;
    /**
     * Collapse the query into a totals grain (calculate-total path only).
     * Mutually exclusive with `dashboardFilters`.
     */
    totalConfiguration?: TotalConfiguration;
};

export type ExecuteAsyncSavedChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    versionUuid?: string;
    limit?: number | null | undefined;
    pivotResults?: boolean;
    filterOverrides?: Filters;
    // Silent-drop semantics for fields outside the chart's explore — unlike
    // filterOverrides, which fails the run on unknown fields.
    dashboardFilters?: DashboardFilters;
};

export type ExecuteAsyncDashboardChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    tileUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    dateZoom?: DateZoom;
    limit?: number | null | undefined;
    pivotResults?: boolean;
    includeUnpublishedDraft?: boolean;
    sessionTimezone?: string | null;
    preloadedSavedChart?: SavedChartDAO;
    preloadedProjectParameters?: DbProjectParameter[];
};

export type ExecuteAsyncUnderlyingDataQueryArgs = CommonAsyncQueryArgs & {
    underlyingDataSourceQueryUuid: string;
    filters: Filters;
    underlyingDataItemId?: string;
    dateZoom?: DateZoom;
    limit?: number | null;
    sorts?: SortField[];
};

export type ExecuteAsyncQueryReturn = {
    queryUuid: string;
    cacheMetadata: CacheMetadata;
};

// The export's cell-based cap (floor(csvCellsLimit / columnCount)) can land
// at or below a wide query's own already-applied limit — rerunning would
// then return no more rows than the capped result already has, so the
// caller must skip execution rather than deliver a same-or-smaller "upgrade".
export type UnboundedRerunFromQueryHistoryResult =
    | {
          outcome: 'executed';
          queryUuid: string;
          appliedLimit: number;
      }
    | {
          outcome: 'noImprovementPossible';
      };

export type PreAggregationRouteMode = 'required' | 'opportunistic';

export type { PreAggregateExecutionEngine };

export type PreAggregationRoute = {
    sourceExploreName: string;
    preAggregateName: string;
    mode: PreAggregationRouteMode;
    // Present ⇒ external pre-aggregate served from this table on the project warehouse
    externalTable?: string;
};

export type ExecuteAsyncSqlQueryArgs = CommonAsyncQueryArgs & {
    sql: string;
    limit?: number;
    pivotConfiguration?: PivotConfiguration;
};

export type ExecuteAsyncComposeSqlQueryArgs = CommonAsyncQueryArgs & {
    sql: string;
    limit?: number;
    /** Table name -> queryUuid of a previous async query to expose as that table. */
    references?: Record<string, UUID>;
};

export type ExecuteAsyncExternalSqlQueryArgs = CommonAsyncQueryArgs & {
    sql: string;
    limit?: number;
    /** Table name -> external source table (name or uuid) to expose as that table. */
    tables: Record<QuerySourceTableName, ExternalSourceTableReference>;
};

export type ExecuteAsyncMergeQueryArgs = CommonAsyncQueryArgs & {
    mergeQuery: MergeQuery;
    mode: MergeQueryExecutionMode;
    chart?: MergeQueryChart;
};

export type ExecuteAsyncDashboardSqlChartCommonArgs = CommonAsyncQueryArgs & {
    dashboardUuid: string;
    tileUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
};

export type ExecuteAsyncDashboardSqlChartByUuidArgs =
    ExecuteAsyncDashboardSqlChartCommonArgs & {
        savedSqlUuid: string;
        limit?: number;
    };

export type ExecuteAsyncDashboardSqlChartBySlugArgs =
    ExecuteAsyncDashboardSqlChartCommonArgs & {
        slug: string;
        limit?: number;
    };

export type ExecuteAsyncDashboardSqlChartArgs =
    | ExecuteAsyncDashboardSqlChartByUuidArgs
    | ExecuteAsyncDashboardSqlChartBySlugArgs;

export const isExecuteAsyncDashboardSqlChartByUuid = (
    args: ExecuteAsyncDashboardSqlChartArgs,
): args is ExecuteAsyncDashboardSqlChartByUuidArgs => 'savedSqlUuid' in args;

export type ExecuteAsyncSqlChartByUuidArgs = CommonAsyncQueryArgs & {
    limit?: number;
    savedSqlUuid: string;
};

export type ExecuteAsyncSqlChartBySlugArgs = CommonAsyncQueryArgs & {
    limit?: number;
    slug: string;
};

export type ExecuteAsyncSqlChartArgs =
    | ExecuteAsyncSqlChartByUuidArgs
    | ExecuteAsyncSqlChartBySlugArgs;

export const isExecuteAsyncSqlChartByUuid = (
    args: ExecuteAsyncSqlChartArgs,
): args is ExecuteAsyncSqlChartByUuidArgs => 'savedSqlUuid' in args;

export type PollingOptions = {
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    timeoutMs?: number;
};

/**
 * Polling options tuned for scheduled/background tasks (e.g. GSheet syncs, email deliveries).
 * Slower polling reduces DB round-trips through cloud-sql-proxy, preventing OOM under load.
 */
export const SCHEDULER_POLLING_OPTIONS: PollingOptions = {
    initialBackoffMs: 2000,
    maxBackoffMs: 5000,
};

export type RunAsyncWarehouseQueryArgs = {
    projectUuid: string;
    userUuid: string;
    organizationUuid: string;
    isPreviewProject: boolean;
    queryUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount?: boolean;
    onboardingFlow: OnboardingFlow;
    queryTags: RunQueryTags;
    fieldsMap: ItemsMap;
    /** Resolved parameter values for this execution — interpolates parameter
     *  placeholders in column format expressions at column-build time. */
    usedParameters: ParametersValuesMap | null;
    cacheKey: string;
    warehouseCredentialsOverrides?: {
        snowflakeVirtualWarehouse?: string;
        databricksCompute?: string;
    };
    pivotConfiguration?: PivotConfiguration;
    originalColumns?: ResultColumns;
    query: string;
    queryCreatedAt: Date;
    displayTimezone: string | null;
};

export type RunAsyncPreAggregateQueryArgs = Omit<
    RunAsyncWarehouseQueryArgs,
    'query'
> & {
    preAggregateQuery: string;
    warehouseQuery: string;
    preAggregateExecution: PreAggregateExecutionEngine;
};

/** Where a DuckDB query's output columns come from. */
export type DuckdbQueryColumns =
    | {
          /** Probe the SQL with a one-row query: raw SQL has no known shape. */
          mode: 'discover';
          limit: number | undefined;
          parameters: ParametersValuesMap;
      }
    | {
          /** Known at compile time, so nothing is probed and nothing overwritten. */
          mode: 'supplied';
          fieldsMap: ItemsMap;
          usedParameters: ParametersValuesMap | null;
          originalColumns: ResultColumns;
          pivotConfiguration: PivotConfiguration | undefined;
      };

/**
 * Runs once every referenced query has completed and before anything
 * executes. Returns the refusal message, or null to proceed.
 */
export type DuckdbQueryReferenceGuard = (
    completed: Record<string, QueryHistory>,
) => string | null;

/** How a DuckDB query binds the results it reads. */
export type DuckdbQueryReferences =
    | {
          /** CTEs built at submit time, such as over ingested external tables. */
          kind: 'bound';
          referenceCtes: string[];
      }
    | {
          /** Other queries' results, waited on and bound once they complete. */
          kind: 'queries';
          references: Record<string, string>;
          guard: DuckdbQueryReferenceGuard | null;
      };

/** Which compose engine session executes a DuckDB query. */
export type DuckdbQueryEngine =
    | { kind: 'client'; warehouseClient: WarehouseClient }
    | {
          /** An isolated results session whose credentials reach only the bound result files. */
          kind: 'scopedToReferencedResults';
      };

/** A query's references, bound: the CTEs to attach and the result files they read. */
export type BoundDuckdbQueryReferences = {
    referenceCtes: string[];
    resultFileUris: string[];
};

export type RunDuckdbQueryArgs = {
    account: Account;
    projectUuid: string;
    organizationUuid: string;
    isPreviewProject: boolean;
    onboardingFlow: OnboardingFlow;
    queryUuid: string;
    /** The statement before its reference CTEs are attached. */
    sql: string;
    references: DuckdbQueryReferences;
    columns: DuckdbQueryColumns;
    /** Persisted instead of the executed SQL when that carries private URIs. */
    storedCompiledSql: string | null;
    engine: DuckdbQueryEngine;
    queryTags: RunQueryTags;
    queryCreatedAt: Date;
    cacheKey: string;
    context: QueryExecutionContext;
};
