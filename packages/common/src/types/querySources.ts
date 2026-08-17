import { type QueryExecutionContext } from './analytics';
import { type UUID } from './api/uuid';
import { type DimensionType } from './field';
import { type MetricQueryRequest } from './metricQuery';

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
     * node of a multi-source DAG.
     */
    DUCKDB = 'duckdb',
}

/**
 * A table name exposed to source SQL, or a node id within a query DAG.
 * Aliased so TSOA emits a $ref'd record value type (a plain string-valued
 * Record compiles to an empty object literal and validation strips its keys).
 * @pattern ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$
 */
export type QuerySourceTableName = string;

/**
 * The value side of a duckdb source's references map: either the node id of
 * an upstream DAG node, or the queryUuid of an existing async query result.
 * @pattern ^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$
 */
export type QueryResultReference = string;

/** A semantic layer (metric) query as a source query. */
export type SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER;
    query: MetricQueryRequest;
};

/** A raw warehouse SQL query as a source query. */
export type SqlSourceQuery = {
    sourceType: QuerySourceType.SQL;
    sql: string;
    limit?: number;
};

/**
 * A DuckDB compose query as a source query. Each entry of references exposes
 * another query's results as a named table the SQL can select from. Values
 * are node ids when used inside a DAG (resolved to queryUuids after the
 * upstream node completes) or queryUuids of existing results.
 */
export type DuckdbSourceQuery = {
    sourceType: QuerySourceType.DUCKDB;
    sql: string;
    limit?: number;
    references?: Record<QuerySourceTableName, QueryResultReference>;
};

/**
 * The tagged union every submit endpoint takes: one shape per source,
 * discriminated by sourceType. New sources add a member here — this union is
 * the extension point, not new WarehouseTypes values.
 */
export type SourceQuery =
    | SemanticLayerSourceQuery
    | SqlSourceQuery
    | DuckdbSourceQuery;

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

/**
 * A node id within a query DAG. Also the name other nodes use to reference
 * this node's results.
 * @pattern ^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$
 */
export type QueryDagNodeId = string;

/** One node of a query DAG: a source query addressed by a DAG-unique id. */
export type QueryDagNodeRequest = {
    nodeId: QueryDagNodeId;
    query: SourceQuery;
};

export type ExecuteQueryDagRequestParams = {
    /**
     * Nodes of the DAG. Edges are implicit: a duckdb node depends on every
     * node its references name. Nodes with no unresolved dependencies run in
     * parallel; the common pattern is n source queries plus one duckdb node
     * merging them.
     */
    nodes: QueryDagNodeRequest[];
    context?: QueryExecutionContext;
};

export type ExecuteSourceQueryRequestParams = {
    query: SourceQuery;
    context?: QueryExecutionContext;
};

export enum QueryDagStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
}

export enum QueryDagNodeStatus {
    /** Waiting for upstream dependencies to complete. */
    PENDING = 'pending',
    /** Submitted to its source; poll its queryUuid for detailed progress. */
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
    /** Never ran because an upstream node failed. */
    SKIPPED = 'skipped',
}

export type QueryDagNode = {
    nodeId: string;
    sourceType: QuerySourceType;
    status: QueryDagNodeStatus;
    /**
     * The node's result id, set once the node is submitted. Results are
     * fetched with the standard async query results endpoint.
     */
    queryUuid: UUID | null;
    error: string | null;
};

export type QueryDag = {
    queryDagUuid: UUID;
    projectUuid: UUID;
    status: QueryDagStatus;
    error: string | null;
    createdAt: Date;
    nodes: QueryDagNode[];
};

export type ApiExecuteSourceQueryResults = {
    queryUuid: UUID;
};

export type ApiExecuteQueryDagResults = QueryDag;

export type ApiGetQueryDagResults = QueryDag;

export type ApiListQuerySourcesResults = {
    sources: QuerySourceDefinition[];
};

export type ApiScanQuerySourceSchemaResults = QuerySourceSchema;
