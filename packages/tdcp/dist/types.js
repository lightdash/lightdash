"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TdcpDialects = exports.TdcpMethods = exports.TDCP_PROTOCOL_REVISION = void 0;
exports.TDCP_PROTOCOL_REVISION = '2026-08-draft.1';
exports.TdcpMethods = {
    CAPABILITIES: 'tabular/capabilities',
    CATALOG: 'tabular/catalog',
    READ: 'tabular/read',
    SCAN: 'tabular/scan',
    QUERY: 'tabular/query',
    REFRESH: 'tabular/refresh',
};
exports.TdcpDialects = {
    DUCKDB_SQL: 'sql:duckdb',
    POSTGRES_SQL: 'sql:postgres',
    LIGHTDASH_METRIC_QUERY: 'metricquery:lightdash',
    WAREHOUSE_SQL: 'sql:warehouse',
};
//# sourceMappingURL=types.js.map