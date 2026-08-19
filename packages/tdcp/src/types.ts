/**
 * TDCP — Tabular Data Context Protocol. Draft wire types.
 *
 * This file is the protocol's canonical type vocabulary and must stay
 * dependency-free: the package is designed to be lifted into a standalone
 * repo unchanged.
 *
 * @oliver: the five logical types are a floor chosen for interop with the
 * first host; `sourceType` is the escape hatch for everything the floor
 * cannot name (nested data, native types). The spec reserves the move to
 * Arrow logical types plus an annotations map for a later revision — that
 * change is additive (new names, old ones aliased).
 */

export const TDCP_PROTOCOL_REVISION = '2026-08-draft.2';

export const TdcpMethods = {
    CAPABILITIES: 'tabular/capabilities',
    CATALOG: 'tabular/catalog',
    DESCRIBE: 'tabular/describe',
    READ: 'tabular/read',
    SCAN: 'tabular/scan',
    QUERY: 'tabular/query',
    POLL: 'tabular/poll',
} as const;

export type TdcpMethod = (typeof TdcpMethods)[keyof typeof TdcpMethods];

/** Dialect tags with registered implementations. Shaped like media types: family:variant. */
export const TdcpDialects = {
    DUCKDB_SQL: 'sql:duckdb',
    LIGHTDASH_METRIC_QUERY: 'metricquery:lightdash',
} as const;

/**
 * A tier 2 dialect as a server declares it: which field the request carries
 * ('text' dialects use `query`, 'structured' dialects use `params`), and how
 * a consumer learns to write one.
 */
export type TdcpDialectDeclaration = {
    dialect: string;
    form: 'text' | 'structured';
    /** JSON Schema for `params`; null for text dialects or when undocumented. */
    payloadSchema: Record<string, unknown> | null;
    docsUrl: string | null;
};

export type TdcpLogicalType =
    | 'string'
    | 'number'
    | 'timestamp'
    | 'date'
    | 'boolean';

export type TdcpColumnSchema = {
    name: string;
    type: TdcpLogicalType;
    /**
     * The source's native type name, informational (e.g. "jsonb",
     * "array<string>"). Non-primitive values travel JSON-encoded as
     * type "string" with sourceType naming what they really are.
     */
    sourceType: string | null;
    label: string | null;
    description: string | null;
};

export type TdcpCatalogTable = {
    reference: string;
    label: string | null;
    description: string | null;
    /** Inline columns, or null when the table is described on demand via tabular/describe. */
    columns: TdcpColumnSchema[] | null;
};

/** A catalog table with its columns resolved — the tabular/describe result. */
export type TdcpDescribedTable = {
    reference: string;
    label: string | null;
    description: string | null;
    columns: TdcpColumnSchema[];
};

export type TdcpCatalogRequest = {
    /** Continue a paginated catalog listing from a previous nextCursor. */
    cursor?: string;
};

export type TdcpCatalog = {
    tables: TdcpCatalogTable[];
    /** Opaque cursor for the next page; null when the listing is complete. */
    nextCursor: string | null;
};

export type TdcpDescribeRequest = {
    method: typeof TdcpMethods.DESCRIBE;
    table: string;
};

export type TdcpCapabilities = {
    revision: string;
    /** Tier 0: list tables, read a table with limit. */
    read: boolean;
    /** Tier 1: declarative projection/predicate/limit pushdown. */
    scan: boolean;
    /** Tier 2: dialect declarations. Empty = no tier 2. */
    queryDialects: TdcpDialectDeclaration[];
    /** Tier 2 queries may reference other datasets as named tables. */
    compose: boolean;
    /** tabular/describe available (required when any catalog table omits columns). */
    describe: boolean;
};

export type TdcpScanPredicate = {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
    values: (string | number | boolean | null)[];
};

export type TdcpPredicateMode = 'exact' | 'bestEffort';

export type TdcpReadRequest = {
    method: typeof TdcpMethods.READ;
    table: string;
    limit?: number;
};

export type TdcpScanRequest = {
    method: typeof TdcpMethods.SCAN;
    table: string;
    columns?: string[];
    predicates?: TdcpScanPredicate[];
    predicateMode: TdcpPredicateMode;
    limit?: number;
};

export type TdcpQueryRequest = {
    method: typeof TdcpMethods.QUERY;
    dialect: string;
    /** Query text — text-form dialects. Exactly one of query/params. */
    query?: string;
    /** Structured payload — structured-form dialects. Exactly one of query/params. */
    params?: Record<string, unknown>;
    references?: Record<string, string>;
    /** Result-row cap; composes min-wins with any dialect-internal limit. */
    limit?: number;
};

export type TdcpDataRequest =
    | TdcpReadRequest
    | TdcpScanRequest
    | TdcpQueryRequest;

export type TdcpPollRequest = {
    method: typeof TdcpMethods.POLL;
    datasetId: string;
};

export type TdcpDataLink = {
    encoding: 'jsonl' | 'arrow';
    href: string;
    token: string | null;
    expiresAt: string;
};

export type TdcpFreshness = {
    sourceQueriedAt: string;
    cacheHit: boolean;
};

export type TdcpDatasetDescriptor = {
    status: 'ready';
    datasetId: string;
    schema: TdcpColumnSchema[];
    rowCount: number | null;
    producedAt: string;
    expiresAt: string;
    freshness: TdcpFreshness;
    /** The data plane. A wire descriptor MUST carry at least a jsonl link. */
    links: TdcpDataLink[];
    /** Scan only: the predicates the server applied. */
    pushedPredicates?: TdcpScanPredicate[];
};

/** A data request still executing: poll tabular/poll with the datasetId. */
export type TdcpPendingDataset = {
    status: 'pending';
    datasetId: string;
    /** Clients SHOULD wait at least this long before polling; null = client's choice. */
    pollAfterMs: number | null;
};

export type TdcpDataResult = TdcpPendingDataset | TdcpDatasetDescriptor;
