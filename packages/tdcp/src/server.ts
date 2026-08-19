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
    type TdcpCatalogRequest,
    type TdcpDataRequest,
    type TdcpDataResult,
    type TdcpDescribedTable,
    type TdcpDescribeRequest,
    type TdcpDialectDeclaration,
    type TdcpPollRequest,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpScanPredicate,
    type TdcpScanRequest,
} from './types';
import { isRecord } from './validate';

/** Pre-flight result of a scan: which requested predicates will be pushed. */
export type TdcpScanPlan = {
    pushable: TdcpScanPredicate[];
};

/**
 * Scan is plan-then-execute so exact mode refuses BEFORE any execution:
 * plan declares what will push, the SDK checks it against the request, and
 * only then does execute run (receiving the plan it must honor).
 */
export type TdcpScanHandler<TContext, TDataset> = {
    plan: (ctx: TContext, request: TdcpScanRequest) => Promise<TdcpScanPlan>;
    execute: (
        ctx: TContext,
        request: TdcpScanRequest,
        plan: TdcpScanPlan,
    ) => Promise<TDataset>;
};

export type TdcpServerHandlers<TContext, TDataset> = {
    catalog: (
        ctx: TContext,
        request: TdcpCatalogRequest,
    ) => Promise<TdcpCatalog>;
    describe?: (
        ctx: TContext,
        request: TdcpDescribeRequest,
    ) => Promise<TdcpDescribedTable>;
    read?: (ctx: TContext, request: TdcpReadRequest) => Promise<TDataset>;
    scan?: TdcpScanHandler<TContext, TDataset>;
    query?: (ctx: TContext, request: TdcpQueryRequest) => Promise<TDataset>;
    /** Required for servers whose data handlers can return a pending result. */
    poll?: (ctx: TContext, request: TdcpPollRequest) => Promise<TDataset>;
    /** Static declarations, or a resolver when dialects depend on the context. */
    queryDialects?:
        | TdcpDialectDeclaration[]
        | ((ctx: TContext) => Promise<TdcpDialectDeclaration[]>);
    compose?: boolean;
};

export type TdcpExecutionResult<TDataset> = {
    dataset: TDataset;
    /** Scan only: the plan's pushed predicates; the wire adapter stamps them onto the descriptor. */
    pushedPredicates: TdcpScanPredicate[] | null;
};

/**
 * The transport-independent TDCP server. TDataset is what a data request
 * resolves to: wire servers produce TdcpDataResult; hosts embedding a server
 * in-process may use their own local handle type instead of fabricating
 * descriptors (only wire results carry descriptors).
 */
export type TdcpServer<TContext, TDataset> = {
    capabilities: (ctx: TContext) => Promise<TdcpCapabilities>;
    catalog: (
        ctx: TContext,
        request: TdcpCatalogRequest,
    ) => Promise<TdcpCatalog>;
    describe: (
        ctx: TContext,
        request: TdcpDescribeRequest,
    ) => Promise<TdcpDescribedTable>;
    execute: (
        ctx: TContext,
        request: TdcpDataRequest | TdcpPollRequest,
    ) => Promise<TdcpExecutionResult<TDataset>>;
};

const resolveDialects = async <TContext, TDataset>(
    handlers: TdcpServerHandlers<TContext, TDataset>,
    ctx: TContext,
): Promise<TdcpDialectDeclaration[]> => {
    if (!handlers.query) return [];
    if (handlers.queryDialects === undefined) return [];
    if (typeof handlers.queryDialects === 'function') {
        return handlers.queryDialects(ctx);
    }
    return handlers.queryDialects;
};

const predicatesEqual = (
    left: TdcpScanPredicate,
    right: TdcpScanPredicate,
): boolean =>
    left.column === right.column &&
    left.operator === right.operator &&
    left.values.length === right.values.length &&
    left.values.every((value, index) => Object.is(value, right.values[index]));

export const createTdcpServer = <TContext, TDataset>(
    handlers: TdcpServerHandlers<TContext, TDataset>,
): TdcpServer<TContext, TDataset> => ({
    capabilities: async (ctx) => ({
        revision: TDCP_PROTOCOL_REVISION,
        read: handlers.read !== undefined,
        scan: handlers.scan !== undefined,
        queryDialects: await resolveDialects(handlers, ctx),
        compose: handlers.query !== undefined && (handlers.compose ?? false),
        describe: handlers.describe !== undefined,
    }),
    catalog: handlers.catalog,
    describe: async (ctx, request) => {
        if (!handlers.describe) {
            throw new TdcpError(
                JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                'This server does not support tabular/describe',
            );
        }
        return handlers.describe(ctx, request);
    },
    execute: async (ctx, request) => {
        switch (request.method) {
            case TdcpMethods.READ:
                if (!handlers.read) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/read',
                    );
                }
                return {
                    dataset: await handlers.read(ctx, request),
                    pushedPredicates: null,
                };
            case TdcpMethods.SCAN: {
                if (!handlers.scan) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/scan',
                    );
                }
                const plan = await handlers.scan.plan(ctx, request);
                const requested = request.predicates ?? [];
                if (
                    request.predicateMode === 'exact' &&
                    requested.some(
                        (predicate) =>
                            !plan.pushable.some((candidate) =>
                                predicatesEqual(predicate, candidate),
                            ),
                    )
                ) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.PREDICATES_NOT_SATISFIABLE,
                        'Predicates not fully satisfiable in exact mode',
                    );
                }
                return {
                    dataset: await handlers.scan.execute(ctx, request, plan),
                    pushedPredicates: plan.pushable,
                };
            }
            case TdcpMethods.QUERY: {
                if (!handlers.query) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support tabular/query',
                    );
                }
                const declared = await resolveDialects(handlers, ctx);
                const declaration = declared.find(
                    (candidate) => candidate.dialect === request.dialect,
                );
                if (!declaration) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        `Dialect "${request.dialect}" not declared by this server`,
                    );
                }
                if (
                    declaration.form === 'text'
                        ? typeof request.query !== 'string' ||
                          request.params !== undefined
                        : !isRecord(request.params) ||
                          request.query !== undefined
                ) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.INVALID_PARAMS,
                        `Dialect "${request.dialect}" is ${declaration.form}-form: send exactly ${
                            declaration.form === 'text' ? '"query"' : '"params"'
                        }`,
                    );
                }
                if (request.references && !handlers.compose) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
                        'This server does not support compose references',
                    );
                }
                return {
                    dataset: await handlers.query(ctx, request),
                    pushedPredicates: null,
                };
            }
            case TdcpMethods.POLL:
                if (!handlers.poll) {
                    throw new TdcpError(
                        JsonRpcErrorCodes.METHOD_NOT_FOUND,
                        'This server resolves data requests inline and does not support tabular/poll',
                    );
                }
                return {
                    dataset: await handlers.poll(ctx, request),
                    pushedPredicates: null,
                };
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

const toWireResult = (
    result: TdcpExecutionResult<TdcpDataResult>,
): TdcpDataResult => {
    const { dataset, pushedPredicates } = result;
    if (dataset.status === 'pending') return dataset;
    if (!dataset.links.some((link) => link.encoding === 'jsonl')) {
        throw new TdcpError(
            JsonRpcErrorCodes.INTERNAL_ERROR,
            'A wire-serving TDCP server must return a jsonl data-plane link',
        );
    }
    return pushedPredicates !== null
        ? { ...dataset, pushedPredicates }
        : dataset;
};

/** JSON-RPC adapter over the same server module production hosts call directly. */
export const createTdcpRequestHandler =
    <TContext>(server: TdcpServer<TContext, TdcpDataResult>) =>
    async (
        request: JsonRpcRequest,
        ctx: TContext,
    ): Promise<JsonRpcResponse> => {
        const { id, method, params } = request;
        try {
            switch (method) {
                case TdcpMethods.CAPABILITIES:
                    return jsonRpcResult(id, await server.capabilities(ctx));
                case TdcpMethods.CATALOG: {
                    const cursor = isRecord(params) ? params.cursor : undefined;
                    if (cursor !== undefined && typeof cursor !== 'string') {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/catalog cursor must be a string',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        await server.catalog(ctx, { cursor }),
                    );
                }
                case TdcpMethods.DESCRIBE:
                    if (!isRecord(params) || typeof params.table !== 'string') {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/describe requires a table',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        await server.describe(ctx, {
                            method: TdcpMethods.DESCRIBE,
                            table: params.table,
                        }),
                    );
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
                        toWireResult(
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
                        toWireResult(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.SCAN,
                            } as TdcpScanRequest),
                        ),
                    );
                case TdcpMethods.QUERY:
                    if (
                        !isRecord(params) ||
                        typeof params.dialect !== 'string'
                    ) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/query requires a dialect',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        toWireResult(
                            await server.execute(ctx, {
                                ...params,
                                method: TdcpMethods.QUERY,
                            } as TdcpQueryRequest),
                        ),
                    );
                case TdcpMethods.POLL:
                    if (
                        !isRecord(params) ||
                        typeof params.datasetId !== 'string'
                    ) {
                        return jsonRpcError(
                            id,
                            JsonRpcErrorCodes.INVALID_PARAMS,
                            'tabular/poll requires a datasetId',
                        );
                    }
                    return jsonRpcResult(
                        id,
                        toWireResult(
                            await server.execute(ctx, {
                                method: TdcpMethods.POLL,
                                datasetId: params.datasetId,
                            }),
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
