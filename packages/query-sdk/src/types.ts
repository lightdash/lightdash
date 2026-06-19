/**
 * Core types for the Lightdash SDK.
 */

// --- Filter types ---

export type UnitOfTime = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export type FilterValue = string | number | boolean;

export type FilterOperator =
    | 'equals'
    | 'notEquals'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'isNull'
    | 'notNull'
    | 'startsWith'
    | 'endsWith'
    | 'include'
    | 'doesNotInclude'
    | 'inThePast'
    | 'notInThePast'
    | 'inTheNext'
    | 'inTheCurrent'
    | 'notInTheCurrent'
    | 'inBetween'
    | 'notInBetween';

export type Filter = {
    field: string;
    operator: FilterOperator;
    value?: FilterValue | FilterValue[];
    unit?: UnitOfTime;
    /**
     * For relative date filters (`inThePast`, `notInThePast`, etc.), restrict
     * the range to fully completed periods. e.g. `inThePast` + `unit: 'weeks'`
     * + `completed: true` means "the last N completed weeks" — the current,
     * in-progress week is excluded.
     */
    completed?: boolean;
};

export type Sort = {
    field: string;
    direction: 'asc' | 'desc';
};

// --- Table calculation types ---

export type TableCalculation = {
    /** Internal name of the table calculation (used as the field ID in results) */
    name: string;
    /** Display name shown in the UI */
    displayName: string;
    /** SQL expression for the calculation */
    sql: string;
};

// --- Additional metric types ---

export type MetricType =
    | 'average'
    | 'count'
    | 'count_distinct'
    | 'sum'
    | 'sum_distinct'
    | 'min'
    | 'max'
    | 'number'
    | 'median'
    | 'percentile';

export type AdditionalMetric = {
    /** Internal name of the metric (used as the field ID in results) */
    name: string;
    /** Display label */
    label?: string;
    /** Table the metric belongs to */
    table: string;
    /** Aggregation type */
    type: MetricType;
    /** SQL expression (e.g., ${TABLE}.column_name) */
    sql: string;
    /** Description of what the metric measures */
    description?: string;
};

// --- Custom dimension types ---

export type CustomDimension = {
    /** Unique ID for the custom dimension */
    id: string;
    /** Internal name */
    name: string;
    /** Table the dimension belongs to */
    table: string;
    /** SQL expression */
    sql: string;
    /** The dimension type */
    dimensionId: string;
};

// --- Parameter types ---

/** A single Lightdash parameter value (`${lightdash.parameters.X}` substitution) */
export type ParameterValue = string | number | string[] | number[];

/** Map of parameter name to value, passed at query time */
export type ParametersValuesMap = Record<string, ParameterValue>;

// --- Internal types (used by transport) ---

export type InternalFilterDefinition = {
    fieldId: string;
    operator: string;
    values: FilterValue[];
    settings: { unitOfTime: UnitOfTime; completed?: boolean } | null;
};

export type QueryDefinition = {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: InternalFilterDefinition[];
    sorts: { fieldId: string; descending: boolean }[];
    tableCalculations: TableCalculation[];
    additionalMetrics: AdditionalMetric[];
    customDimensions: CustomDimension[];
    limit: number;
    /**
     * Lightdash parameter values (`${lightdash.parameters.X}` substitutions).
     * Sent at the top level of the API request body, not nested under `query`.
     */
    parameters?: ParametersValuesMap;
    /** Human-readable label for dev tools / query inspector (not sent to the API) */
    label?: string;
};

// --- Query results ---

export type ColumnType = 'string' | 'number' | 'date' | 'timestamp' | 'boolean';

export type Column = {
    name: string;
    label: string;
    type: ColumnType;
};

export type Row = Record<string, string | number | boolean | null>;

export type FormatFunction = (row: Row, fieldId: string) => string;

export type QueryResult = {
    rows: Row[];
    columns: Column[];
    format: FormatFunction;
    /** Total rows returned by the source query, across all fetched pages. */
    totalResults?: number;
    /** Async query UUID for the source query. Useful for debugging and advanced flows. */
    queryUuid?: string;
    /**
     * Fetch raw rows behind an aggregated metric value from this query result.
     * Available when the transport supports Lightdash underlying-data queries.
     */
    getUnderlyingData?: (
        options: UnderlyingDataOptions,
    ) => Promise<UnderlyingDataResult>;
    /**
     * Schedule a backend CSV/XLSX export for rows behind an aggregated metric
     * value from this query result.
     */
    downloadUnderlyingData?: (
        options: DownloadUnderlyingDataOptions,
    ) => Promise<DownloadResultsResult>;
    /**
     * Schedule a backend CSV/XLSX export for this query result.
     * Available when the transport supports Lightdash download jobs.
     */
    downloadResults?: (
        options?: DownloadResultsOptions,
    ) => Promise<DownloadResultsResult>;
};

export type DownloadResultsFileType = 'csv' | 'xlsx';

export type DownloadResultsValues = 'formatted' | 'raw';

export type DownloadResultsLimit = 'table' | 'all' | number;

export type DownloadResultsOptions = {
    /** Export file type. Defaults to CSV. */
    fileType?: DownloadResultsFileType;
    /** Formatted display values or raw values. Defaults to formatted. */
    values?: DownloadResultsValues;
    /** Current table rows, all results, or a custom row count. Defaults to table. */
    limit?: DownloadResultsLimit;
    /** Download filename without extension. */
    filename?: string;
    /** Whether to trigger a browser download when the job completes. Defaults to true. */
    autoDownload?: boolean;
};

export type DownloadResultsResult = {
    queryUuid: string;
    jobId: string;
    fileUrl: string;
    fileType: DownloadResultsFileType;
    truncated: boolean;
};

export type DownloadUnderlyingDataOptions = Omit<
    UnderlyingDataOptions,
    'limit'
> &
    DownloadResultsOptions;

export type UnderlyingDataOptions = {
    /** Row object from this query result. */
    row: Row;
    /** Metric from the source query, using the same field name passed to `.metrics()`. */
    metric: string;
    /** Maximum raw rows to return. Defaults to the backend's underlying-data limit. */
    limit?: number | null;
};

export type UnderlyingDataResult = {
    rows: Row[];
    columns: Column[];
    format: FormatFunction;
    queryUuid: string;
};

// --- Client config ---

export type LightdashClientConfig = {
    /** Lightdash instance URL */
    baseUrl: string;
    /** Project UUID */
    projectUuid: string;
    /** API key (PAT or scoped token) */
    apiKey: string;
    /** Use relative /api paths instead of baseUrl (for dev proxy setups) */
    useProxy?: boolean;
};

// --- User ---

export type LightdashUser = {
    name: string;
    email: string;
    role: string;
    orgId: string;
    attributes: Record<string, string>;
};

// --- External API fetch (warehouse-proxied external connections) ---

/**
 * Result of an external API call proxied through Lightdash.
 *
 * Structural copy of `@lightdash/common`'s `ExternalFetchResponse`. The SDK
 * is published standalone and intentionally has no `@lightdash/common`
 * dependency, so this shape is duplicated here. Keep the two in sync.
 */
export type ExternalFetchResult = {
    /** HTTP status returned by the upstream external API. */
    status: number;
    /** Upstream `Content-Type` (e.g. `application/json`). */
    contentType: string;
    /** Parsed JSON body when JSON, otherwise the raw text. */
    body: unknown;
    /** True when Lightdash truncated an oversized response body. */
    truncated: boolean;
};

export type ExternalFetchOptions = {
    /** HTTP method. Defaults to `'GET'`. */
    method?: 'GET' | 'POST';
    /** Relative path appended to the connection's configured base URL. */
    path: string;
    /** Query-string params, merged into the request URL by the backend. */
    query?: Record<string, string>;
    /** JSON request body (POST only). */
    body?: unknown;
};

// --- Transport ---

export type Transport = {
    executeQuery: (query: QueryDefinition) => Promise<QueryResult>;
    getUser: () => Promise<LightdashUser>;
    externalFetch: (
        alias: string,
        opts: ExternalFetchOptions,
    ) => Promise<ExternalFetchResult>;
};
