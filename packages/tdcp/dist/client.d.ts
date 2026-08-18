import { type TdcpCapabilities, type TdcpCatalog, type TdcpDataLink, type TdcpDatasetDescriptor, type TdcpQueryRequest, type TdcpReadRequest, type TdcpScanRequest } from './types';
type TdcpClientArguments = {
    /** URL of the server's TDCP endpoint. */
    url: string;
    /** Control-plane bearer token, if the server requires one. */
    token?: string;
    /**
     * Override the fetch implementation — hosts inject their hardened
     * egress fetch (URL validation, timeouts) here. Used for both planes.
     */
    fetchImpl?: typeof fetch;
};
/**
 * Draft TDCP client over the JSON-RPC transport. Every wire response is
 * structurally validated before it is typed; dataset rows stream. On the
 * real MCP transport this class keeps its surface and swaps rpc() for
 * extension method calls on an MCP session — consumers never notice.
 */
export declare class TdcpClient {
    private readonly url;
    private readonly token;
    private readonly fetchImpl;
    private requestId;
    constructor(args: TdcpClientArguments);
    private rpc;
    capabilities(): Promise<TdcpCapabilities>;
    catalog(): Promise<TdcpCatalog>;
    read(request: Omit<TdcpReadRequest, 'method'>): Promise<TdcpDatasetDescriptor>;
    scan(request: Omit<TdcpScanRequest, 'method'>): Promise<TdcpDatasetDescriptor>;
    query(request: Omit<TdcpQueryRequest, 'method'>): Promise<TdcpDatasetDescriptor>;
    refresh(datasetId: string): Promise<TdcpDatasetDescriptor>;
    /**
     * Stream a dataset's rows from its jsonl data-plane link — one line in
     * memory at a time.
     */
    fetchJsonlRows(link: TdcpDataLink): AsyncGenerator<Record<string, unknown>>;
}
export {};
//# sourceMappingURL=client.d.ts.map