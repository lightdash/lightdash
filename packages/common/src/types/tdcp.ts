import { type DimensionType } from './field';

/**
 * TDCP — Tabular Data Context Protocol (rough draft).
 *
 * Wire types for a draft MCP extension that standardizes tabular data by
 * reference: a control plane over MCP JSON-RPC (catalog discovery, query
 * submission, dataset descriptors) and an out-of-band data plane (JSONL
 * mandatory floor, Arrow IPC recommended, Arrow Flight optional).
 *
 * These types are the extension's contract; the spec is extracted from this
 * running code, not the other way round (see
 * docs/multi-source-query-platform-plan.md and the TDCP proposal).
 *
 * @oliver: draft namespace. When the spec repo exists these types move there
 * and this file imports the published package — kept in common for now so
 * both the in-process servers and a future frontend can share them.
 */
export const TDCP_PROTOCOL_REVISION = '2026-08-draft.1';

/** Namespaced extension method names, MCP-extension style. */
export const TdcpMethods = {
    CAPABILITIES: 'tabular/capabilities',
    CATALOG: 'tabular/catalog',
    READ: 'tabular/read',
    SCAN: 'tabular/scan',
    QUERY: 'tabular/query',
    REFRESH: 'tabular/refresh',
} as const;

export type TdcpMethod = (typeof TdcpMethods)[keyof typeof TdcpMethods];

/**
 * Known query dialect tags for tier 2 sources. An open registry like media
 * types — servers may declare dialects not listed here.
 */
export const TdcpDialects = {
    DUCKDB_SQL: 'sql:duckdb',
    LIGHTDASH_METRIC_QUERY: 'metricquery:lightdash',
    WAREHOUSE_SQL: 'sql:warehouse',
} as const;

/**
 * Column schema in a catalog table or dataset descriptor.
 *
 * @oliver: the spec says Arrow logical types with an annotations map. The
 * draft reuses DimensionType so the mapping onto ResultColumns is lossless
 * while the shapes settle — swapping the type vocabulary later is a rename,
 * not a redesign.
 */
export type TdcpColumnSchema = {
    name: string;
    type: DimensionType;
    label: string | null;
    description: string | null;
};

export type TdcpCatalogTable = {
    reference: string;
    label: string | null;
    description: string | null;
    columns: TdcpColumnSchema[];
};

/** The standard shape of tabular/catalog: what this source can be asked for. */
export type TdcpCatalog = {
    tables: TdcpCatalogTable[];
};

/**
 * Capability tiers a source declares. A source implements the tiers it can
 * honestly support; whatever it cannot do, the consumer's compose engine
 * finishes.
 */
export type TdcpCapabilities = {
    revision: string;
    /** Tier 0: list tables, read a table with limit/pagination. */
    read: boolean;
    /** Tier 1: declarative projection/predicate/limit pushdown. */
    scan: boolean;
    /** Tier 2: native queries in the source's own language. */
    queryDialects: string[];
    /**
     * Compose capability: tier 2 queries may reference other datasets as
     * named tables — the server-side engine option, so thin clients never
     * need a local DuckDB.
     */
    compose: boolean;
};

/**
 * Tier 1 predicate AST — deliberately tiny. Conjunctive predicates,
 * comparisons, IN. Anything richer is tier 2's job.
 * @oliver: hard line against pushdown scope creep lives here.
 */
export type TdcpScanPredicate = {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
    values: (string | number | boolean | null)[];
};

/**
 * exact: the server must fully satisfy the predicates or refuse — safe for
 * clients with no local engine. bestEffort: the server reports what it
 * pushed and the consumer re-applies the rest.
 */
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
    /**
     * The query text in the declared dialect. Non-text dialects (e.g.
     * metricquery:lightdash) send their payload JSON-encoded.
     */
    query: string;
    /**
     * Compose only: dataset references exposed to the query as named tables,
     * table name -> dataset id.
     */
    references?: Record<string, string>;
    limit?: number;
};

export type TdcpDataRequest =
    | TdcpReadRequest
    | TdcpScanRequest
    | TdcpQueryRequest;

/** How the descriptor's data is fetched, out of band. */
export type TdcpDataLink = {
    encoding: 'jsonl' | 'arrow';
    href: string;
    /** Short-lived bearer for the data plane; never a capability URL. */
    token: string | null;
    expiresAt: string;
};

export type TdcpFreshness = {
    sourceQueriedAt: string;
    cacheHit: boolean;
};

/**
 * The dataset descriptor — the one object the protocol exists to produce and
 * consume. Opaque handle + schema + freshness + out-of-band links + an
 * agent-context-sized preview.
 */
export type TdcpDatasetDescriptor = {
    datasetId: string;
    schema: TdcpColumnSchema[];
    rowCount: number | null;
    producedAt: string;
    expiresAt: string;
    freshness: TdcpFreshness;
    /**
     * Absent for in-process servers: the dataset already lives in the local
     * results pipeline and datasetId is the queryUuid. Remote servers must
     * provide at least a jsonl link.
     */
    links: TdcpDataLink[] | null;
    /** Tier 1 only: which predicates the server actually pushed down. */
    pushedPredicates?: TdcpScanPredicate[];
};
