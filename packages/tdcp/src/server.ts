import {
    JsonRpcErrorCodes,
    jsonRpcError,
    jsonRpcResult,
    type JsonRpcRequest,
    type JsonRpcResponse,
} from './jsonrpc';
import {
    TDCP_PROTOCOL_REVISION,
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpRefreshRequest,
    type TdcpScanRequest,
} from './types';

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
    read?: (
        ctx: TContext,
        request: TdcpReadRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    scan?: (
        ctx: TContext,
        request: TdcpScanRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    query?: (
        ctx: TContext,
        request: TdcpQueryRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    refresh?: (
        ctx: TContext,
        request: TdcpRefreshRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    /** Declared tier 2 dialects; required when query is provided. */
    queryDialects?: string[];
    /** Whether query accepts dataset references (compose). */
    compose?: boolean;
};

const deriveCapabilities = <TContext>(
    handlers: TdcpServerHandlers<TContext>,
): TdcpCapabilities => ({
    revision: TDCP_PROTOCOL_REVISION,
    read: handlers.read !== undefined,
    scan: handlers.scan !== undefined,
    queryDialects: handlers.query ? (handlers.queryDialects ?? []) : [],
    compose: handlers.compose ?? false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Builds the request handler at the heart of a TDCP server: one JSON-RPC
 * request in, one response out, transport left to the caller. A wire
 * descriptor MUST carry data-plane links — this is enforced here so no
 * conforming server can leak a linkless (in-process) descriptor.
 */
export const createTdcpRequestHandler = <TContext = undefined>(
    handlers: TdcpServerHandlers<TContext>,
) => {
    const requireLinks = (
        descriptor: TdcpDatasetDescriptor,
    ): TdcpDatasetDescriptor => {
        if (!descriptor.links || descriptor.links.length === 0) {
            throw new Error(
                'A wire-serving TDCP server must return data-plane links on every descriptor',
            );
        }
        return descriptor;
    };

    return async (
        request: JsonRpcRequest,
        ctx: TContext,
    ): Promise<JsonRpcResponse> => {
        const { id, method, params } = request;
        try {
            switch (method) {
                case TdcpMethods.CAPABILITIES: {
                    const capabilities = handlers.capabilities
                        ? await handlers.capabilities(ctx)
                        : deriveCapabilities(handlers);
                    return jsonRpcResult(id, capabilities);
                }
                case TdcpMethods.CATALOG:
                    return jsonRpcResult(id, await handlers.catalog(ctx));
                case TdcpMethods.READ: {
                    if (!handlers.read) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            'This server does not support tabular/read',
                        );
                    }
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/read requires a table',
                        );
                    }
                    const descriptor = await handlers.read(
                        ctx,
                        params as TdcpReadRequest,
                    );
                    return jsonRpcResult(id, requireLinks(descriptor));
                }
                case TdcpMethods.SCAN: {
                    if (!handlers.scan) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            'This server does not support tabular/scan',
                        );
                    }
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/scan requires a table',
                        );
                    }
                    const scanRequest = params as TdcpScanRequest;
                    const descriptor = requireLinks(
                        await handlers.scan(ctx, scanRequest),
                    );
                    // The exact contract: fully pushed or refused, never
                    // silently partial — thin clients depend on this.
                    if (scanRequest.predicateMode === 'exact') {
                        const requested = scanRequest.predicates?.length ?? 0;
                        const pushed = descriptor.pushedPredicates?.length ?? 0;
                        if (pushed < requested) {
                            return jsonRpcError(
                                id,
                                JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE,
                                'Predicates not fully satisfiable in exact mode',
                            );
                        }
                    }
                    return jsonRpcResult(id, descriptor);
                }
                case TdcpMethods.QUERY: {
                    if (!handlers.query) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            'This server does not support tabular/query',
                        );
                    }
                    if (
                        !isRecord(params) ||
                        typeof params.dialect !== 'string' ||
                        typeof params.query !== 'string'
                    ) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/query requires a dialect and a query',
                        );
                    }
                    const queryRequest = params as TdcpQueryRequest;
                    const dialects = handlers.queryDialects ?? [];
                    if (!dialects.includes(queryRequest.dialect)) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            `Dialect "${queryRequest.dialect}" not declared by this server`,
                        );
                    }
                    if (queryRequest.references && !handlers.compose) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            'This server does not support compose references',
                        );
                    }
                    const descriptor = await handlers.query(ctx, queryRequest);
                    return jsonRpcResult(id, requireLinks(descriptor));
                }
                case TdcpMethods.REFRESH: {
                    if (!handlers.refresh) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                            'This server does not support tabular/refresh',
                        );
                    }
                    if (
                        !isRecord(params) ||
                        typeof params.datasetId !== 'string'
                    ) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/refresh requires a datasetId',
                        );
                    }
                    const descriptor = await handlers.refresh(
                        ctx,
                        params as TdcpRefreshRequest,
                    );
                    return jsonRpcResult(id, requireLinks(descriptor));
                }
                default:
                    return jsonRpcError(
                        id,
                        JsonRpcErrorCodes.METHOD_NOT_FOUND,
                        `Unknown method "${method}"`,
                    );
            }
        } catch (e) {
            return jsonRpcError(
                id,
                JsonRpcErrorCodes.INTERNAL_ERROR,
                e instanceof Error ? e.message : 'Internal error',
            );
        }
    };
};
