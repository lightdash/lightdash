"use strict";
/**
 * Minimal JSON-RPC 2.0 shapes for the draft transport. The real transport
 * is MCP (the extension rides an MCP session); this exists so a reference
 * server is runnable with zero dependencies while the shapes settle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonRpcError = exports.jsonRpcResult = exports.JsonRpcErrorCodes = void 0;
exports.JsonRpcErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    /** TDCP: the request needs a capability this server does not declare. */
    CAPABILITY_NOT_SUPPORTED: -32010,
    /** TDCP: exact predicate mode requested, predicates not fully pushable. */
    PREDICATES_NOT_SATISFIABLE: -32011,
    /** TDCP: the referenced dataset expired or never existed. */
    DATASET_NOT_FOUND: -32012,
};
const jsonRpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
exports.jsonRpcResult = jsonRpcResult;
const jsonRpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
exports.jsonRpcError = jsonRpcError;
//# sourceMappingURL=jsonrpc.js.map