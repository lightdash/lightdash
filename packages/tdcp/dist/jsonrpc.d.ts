/**
 * Minimal JSON-RPC 2.0 shapes for the draft transport. The real transport
 * is MCP (the extension rides an MCP session); this exists so a reference
 * server is runnable with zero dependencies while the shapes settle.
 */
export type JsonRpcId = string | number;
export type JsonRpcRequest = {
    jsonrpc: '2.0';
    id: JsonRpcId;
    method: string;
    params?: unknown;
};
export type JsonRpcError = {
    code: number;
    message: string;
    data?: unknown;
};
export type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: JsonRpcId | null;
    result?: unknown;
    error?: JsonRpcError;
};
export declare const JsonRpcErrorCodes: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    /** TDCP: the request needs a capability this server does not declare. */
    readonly CAPABILITY_NOT_SUPPORTED: -32010;
    /** TDCP: exact predicate mode requested, predicates not fully pushable. */
    readonly PREDICATES_NOT_SATISFIABLE: -32011;
    /** TDCP: the referenced dataset expired or never existed. */
    readonly DATASET_NOT_FOUND: -32012;
};
export declare const jsonRpcResult: (id: JsonRpcId, result: unknown) => JsonRpcResponse;
export declare const jsonRpcError: (id: JsonRpcId | null, code: number, message: string) => JsonRpcResponse;
/**
 * The error a handler throws to answer with a specific protocol code —
 * "dataset expired" is -32012, not a generic internal error. Anything else
 * a handler throws maps to INTERNAL_ERROR with its message.
 */
export declare class TdcpError extends Error {
    readonly code: number;
    constructor(code: number, message: string);
}
//# sourceMappingURL=jsonrpc.d.ts.map