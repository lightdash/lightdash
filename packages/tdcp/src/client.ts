import {
    type JsonRpcRequest,
    type JsonRpcResponse,
} from './jsonrpc';
import {
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataLink,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpScanRequest,
} from './types';

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
export class TdcpClient {
    private readonly url: string;

    private readonly token: string | undefined;

    private readonly fetchImpl: typeof fetch;

    private requestId = 0;

    constructor(args: TdcpClientArguments) {
        this.url = args.url;
        this.token = args.token;
        this.fetchImpl = args.fetchImpl ?? fetch;
    }

    private async rpc(method: string, params: unknown): Promise<unknown> {
        this.requestId += 1;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id: this.requestId,
            method,
            params,
        };
        const response = await this.fetchImpl(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token
                    ? { Authorization: `Bearer ${this.token}` }
                    : {}),
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error(
                `TDCP server responded ${response.status} to ${method}`,
            );
        }
        let body: JsonRpcResponse;
        try {
            body = (await response.json()) as JsonRpcResponse;
        } catch (e) {
            throw new Error(
                `TDCP server returned a non-JSON response to ${method}`,
            );
        }
        if (body.error) {
            throw new Error(
                `TDCP server error on ${method} (${body.error.code}): ${body.error.message}`,
            );
        }
        return body.result;
    }

    async capabilities(): Promise<TdcpCapabilities> {
        return (await this.rpc(
            TdcpMethods.CAPABILITIES,
            {},
        )) as TdcpCapabilities;
    }

    async catalog(): Promise<TdcpCatalog> {
        return (await this.rpc(TdcpMethods.CATALOG, {})) as TdcpCatalog;
    }

    async read(
        request: Omit<TdcpReadRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return (await this.rpc(TdcpMethods.READ, {
            ...request,
            method: TdcpMethods.READ,
        })) as TdcpDatasetDescriptor;
    }

    async scan(
        request: Omit<TdcpScanRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return (await this.rpc(TdcpMethods.SCAN, {
            ...request,
            method: TdcpMethods.SCAN,
        })) as TdcpDatasetDescriptor;
    }

    async query(
        request: Omit<TdcpQueryRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return (await this.rpc(TdcpMethods.QUERY, {
            ...request,
            method: TdcpMethods.QUERY,
        })) as TdcpDatasetDescriptor;
    }

    async refresh(datasetId: string): Promise<TdcpDatasetDescriptor> {
        return (await this.rpc(TdcpMethods.REFRESH, {
            method: TdcpMethods.REFRESH,
            datasetId,
        })) as TdcpDatasetDescriptor;
    }

    /**
     * Fetch a dataset's rows from its jsonl data-plane link. Buffers the
     * body — a streaming variant lands with the Arrow encoding.
     */
    async *fetchJsonlRows(
        link: TdcpDataLink,
    ): AsyncGenerator<Record<string, unknown>> {
        const response = await this.fetchImpl(link.href, {
            headers: link.token
                ? { Authorization: `Bearer ${link.token}` }
                : {},
        });
        if (!response.ok) {
            throw new Error(`TDCP data plane responded ${response.status}`);
        }
        const body = await response.text();
        const lines = body
            .split('\n')
            .filter((line) => line.trim().length > 0);
        for (const line of lines) {
            let row: Record<string, unknown>;
            try {
                row = JSON.parse(line);
            } catch (e) {
                throw new Error('TDCP data plane returned malformed JSONL');
            }
            yield row;
        }
    }
}
