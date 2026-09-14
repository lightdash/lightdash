import { QueryExecutionContext } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { ApiSuccess } from './api/success';
import type { KnexPaginateArgs } from './knex-paginate';
import type { MetricQuery } from './metricQuery';
import type { QueryHistoryStatus } from './queryHistory';

/**
 * User-facing grouping of `QueryExecutionContext` values by what triggered the
 * run: a person acting directly, an app surface loading many queries at once
 * (dashboards, embeds, data apps), or a schedule running in the background.
 */
export enum QueryTrigger {
    INTERACTIVE = 'interactive',
    APPS = 'apps',
    SCHEDULED = 'scheduled',
}

/**
 * Every context maps to exactly one trigger — no fallback bucket, so adding a
 * new `QueryExecutionContext` value fails compilation until it is classified.
 */
export const QUERY_TRIGGER_BY_CONTEXT: Record<
    QueryExecutionContext,
    QueryTrigger
> = {
    [QueryExecutionContext.EXPLORE]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.SQL_RUNNER]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.COMPOSE_SQL_RUNNER]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.MULTI_SOURCE_QUERY]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.CHART]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.CHART_HISTORY]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.SQL_CHART]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.VIEW_UNDERLYING_DATA]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.CALCULATE_TOTAL]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.CALCULATE_SUBTOTAL]: QueryTrigger.INTERACTIVE,
    // api/cli/ai/mcp are executed by the user, just through another door.
    [QueryExecutionContext.API]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.CLI]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.AI]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.MCP_RUN_METRIC_QUERY]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.MCP_RUN_SQL]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES]: QueryTrigger.INTERACTIVE,
    [QueryExecutionContext.DASHBOARD]: QueryTrigger.APPS,
    // Metric cards render themselves on load — homepage KPI blocks and the
    // metrics catalog, not a person hitting run.
    [QueryExecutionContext.METRICS_EXPLORER]: QueryTrigger.APPS,
    [QueryExecutionContext.AUTOREFRESHED_DASHBOARD]: QueryTrigger.APPS,
    [QueryExecutionContext.FILTER_AUTOCOMPLETE]: QueryTrigger.APPS,
    [QueryExecutionContext.DATA_APP_SAMPLE]: QueryTrigger.APPS,
    [QueryExecutionContext.EMBED]: QueryTrigger.APPS,
    [QueryExecutionContext.ALERT]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_DELIVERY]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.CSV]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.GSHEETS]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_GSHEETS_CHART]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_CHART]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.SCHEDULED_DASHBOARD]: QueryTrigger.SCHEDULED,
    [QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION]:
        QueryTrigger.SCHEDULED,
};

export const getQueryTrigger = (context: QueryExecutionContext): QueryTrigger =>
    QUERY_TRIGGER_BY_CONTEXT[context];

export const getContextsForTrigger = (
    trigger: QueryTrigger,
): QueryExecutionContext[] =>
    Object.values(QueryExecutionContext).filter(
        (context) => QUERY_TRIGGER_BY_CONTEXT[context] === trigger,
    );

export enum QueryLanguage {
    SEMANTIC = 'semantic',
    SQL = 'sql',
}

/**
 * Request-parameter keys that identify a raw-SQL run. SQL runner queries store
 * `sql`, saved SQL charts store `savedSqlUuid` or `slug` — everything else is
 * a semantic (metric query) run. Shared with the backend so the SQL `WHERE`
 * clause and the TS derivation cannot drift apart.
 */
export const SQL_LANGUAGE_REQUEST_PARAMETER_KEYS = [
    'sql',
    'savedSqlUuid',
    'slug',
] as const;

/**
 * Time windows for the query history list, newest first. Windows are disjoint:
 * "last hour" excludes the last few minutes, and so on. Anything older than 30
 * days is out of scope for the page.
 */
export enum QueryHistoryWindow {
    LAST_FEW_MINUTES = 'lastFewMinutes',
    LAST_HOUR = 'lastHour',
    LAST_24_HOURS = 'last24Hours',
    LAST_7_DAYS = 'last7Days',
    LAST_30_DAYS = 'last30Days',
}

/** Window upper bound in minutes back from now; lower bound is the previous window. */
export const QUERY_HISTORY_WINDOW_MINUTES: Record<QueryHistoryWindow, number> =
    {
        [QueryHistoryWindow.LAST_FEW_MINUTES]: 5,
        [QueryHistoryWindow.LAST_HOUR]: 60,
        [QueryHistoryWindow.LAST_24_HOURS]: 60 * 24,
        [QueryHistoryWindow.LAST_7_DAYS]: 60 * 24 * 7,
        [QueryHistoryWindow.LAST_30_DAYS]: 60 * 24 * 30,
    };

export const QUERY_HISTORY_WINDOWS_ORDERED: QueryHistoryWindow[] = [
    QueryHistoryWindow.LAST_FEW_MINUTES,
    QueryHistoryWindow.LAST_HOUR,
    QueryHistoryWindow.LAST_24_HOURS,
    QueryHistoryWindow.LAST_7_DAYS,
    QueryHistoryWindow.LAST_30_DAYS,
];

export enum QueryHistorySortBy {
    CREATED_AT = 'createdAt',
    RUNTIME = 'runtime',
}

export type QueryHistoryListFilters = {
    trigger?: QueryTrigger;
    language?: QueryLanguage;
    statuses?: QueryHistoryStatus[];
    /** Matches explore name, chart/dashboard name and compiled SQL. */
    search?: string;
    /** Restrict rows to one disjoint window; omit for all of the last 30 days. */
    window?: QueryHistoryWindow;
    sortBy?: QueryHistorySortBy;
};

/**
 * One row of the "My query history" list. Derived fields (trigger, language,
 * title, subline) are computed server-side from the persisted query so every
 * consumer renders the same anatomy.
 */
export type QueryHistoryListItem = {
    queryUuid: string;
    createdAt: Date;
    projectUuid: string | null;
    context: QueryExecutionContext;
    trigger: QueryTrigger;
    language: QueryLanguage;
    status: QueryHistoryStatus;
    /** Semantic: explore name. SQL: saved chart name or first CTE/table. */
    title: string;
    /** Semantic: metric/dimension labels. SQL: first line of SQL. Failed: error. */
    subline: string;
    error: string | null;
    exploreName: string | null;
    /** Present on semantic runs — lets the client rebuild an Explore URL. */
    metricQuery: MetricQuery | null;
    /** The original execute request, replayed verbatim by "Re-run". */
    requestParameters: ExecuteAsyncQueryRequestParams;
    chartName: string | null;
    chartUuid: string | null;
    savedSqlUuid: string | null;
    dashboardName: string | null;
    dashboardUuid: string | null;
    compiledSql: string;
    totalRowCount: number | null;
    warehouseExecutionTimeMs: number | null;
    /** True when this run was served from a previously cached results file. */
    cacheHit: boolean;
    resultsExpiresAt: Date | null;
    processingStartedAt: Date | null;
    resultsUpdatedAt: Date | null;
    erroredAt: Date | null;
};

export type QueryHistoryCounts = {
    /** Per-trigger totals with every filter except `trigger` applied. */
    triggers: Record<QueryTrigger, number>;
    /** Per-window totals with every filter except `window` applied. */
    windows: Record<QueryHistoryWindow, number>;
    total: number;
    /** Warehouse time spent in the last 7 days, for the page subtitle. */
    warehouseTimeMsLast7Days: number;
};

export type ApiQueryHistoryListResponse = ApiSuccess<{
    data: QueryHistoryListItem[];
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    };
    counts: QueryHistoryCounts;
}>;
