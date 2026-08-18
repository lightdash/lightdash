import type {
    Account,
    QueryExecutionContext,
    TdcpCapabilities,
    TdcpCatalog,
    TdcpDataRequest,
    TdcpDatasetDescriptor,
} from '@lightdash/common';

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
 * RemoteTdcpServer speaks the draft JSON-RPC control plane to servers
 * outside the deployment (descriptors carry data-plane links).
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

/** Descriptor helper for in-process servers: local pipeline, no links. */
export const localDatasetDescriptor = (args: {
    queryUuid: string;
    expiresAt: Date;
}): TdcpDatasetDescriptor => ({
    datasetId: args.queryUuid,
    // The local pipeline discovers columns during execution; the descriptor
    // is minted at submit time, mirroring the async query API.
    // @oliver: the spec wants schema on the descriptor. In-process that
    // means waiting for column discovery or a second descriptor fetch —
    // leaning towards refresh-style "descriptor may gain schema once
    // running" semantics. Flagging rather than deciding in the draft.
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
