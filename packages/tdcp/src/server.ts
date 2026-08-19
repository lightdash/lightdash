import {
    JsonRpcErrorCodes,
    jsonRpcError,
    jsonRpcResult,
    TdcpError,
    type JsonRpcRequest,
    type JsonRpcResponse,
} from './jsonrpc';
import {
    TDCP_PROTOCOL_REVISION,
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpRefreshRequest,
    type TdcpScanPredicate,
    type TdcpScanRequest,
} from './types';

export type TdcpServerHandlers<
    TCatalogContext = undefined,
    TRequestContext extends TCatalogContext = TCatalogContext,
> = {
    catalog: (ctx: TCatalogContext) => Promise<TdcpCatalog>;
    read?: (
        ctx: TRequestContext,
        request: TdcpReadRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    scan?: (
        ctx: TRequestContext,
        request: TdcpScanRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    query?: (
        ctx: TRequestContext,
        request: TdcpQueryRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    refresh?: (
        ctx: TRequestContext,
        request: TdcpRefreshRequest,
    ) => Promise<TdcpDatasetDescriptor>;
    queryDialects?: string[];
    compose?: boolean;
};

/**
 * The transport-independent TDCP server used by production hosts and wire
 * adapters alike. Protocol guarantees live behind this interface.
 */
export type TdcpServer<
    TCatalogContext = undefined,
    TRequestContext extends TCatalogContext = TCatalogContext,
> = {
    capabilities: (ctx: TCatalogContext) => Promise<TdcpCapabilities>;
    catalog: (ctx: TCatalogContext) => Promise<TdcpCatalog>;
    execute: (
        ctx: TRequestContext,
        request: TdcpDataRequest | TdcpRefreshRequest,
    ) => Promise<TdcpDatasetDescriptor>;
};

const deriveCapabilities = <
    TCatalogContext,
    TRequestContext extends TCatalogContext,
>(
    handlers: TdcpServerHandlers<TCatalogContext, TRequestContext>,
): TdcpCapabilities => ({
    revision: TDCP_PROTOCOL_REVISION,
    read: handlers.read !== undefined,
    scan: handlers.scan !== undefined,
    queryDialects: handlers.query ? [...(handlers.queryDialects ?? [])] : [],
    compose: handlers.query !== undefined && (handlers.compose ?? false),
});

const predicatesEqual = (
    left: TdcpScanPredicate,
    right: TdcpScanPredicate,
): boolean =>
    left.column === right.column &&
    left.operator === right.operator &&
    left.values.length === right.values.length &&
    left.values.every((value, index) => Object.is(value, right.values[index]));

export const createTdcpServer = <
    TCatalogContext,
    TRequestContext extends TCatalogContext,
>(
    handlers: TdcpServerHandlers<TCatalogContext, TRequestContext>,
): TdcpServer<TCatalogContext, TRequestContext> => ({
    capabilities: async () => deriveCapabilities(handlers),
    catalog: handlers.catalog,
    execute: async (ctx, request) => {
        switch (request.method) {
            case TdcpMethods.READ:
                if (!handlers.read) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/read',
                    );
                }
                return handlers.read(ctx, request);
            case TdcpMethods.SCAN: {
                if (!handlers.scan) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/scan',
                    );
                }
                const descriptor = await handlers.scan(ctx, request);
                const requested = request.predicates ?? [];
                const pushed = descriptor.pushedPredicates ?? [];
                if (
                    request.predicateMode === 'exact' &&
                    requested.some(
                        (predicate) =>
                            !pushed.some((candidate) =>
                                predicatesEqual(predicate, candidate),
                            ),
                    )
                ) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE,
                        'Predicates not fully satisfiable in exact mode',
                    );
                }
                return { ...descriptor, pushedPredicates: pushed };
            }
            case TdcpMethods.QUERY:
                if (!handlers.query) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/query',
                    );
                }
                if (!(handlers.queryDialects ?? []).includes(request.dialect)) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        `Dialect "${request.dialect}" not declared by this server`,
                    );
                }
                if (request.references && !handlers.compose) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support compose references',
                    );
                }
                return handlers.query(ctx, request);
            case TdcpMethods.REFRESH:
                if (!handlers.refresh) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/refresh',
                    );
                }
                return handlers.refresh(ctx, request);
            default: {
                const unreachable: never = request;
                throw new TdcpError(
                    JsonRpcErrorCodes.METHOD_NOT_FOUND,
                    `Unknown TDCP request ${JSON.stringify(unreachable)}`,
                );
            }
        }
    },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const requireLinks = (
    descriptor: TdcpDatasetDescriptor,
): TdcpDatasetDescriptor => {
    if (!descriptor.links?.some((link) => link.encoding === 'jsonl')) {
        throw new Error(
            'A wire-serving TDCP server must return a jsonl data-plane link',
        );
    }
    return descriptor;
};

/** JSON-RPC adapter over the same server module production hosts call directly. */
export const createTdcpRequestHandler =
    <
        TCatalogContext = undefined,
        TRequestContext extends TCatalogContext = TCatalogContext,
    >(
        server: TdcpServer<TCatalogContext, TRequestContext>,
    ) =>
    async (
        request: JsonRpcRequest,
        ctx: TRequestContext,
    ): Promise<JsonRpcResponse> => {
        const { id, method, params } = request;
        try {
            switch (method) {
                case TdcpMethods.CAPABILITIES:
                    return jsonRpcResult(id, await server.capabilities(ctx));
                case TdcpMethods.CATALOG:
                    return jsonRpcResult(id, await server.catalog(ctx));
                case TdcpMethods.READ:
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/read requires a table',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        requireLinks(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.READ,
                            } as TdcpReadRequest),
                        ),
                    );
                case TdcpMethods.SCAN:
                    if (
                        !isRecord(params) ||
                        typeof params.table !== 'string' ||
                        (params.predicateMode !== 'exact' &&
                            params.predicateMode !== 'bestEffort')
                    ) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/scan requires a table and predicateMode',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        requireLinks(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.SCAN,
                            } as TdcpScanRequest),
                        ),
                    );
                case TdcpMethods.QUERY:
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
                    return jsonRpcResult(
                        id,
                        requireLinks(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.QUERY,
                            } as TdcpQueryRequest),
                        ),
                    );
                case TdcpMethods.REFRESH:
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
                    return jsonRpcResult(
                        id,
                        requireLinks(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.REFRESH,
                            } as TdcpRefreshRequest),
                        ),
                    );
                default:
                    return jsonRpcError(
                        id,
                        JsonRpcErrorCodes.METHOD_NOT_FOUND,
                        `Unknown method "${method}"`,
                    );
            }
        } catch (error) {
            if (error instanceof TdcpError) {
                return jsonRpcError(id, error.code, error.message);
            }
            return jsonRpcError(
                id,
                JsonRpcErrorCodes.INTERNAL_ERROR,
                error instanceof Error ? error.message : 'Internal error',
            );
        }
    };
