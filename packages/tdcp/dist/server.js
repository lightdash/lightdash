"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTdcpRequestHandler = void 0;
const jsonrpc_1 = require("./jsonrpc");
const types_1 = require("./types");
const deriveCapabilities = (handlers) => ({
    revision: types_1.TDCP_PROTOCOL_REVISION,
    read: handlers.read !== undefined,
    scan: handlers.scan !== undefined,
    queryDialects: handlers.query ? (handlers.queryDialects ?? []) : [],
    compose: handlers.compose ?? false,
});
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/**
 * Builds the request handler at the heart of a TDCP server: one JSON-RPC
 * request in, one response out, transport left to the caller. A wire
 * descriptor MUST carry data-plane links — this is enforced here so no
 * conforming server can leak a linkless (in-process) descriptor.
 */
const createTdcpRequestHandler = (handlers) => {
    const requireLinks = (descriptor) => {
        if (!descriptor.links || descriptor.links.length === 0) {
            throw new Error('A wire-serving TDCP server must return data-plane links on every descriptor');
        }
        return descriptor;
    };
    return async (request, ctx) => {
        const { id, method, params } = request;
        try {
            switch (method) {
                case types_1.TdcpMethods.CAPABILITIES: {
                    const capabilities = handlers.capabilities
                        ? await handlers.capabilities(ctx)
                        : deriveCapabilities(handlers);
                    return (0, jsonrpc_1.jsonRpcResult)(id, capabilities);
                }
                case types_1.TdcpMethods.CATALOG:
                    return (0, jsonrpc_1.jsonRpcResult)(id, await handlers.catalog(ctx));
                case types_1.TdcpMethods.READ: {
                    if (!handlers.read) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, 'This server does not support tabular/read');
                    }
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.INVALID_PARAMS, 'tabular/read requires a table');
                    }
                    const descriptor = await handlers.read(ctx, params);
                    return (0, jsonrpc_1.jsonRpcResult)(id, requireLinks(descriptor));
                }
                case types_1.TdcpMethods.SCAN: {
                    if (!handlers.scan) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, 'This server does not support tabular/scan');
                    }
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.INVALID_PARAMS, 'tabular/scan requires a table');
                    }
                    const scanRequest = params;
                    const descriptor = requireLinks(await handlers.scan(ctx, scanRequest));
                    // The exact contract: fully pushed or refused, never
                    // silently partial — thin clients depend on this.
                    if (scanRequest.predicateMode === 'exact') {
                        const requested = scanRequest.predicates?.length ?? 0;
                        const pushed = descriptor.pushedPredicates?.length ?? 0;
                        if (pushed < requested) {
                            return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE, 'Predicates not fully satisfiable in exact mode');
                        }
                    }
                    return (0, jsonrpc_1.jsonRpcResult)(id, descriptor);
                }
                case types_1.TdcpMethods.QUERY: {
                    if (!handlers.query) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, 'This server does not support tabular/query');
                    }
                    if (!isRecord(params) ||
                        typeof params.dialect !== 'string' ||
                        typeof params.query !== 'string') {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.INVALID_PARAMS, 'tabular/query requires a dialect and a query');
                    }
                    const queryRequest = params;
                    const dialects = handlers.queryDialects ?? [];
                    if (!dialects.includes(queryRequest.dialect)) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, `Dialect "${queryRequest.dialect}" not declared by this server`);
                    }
                    if (queryRequest.references && !handlers.compose) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, 'This server does not support compose references');
                    }
                    const descriptor = await handlers.query(ctx, queryRequest);
                    return (0, jsonrpc_1.jsonRpcResult)(id, requireLinks(descriptor));
                }
                case types_1.TdcpMethods.REFRESH: {
                    if (!handlers.refresh) {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED, 'This server does not support tabular/refresh');
                    }
                    if (!isRecord(params) ||
                        typeof params.datasetId !== 'string') {
                        return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.INVALID_PARAMS, 'tabular/refresh requires a datasetId');
                    }
                    const descriptor = await handlers.refresh(ctx, params);
                    return (0, jsonrpc_1.jsonRpcResult)(id, requireLinks(descriptor));
                }
                default:
                    return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.METHOD_NOT_FOUND, `Unknown method "${method}"`);
            }
        }
        catch (e) {
            return (0, jsonrpc_1.jsonRpcError)(id, jsonrpc_1.JsonRpcErrorCodes.INTERNAL_ERROR, e instanceof Error ? e.message : 'Internal error');
        }
    };
};
exports.createTdcpRequestHandler = createTdcpRequestHandler;
//# sourceMappingURL=server.js.map