import {
    ParameterError,
    TdcpMethods,
    UnexpectedServerError,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataLink,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import type {
    TdcpCatalogContext,
    TdcpRequestContext,
    TdcpServer,
} from './TdcpServer';

type RemoteTdcpServerArguments = {
    /** Base URL of the remote server's TDCP endpoint. */
    url: string;
};

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: string;
    result?: unknown;
    error?: { code: number; message: string };
};

/**
 * A remote TDCP server over the draft control plane: JSON-RPC 2.0 request
 * per method, dataset rows fetched out of band from the descriptor's links.
 *
 * @oliver: three deliberate draft shortcuts, all load-bearing before ship —
 * 1. Transport is bare JSON-RPC over HTTP. The real transport is the MCP
 *    SDK client (extension methods on an MCP session), which buys OAuth,
 *    task polling and capability negotiation. PersistentMcpOAuthClientProvider
 *    and the ai_mcp_server credential model plug in there unchanged.
 * 2. No egress hardening: this must go through createMcpTimeoutFetch (SSRF
 *    guard, timeouts) once server registration lands in the sources entity.
 * 3. The data plane buffers the JSONL body; the real implementation streams
 *    response body -> S3 upload stream without holding rows in memory.
 */
export class RemoteTdcpServer implements TdcpServer {
    private readonly url: string;

    constructor(args: RemoteTdcpServerArguments) {
        this.url = args.url;
    }

    private async rpc(method: string, params: unknown): Promise<unknown> {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: uuidv4(),
                method,
                params,
            }),
        });

        if (!response.ok) {
            throw new UnexpectedServerError(
                `TDCP server responded ${response.status} to ${method}`,
            );
        }

        let body: JsonRpcResponse;
        try {
            body = (await response.json()) as JsonRpcResponse;
        } catch (e) {
            throw new UnexpectedServerError(
                `TDCP server returned a non-JSON response to ${method}`,
            );
        }

        if (body.error) {
            throw new UnexpectedServerError(
                `TDCP server error on ${method}: ${body.error.message}`,
            );
        }

        return body.result;
    }

    async capabilities(_ctx: TdcpCatalogContext): Promise<TdcpCapabilities> {
        return (await this.rpc(
            TdcpMethods.CAPABILITIES,
            {},
        )) as TdcpCapabilities;
    }

    async catalog(_ctx: TdcpCatalogContext): Promise<TdcpCatalog> {
        return (await this.rpc(TdcpMethods.CATALOG, {})) as TdcpCatalog;
    }

    async query(
        _ctx: TdcpRequestContext,
        request: TdcpDataRequest,
    ): Promise<TdcpDatasetDescriptor> {
        const descriptor = (await this.rpc(
            request.method,
            request,
        )) as TdcpDatasetDescriptor;

        if (!descriptor || typeof descriptor.datasetId !== 'string') {
            throw new UnexpectedServerError(
                'TDCP server returned an invalid dataset descriptor',
            );
        }
        return descriptor;
    }

    /**
     * Fetch a remote dataset's rows from its jsonl data-plane link. The
     * descriptor's schema is the contract; rows are parsed line by line.
     */
    static async *fetchJsonlRows(
        link: TdcpDataLink,
    ): AsyncGenerator<Record<string, unknown>> {
        const response = await fetch(link.href, {
            headers: link.token
                ? { Authorization: `Bearer ${link.token}` }
                : {},
        });
        if (!response.ok) {
            throw new UnexpectedServerError(
                `TDCP data plane responded ${response.status}`,
            );
        }

        const body = await response.text();
        const lines = body.split('\n').filter((line) => line.trim().length > 0);
        for (const line of lines) {
            let row: Record<string, unknown>;
            try {
                row = JSON.parse(line);
            } catch (e) {
                throw new ParameterError(
                    'TDCP data plane returned malformed JSONL',
                );
            }
            yield row;
        }
    }
}
