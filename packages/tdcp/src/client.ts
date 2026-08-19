import { jsonlRows } from './jsonl';
import { type JsonRpcRequest, type JsonRpcResponse } from './jsonrpc';
import {
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataLink,
    type TdcpDataResult,
    type TdcpDatasetDescriptor,
    type TdcpDescribedTable,
    type TdcpQueryRequest,
    type TdcpReadRequest,
    type TdcpScanRequest,
} from './types';
import {
    assertCapabilities,
    assertCatalog,
    assertDataResult,
    assertDescribedTable,
} from './validate';

const DEFAULT_CONTROL_PLANE_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_WAIT_TIMEOUT_MS = 600_000;

/**
 * A JSON-RPC error from a TDCP server, with the machine-readable code kept
 * intact — agents branch on codes (-32012 = dataset expired: re-submit the
 * original request), humans read the message.
 */
export class TdcpClientError extends Error {
    public readonly code: number;

    public readonly data: unknown;

    constructor(code: number, message: string, data: unknown) {
        super(message);
        this.name = 'TdcpClientError';
        this.code = code;
        this.data = data;
    }
}

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
    /** Cap on a single control-plane exchange (request + response body). */
    controlPlaneTimeoutMs?: number;
};

const withTimeout = async <T>(
    work: Promise<T>,
    ms: number,
    label: string,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out after ${ms}ms`)),
                    ms,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Draft TDCP client over the JSON-RPC transport. Every wire response is
 * structurally validated before it is typed; dataset rows stream. On an MCP
 * transport this class keeps its surface and swaps rpc() for extension
 * method calls on an MCP session — consumers never notice.
 */
export class TdcpClient {
    private readonly url: string;

    private readonly token: string | undefined;

    private readonly fetchImpl: typeof fetch;

    private readonly controlPlaneTimeoutMs: number;

    private requestId = 0;

    constructor(args: TdcpClientArguments) {
        this.url = args.url;
        this.token = args.token;
        this.fetchImpl = args.fetchImpl ?? fetch;
        this.controlPlaneTimeoutMs =
            args.controlPlaneTimeoutMs ?? DEFAULT_CONTROL_PLANE_TIMEOUT_MS;
    }

    private async rpc(method: string, params: unknown): Promise<unknown> {
        this.requestId += 1;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id: this.requestId,
            method,
            params,
        };
        const exchange = async (): Promise<unknown> => {
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
                throw new TdcpClientError(
                    body.error.code,
                    `TDCP server error on ${method} (${body.error.code}): ${body.error.message}`,
                    body.error.data,
                );
            }
            return body.result;
        };
        return withTimeout(
            exchange(),
            this.controlPlaneTimeoutMs,
            `TDCP ${method}`,
        );
    }

    async capabilities(): Promise<TdcpCapabilities> {
        return assertCapabilities(await this.rpc(TdcpMethods.CAPABILITIES, {}));
    }

    async catalog(cursor?: string): Promise<TdcpCatalog> {
        return assertCatalog(
            await this.rpc(
                TdcpMethods.CATALOG,
                cursor === undefined ? {} : { cursor },
            ),
        );
    }

    async describe(table: string): Promise<TdcpDescribedTable> {
        return assertDescribedTable(
            await this.rpc(TdcpMethods.DESCRIBE, { table }),
        );
    }

    async read(
        request: Omit<TdcpReadRequest, 'method'>,
    ): Promise<TdcpDataResult> {
        return assertDataResult(
            await this.rpc(TdcpMethods.READ, {
                ...request,
                method: TdcpMethods.READ,
            }),
        );
    }

    async scan(
        request: Omit<TdcpScanRequest, 'method'>,
    ): Promise<TdcpDataResult> {
        return assertDataResult(
            await this.rpc(TdcpMethods.SCAN, {
                ...request,
                method: TdcpMethods.SCAN,
            }),
        );
    }

    async query(
        request: Omit<TdcpQueryRequest, 'method'>,
    ): Promise<TdcpDataResult> {
        return assertDataResult(
            await this.rpc(TdcpMethods.QUERY, {
                ...request,
                method: TdcpMethods.QUERY,
            }),
        );
    }

    async poll(datasetId: string): Promise<TdcpDataResult> {
        return assertDataResult(
            await this.rpc(TdcpMethods.POLL, {
                method: TdcpMethods.POLL,
                datasetId,
            }),
        );
    }

    /**
     * Resolve a data result to a ready descriptor, polling while pending.
     * The server's pollAfterMs hint wins over pollIntervalMs when present.
     */
    async waitForReady(
        result: TdcpDataResult,
        options?: { pollIntervalMs?: number; timeoutMs?: number },
    ): Promise<TdcpDatasetDescriptor> {
        const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
        const startedAt = Date.now();
        let current = result;
        while (current.status === 'pending') {
            const waitMs =
                current.pollAfterMs ??
                options?.pollIntervalMs ??
                DEFAULT_POLL_INTERVAL_MS;
            if (Date.now() + waitMs - startedAt > timeoutMs) {
                throw new Error(
                    `TDCP dataset ${current.datasetId} still pending after ${timeoutMs}ms`,
                );
            }
            // eslint-disable-next-line no-await-in-loop -- polling is inherently sequential
            await new Promise((resolve) => {
                setTimeout(resolve, waitMs);
            });
            // eslint-disable-next-line no-await-in-loop -- polling is inherently sequential
            current = await this.poll(current.datasetId);
        }
        return current;
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
