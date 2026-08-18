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

export const JsonRpcErrorCodes = {
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
} as const;

export const jsonRpcResult = (
    id: JsonRpcId,
    result: unknown,
): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });

export const jsonRpcError = (
    id: JsonRpcId | null,
    code: number,
    message: string,
): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * The error a handler throws to answer with a specific protocol code —
 * "dataset expired" is -32012, not a generic internal error. Anything else
 * a handler throws maps to INTERNAL_ERROR with its message.
 */
export class TdcpError extends Error {
    public readonly code: number;

    constructor(code: number, message: string) {
        super(message);
        this.name = 'TdcpError';
        this.code = code;
    }
}
