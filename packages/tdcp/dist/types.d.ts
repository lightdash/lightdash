/**
 * TDCP — Tabular Data Context Protocol. Draft wire types.
 *
 * This file is the protocol's canonical type vocabulary and must stay
 * dependency-free: the package is designed to be lifted into a standalone
 * repo unchanged. packages/common/src/types/tdcp.ts is the host-side copy;
 * when this package is published, common re-exports from here.
 *
 * @oliver: logical types are the five the host's DimensionType already
 * speaks, so backend interop is a cast-free mapping. The spec reserves the
 * move to Arrow logical types + an annotations map for a later revision —
 * that change is additive (new names, old ones aliased).
 */
export declare const TDCP_PROTOCOL_REVISION = "2026-08-draft.1";
export declare const TdcpMethods: {
    readonly CAPABILITIES: 'tabular/capabilities';
    readonly CATALOG: 'tabular/catalog';
    readonly READ: 'tabular/read';
    readonly SCAN: 'tabular/scan';
    readonly QUERY: 'tabular/query';
    readonly REFRESH: 'tabular/refresh';
};
export type TdcpMethod = (typeof TdcpMethods)[keyof typeof TdcpMethods];
export declare const TdcpDialects: {
    readonly DUCKDB_SQL: 'sql:duckdb';
    readonly POSTGRES_SQL: 'sql:postgres';
    readonly LIGHTDASH_METRIC_QUERY: 'metricquery:lightdash';
    readonly WAREHOUSE_SQL: 'sql:warehouse';
};
export type TdcpLogicalType = 'string' | 'number' | 'timestamp' | 'date' | 'boolean';
export type TdcpColumnSchema = {
    name: string;
    type: TdcpLogicalType;
    label: string | null;
    description: string | null;
};
export type TdcpCatalogTable = {
    reference: string;
    label: string | null;
    description: string | null;
    columns: TdcpColumnSchema[];
};
export type TdcpCatalog = {
    tables: TdcpCatalogTable[];
};
export type TdcpCapabilities = {
    revision: string;
    /** Tier 0: list tables, read a table with limit/pagination. */
    read: boolean;
    /** Tier 1: declarative projection/predicate/limit pushdown. */
    scan: boolean;
    /** Tier 2: native queries, by dialect tag. Empty = no tier 2. */
    queryDialects: string[];
    /** Tier 2 queries may reference other datasets as named tables. */
    compose: boolean;
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
    query: string;
    references?: Record<string, string>;
    limit?: number;
};
export type TdcpDataRequest = TdcpReadRequest | TdcpScanRequest | TdcpQueryRequest;
export type TdcpRefreshRequest = {
    method: typeof TdcpMethods.REFRESH;
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
    datasetId: string;
    schema: TdcpColumnSchema[];
    rowCount: number | null;
    producedAt: string;
    expiresAt: string;
    freshness: TdcpFreshness;
    /**
     * null only for in-process servers embedded in a host; a wire-serving
     * TDCP server MUST provide at least a jsonl link.
     */
    links: TdcpDataLink[] | null;
    pushedPredicates?: TdcpScanPredicate[];
};
/** A preview a server MAY attach for hosts that render tool text. */
export type TdcpPreview = {
    rows: Record<string, unknown>[];
    truncatedAt: number;
};
//# sourceMappingURL=types.d.ts.map