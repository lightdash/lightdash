import { type QueryExecutionContext } from './analytics';
import { type UUID } from './api/uuid';
import {
    type CustomDimension,
    type DimensionType,
    type FieldId,
    type TableCalculation,
} from './field';
import {
    type AdditionalMetric,
    type MetricQueryRequest,
    type SortField,
} from './metricQuery';
import { type ParametersValuesMap } from './parameters';
import { type PivotConfiguration } from './pivot';
import { type QueryHistoryStatus } from './queryHistory';

/**
 * Discriminator for every query source a project can execute queries against.
 * A query source is anything that can scan a schema and run a query returning
 * the standard table format (ResultColumns + rows behind a queryUuid): the
 * project warehouse, the semantic layer, the DuckDB compose engine, and —
 * later — CSV uploads, HTTP APIs, Google Sheets, etc.
 *
 * Deliberately NOT WarehouseTypes: sources are not warehouses, they plug in
 * above the warehouse client layer.
 */
export enum QuerySourceType {
    /** Metric queries compiled through the project's semantic layer. */
    SEMANTIC_LAYER = 'semanticLayer',
    /** Raw SQL against the project's data warehouse (SQL runner). */
    SQL = 'sql',
    /**
     * DuckDB SQL over previous results (compose engine). References expose
     * other queries' results as named tables, so this is the merge/transform
     * step of a multi-source pipeline.
     */
    DUCKDB = 'duckdb',
    /** Durable external tables queried with DuckDB; enterprise only. */
    EXTERNAL = 'external',
}

/**
 * A name identifying one query within a multi-query submission. Other queries
 * reference this query's results by this name, and by default the results are
 * exposed to referencing DuckDB SQL as a table of the same name — so node ids
 * share the table-name grammar.
 * @pattern ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$
 */
export type QueryNodeId = string;

/**
 * A table name exposed to source SQL.
 * Aliased so TSOA emits a $ref'd record value type (a plain string-valued
 * Record compiles to an empty object literal and validation strips its keys).
 * @pattern ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$
 */
export type QuerySourceTableName = string;

/**
 * The value side of a duckdb query's references map: either the node id of
 * another query in the same submission, or the queryUuid of an existing
 * async query result.
 * @pattern ^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$
 */
export type QueryResultReference = string;

/**
 * A semantic layer (metric) query as a source query. Only exploreName,
 * dimensions and metrics are required; everything else defaults to empty
 * (no filters, no sorts, no table calculations) and a default row limit.
 *
 * Result columns are named by field id — exactly the dimensions and metrics
 * requested (e.g. requesting metric "payments_total_revenue" yields a column
 * "payments_total_revenue"), so referencing DuckDB SQL selects those names.
 */
export type SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER;
    /** Names this query so other queries in the same submission can reference its results. */
    nodeId?: QueryNodeId;
    exploreName: string;
    /** Dimension field ids to group by, from the explore's schema. */
    dimensions: FieldId[];
    /** Metric field ids to compute, from the explore's schema. */
    metrics: FieldId[];
    /**
     * Filters to apply, in the metric query filters shape: an optional filter
     * group per field kind, e.g. {"dimensions": {"id": "...", "and": [{"id":
     * "...", "target": {"fieldId": "orders_status"}, "operator": "equals",
     * "values": ["completed"]}]}}. Defaults to no filters.
     */
    filters?: MetricQueryRequest['filters'];
    /** Sorts to apply, e.g. [{"fieldId": "orders_order_date", "descending": true}]. Defaults to none. */
    sorts?: SortField[];
    /** Max rows to return. Defaults to the standard query row limit. */
    limit?: number;
    /** Table calculations appended to the results. Defaults to none. */
    tableCalculations?: TableCalculation[];
    /** Ad-hoc metrics not defined in the explore. */
    additionalMetrics?: AdditionalMetric[];
    /** Ad-hoc dimensions not defined in the explore. */
    customDimensions?: CustomDimension[];
    /** IANA timezone for time dimension bucketing, e.g. "America/New_York". */
    timezone?: string;
    /**
     * Pivots this node's result the way a pivoted chart does. Honoured by
     * semanticLayer and sql nodes; duckdb and external nodes refuse it until
     * the join node owns the pivot stage.
     */
    pivotConfiguration?: PivotConfiguration;
};

/** A raw warehouse SQL query as a source query. */
export type SqlSourceQuery = {
    sourceType: QuerySourceType.SQL;
    /** Names this query so other queries in the same submission can reference its results. */
    nodeId?: QueryNodeId;
    sql: string;
    limit?: number;
    /**
     * Pivots this node's result the way a pivoted chart does. Honoured by
     * semanticLayer and sql nodes; duckdb and external nodes refuse it until
     * the join node owns the pivot stage.
     */
    pivotConfiguration?: PivotConfiguration;
};

/**
 * A DuckDB compose query as a source query. References expose other queries'
 * results as named tables the SQL can select from; a referenced result's
 * column names are those of the upstream query's result (field ids for
 * semanticLayer queries, SELECT output names for sql queries).
 *
 * References that name queries still running are waited on: this query
 * executes once every referenced result is ready, and fails if any
 * referenced query fails.
 */
export type DuckdbSourceQuery = {
    sourceType: QuerySourceType.DUCKDB;
    /** Names this query so other queries in the same submission can reference its results. */
    nodeId?: QueryNodeId;
    sql: string;
    limit?: number;
    /**
     * Which query results the SQL reads, in one of two forms. Shorthand
     * array: node ids of queries in the same submission, each exposed as a
     * table named by its node id — ["orders", "revenue"] lets the SQL run
     * SELECT * FROM orders JOIN revenue. Map form for aliasing or existing
     * results: {tableName: nodeIdOrQueryUuid}, e.g. {"o": "orders", "prev":
     * "<queryUuid>"}.
     */
    references?:
        | QueryNodeId[]
        | Record<QuerySourceTableName, QueryResultReference>;
    /**
     * Pivots this node's result the way a pivoted chart does. Honoured by
     * semanticLayer and sql nodes; duckdb and external nodes refuse it until
     * the join node owns the pivot stage.
     */
    pivotConfiguration?: PivotConfiguration;
};

/**
 * External table SQL name or UUID.
 * @pattern ^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$
 */
export type ExternalSourceTableReference = string;

/** DuckDB SQL over named durable external tables. */
export type ExternalSourceQuery = {
    sourceType: QuerySourceType.EXTERNAL;
    /** Names this query so other queries in the same submission can reference its results. */
    nodeId?: QueryNodeId;
    sql: string;
    limit?: number;
    tables:
        | ExternalSourceTableReference[]
        | Record<QuerySourceTableName, ExternalSourceTableReference>;
    /**
     * Pivots this node's result the way a pivoted chart does. Honoured by
     * semanticLayer and sql nodes; duckdb and external nodes refuse it until
     * the join node owns the pivot stage.
     */
    pivotConfiguration?: PivotConfiguration;
};

/**
 * The tagged union every submit endpoint takes: one shape per source,
 * discriminated by sourceType. New sources add a member here — this union is
 * the extension point, not new WarehouseTypes values.
 */
export type SourceQuery =
    | SemanticLayerSourceQuery
    | SqlSourceQuery
    | DuckdbSourceQuery
    | ExternalSourceQuery;

/** A column in a source schema, aligned with ResultColumns' {reference, type}. */
export type QuerySourceSchemaColumn = {
    reference: string;
    type: DimensionType;
    label: string | null;
    description: string | null;
};

/**
 * A queryable table in a source schema: an explore for the semantic layer, a
 * warehouse table for SQL, a referenced result for DuckDB.
 */
export type QuerySourceSchemaTable = {
    reference: string;
    label: string | null;
    description: string | null;
    columns: QuerySourceSchemaColumn[];
};

/** The standard shape every source's schema scan returns. */
export type QuerySourceSchema = {
    sourceType: QuerySourceType;
    tables: QuerySourceSchemaTable[];
};

/** Metadata describing a registered source, for source discovery. */
export type QuerySourceDefinition = {
    sourceType: QuerySourceType;
    label: string;
    description: string;
};

export type ExecuteSourceQueriesRequestParams = {
    /**
     * One or more source queries, submitted together. Order does not matter:
     * queries are submitted in dependency order (a duckdb query after the
     * queries its references name) and every query starts executing
     * immediately — dependency waiting happens inside the referencing query.
     */
    queries: SourceQuery[];
    context?: QueryExecutionContext;
    /**
     * Parameter values shared by every query in the submission, layered over
     * project and explore defaults. A query referencing a parameter with no
     * value refuses rather than running with a placeholder.
     */
    parameters?: ParametersValuesMap;
    /** Bypass cached results for every query in the submission. */
    invalidateCache?: boolean;
};

/** One submitted query: its (possibly generated) node id and the queryUuid to poll. */
export type SourceQuerySubmission = {
    nodeId: QueryNodeId;
    sourceType: QuerySourceType;
    queryUuid: UUID;
};

export type ApiExecuteSourceQueriesResults = {
    queries: SourceQuerySubmission[];
};

/** Status of one submitted query, from the standard async query lifecycle. */
export type SourceQueryStatus = {
    queryUuid: UUID;
    status: QueryHistoryStatus;
    error: string | null;
};

export type ApiGetSourceQueryStatusResults = {
    statuses: SourceQueryStatus[];
};

export type ApiListQuerySourcesResults = {
    sources: QuerySourceDefinition[];
};

export type ApiScanQuerySourceSchemaResults = QuerySourceSchema;
