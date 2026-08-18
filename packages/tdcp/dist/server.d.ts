import { type JsonRpcRequest, type JsonRpcResponse } from './jsonrpc';
import { type TdcpCapabilities, type TdcpCatalog, type TdcpDatasetDescriptor, type TdcpQueryRequest, type TdcpReadRequest, type TdcpRefreshRequest, type TdcpScanRequest } from './types';
/**
 * What an integrator implements. catalog is the only required handler —
 * a tier 0 server adds read; capabilities are derived from what is
 * provided unless declared explicitly.
 *
 * TContext is whatever the transport resolves per request (the
 * authenticated principal on the MCP transport; undefined for anonymous
 * reference servers).
 */
export type TdcpServerHandlers<TContext = undefined> = {
    capabilities?: (ctx: TContext) => Promise<TdcpCapabilities>;
    catalog: (ctx: TContext) => Promise<TdcpCatalog>;
    read?: (ctx: TContext, request: TdcpReadRequest) => Promise<TdcpDatasetDescriptor>;
    scan?: (ctx: TContext, request: TdcpScanRequest) => Promise<TdcpDatasetDescriptor>;
    query?: (ctx: TContext, request: TdcpQueryRequest) => Promise<TdcpDatasetDescriptor>;
    refresh?: (ctx: TContext, request: TdcpRefreshRequest) => Promise<TdcpDatasetDescriptor>;
    /** Declared tier 2 dialects; required when query is provided. */
    queryDialects?: string[];
    /** Whether query accepts dataset references (compose). */
    compose?: boolean;
};
/**
 * Builds the request handler at the heart of a TDCP server: one JSON-RPC
 * request in, one response out, transport left to the caller. A wire
 * descriptor MUST carry data-plane links — this is enforced here so no
 * conforming server can leak a linkless (in-process) descriptor.
 */
export declare const createTdcpRequestHandler: <TContext = undefined>(handlers: TdcpServerHandlers<TContext>) => (request: JsonRpcRequest, ctx: TContext) => Promise<JsonRpcResponse>;
//# sourceMappingURL=server.d.ts.map