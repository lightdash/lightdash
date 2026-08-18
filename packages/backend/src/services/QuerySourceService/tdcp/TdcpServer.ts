import {
    ParameterError,
    type Account,
    type QueryExecutionContext,
} from '@lightdash/common';
import {
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
} from '@lightdash/tdcp';

/**
 * Host-side request context. The protocol carries none of this — auth on the
 * wire is MCP OAuth and the remote server resolves its own principal. For
 * in-process servers, the account is the principal and each server applies
 * the same access checks as the execution path it wraps.
 */
export type TdcpCatalogContext = {
    account: Account;
    projectUuid: string;
};

export type TdcpRequestContext = TdcpCatalogContext & {
    queryContext: QueryExecutionContext;
};

/**
 * The TDCP server contract, transport-agnostic. Every query source is one of
 * these: the built-ins run in-process (no network hop, descriptor's
 * datasetId is a queryUuid in the local results pipeline, links: null), and
 * remote servers are reached through the @lightdash/tdcp client.
 *
 * @oliver: this is your QuerySourceClient with the protocol's vocabulary —
 * scanSchema becomes catalog, submitQuery becomes query returning a
 * descriptor instead of a bare queryUuid. TdcpQuerySource adapts any
 * TdcpServer back onto QuerySourceClient so the registry, service,
 * controller and tests are untouched.
 */
export interface TdcpServer {
    capabilities(ctx: TdcpCatalogContext): Promise<TdcpCapabilities>;
    catalog(ctx: TdcpCatalogContext): Promise<TdcpCatalog>;
    /**
     * Submit a data request. Resolves as soon as the dataset is producing —
     * consumers poll the standard query lifecycle (in-process) or the MCP
     * task (remote) for completion.
     */
    query(
        ctx: TdcpRequestContext,
        request: TdcpDataRequest,
    ): Promise<TdcpDatasetDescriptor>;
}

/** The single-dialect gate every built-in tier 2 server starts with. */
export const assertDialectQuery = (
    request: TdcpDataRequest,
    dialect: string,
    sourceLabel: string,
): TdcpQueryRequest => {
    if (request.method !== TdcpMethods.QUERY || request.dialect !== dialect) {
        throw new ParameterError(
            `The ${sourceLabel} source only accepts ${TdcpMethods.QUERY} requests in the ${dialect} dialect`,
        );
    }
    return request;
};

/**
 * Descriptor for in-process servers: local pipeline, no links, schema
 * deferred. Local datasets live in query_history, whose columns — filled in
 * by column discovery during execution — are the host's source of truth;
 * duplicating them here at submit time would race that discovery. Wire
 * descriptors MUST carry schema and links, which the SDK's request handler
 * enforces before anything reaches the wire.
 */
export const localDatasetDescriptor = (args: {
    queryUuid: string;
    expiresAt: Date;
}): TdcpDatasetDescriptor => ({
    datasetId: args.queryUuid,
    schema: [],
    rowCount: null,
    producedAt: new Date().toISOString(),
    expiresAt: args.expiresAt.toISOString(),
    freshness: {
        sourceQueriedAt: new Date().toISOString(),
        cacheHit: false,
    },
    links: null,
});
