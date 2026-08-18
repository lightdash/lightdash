import { jsonlRows } from './jsonl';
import { type JsonRpcRequest, type JsonRpcResponse } from './jsonrpc';
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
import {
    assertCapabilities,
    assertCatalog,
    assertDatasetDescriptor,
} from './validate';

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
        return assertCapabilities(await this.rpc(TdcpMethods.CAPABILITIES, {}));
    }

    async catalog(): Promise<TdcpCatalog> {
        return assertCatalog(await this.rpc(TdcpMethods.CATALOG, {}));
    }

    async read(
        request: Omit<TdcpReadRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return assertDatasetDescriptor(
            await this.rpc(TdcpMethods.READ, {
                ...request,
                method: TdcpMethods.READ,
            }),
        );
    }

    async scan(
        request: Omit<TdcpScanRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return assertDatasetDescriptor(
            await this.rpc(TdcpMethods.SCAN, {
                ...request,
                method: TdcpMethods.SCAN,
            }),
        );
    }

    async query(
        request: Omit<TdcpQueryRequest, 'method'>,
    ): Promise<TdcpDatasetDescriptor> {
        return assertDatasetDescriptor(
            await this.rpc(TdcpMethods.QUERY, {
                ...request,
                method: TdcpMethods.QUERY,
            }),
        );
    }

    async refresh(datasetId: string): Promise<TdcpDatasetDescriptor> {
        return assertDatasetDescriptor(
            await this.rpc(TdcpMethods.REFRESH, {
                method: TdcpMethods.REFRESH,
                datasetId,
            }),
        );
    }

    /**
     * Stream a dataset's rows from its jsonl data-plane link — one line in
     * memory at a time.
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
        yield* jsonlRows(response);
    }
}
