import { type TdcpCapabilities, type TdcpCatalog, type TdcpDataLink, type TdcpDatasetDescriptor, type TdcpQueryRequest, type TdcpReadRequest, type TdcpScanRequest } from './types';
type TdcpClientArguments = {
    /** URL of the server's TDCP endpoint. */
    url: string;
    /** Control-plane bearer token, if the server requires one. */
    token?: string;
    /**
     * Override the fetch implementation — hosts inject their hardened
     * egress fetch (timeouts, SSRF guards) here.
     */
    fetchImpl?: typeof fetch;
};
/**
 * Draft TDCP client over the JSON-RPC transport. On the real MCP transport
 * this class keeps its surface and swaps rpc() for extension method calls
 * on an MCP session — consumers never see the difference.
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
     * Fetch a dataset's rows from its jsonl data-plane link. Buffers the
     * body — a streaming variant lands with the Arrow encoding.
     */
    fetchJsonlRows(link: TdcpDataLink): AsyncGenerator<Record<string, unknown>>;
}
export {};
//# sourceMappingURL=client.d.ts.map