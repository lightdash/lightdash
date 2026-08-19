import { once } from 'events';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { TdcpDatasetStore } from './datasetStore';
import {
    JsonRpcErrorCodes,
    jsonRpcError,
    type JsonRpcRequest,
    type JsonRpcResponse,
} from './jsonrpc';

/**
 * node:http binding for a TDCP server: POST {base}/rpc runs the control
 * plane through the request handler, GET {base}/data/{id} serves the data
 * plane from the dataset store with bearer auth. Not exported from the
 * package index so the index stays free of node builtins — import from
 * '@lightdash/tdcp/dist/nodeHttp' (or ../src/nodeHttp in this repo).
 */
export type TdcpNodeServerArgs<TContext> = {
    handler: (
        request: JsonRpcRequest,
        ctx: TContext,
    ) => Promise<JsonRpcResponse>;
    store: TdcpDatasetStore;
    port: number;
    host?: string;
    /** Resolves the per-request context (the principal, on real transports). */
    resolveContext: (req: IncomingMessage) => TContext | Promise<TContext>;
    /**
     * Resolves the data-plane caller's principal, matched against the
     * principal each dataset was minted under. Defaults to null (single-
     * principal server).
     */
    resolvePrincipal?: (
        req: IncomingMessage,
    ) => string | null | Promise<string | null>;
};

export const startTdcpNodeServer = async <TContext>(
    args: TdcpNodeServerArgs<TContext>,
): Promise<{ server: Server; url: string }> => {
    const host = args.host ?? '127.0.0.1';
    const server = createServer(async (req, res) => {
        try {
            if (req.method === 'POST' && req.url === '/rpc') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                let request: JsonRpcRequest;
                try {
                    request = JSON.parse(
                        Buffer.concat(chunks).toString('utf8'),
                    );
                } catch (e) {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                    });
                    res.end(
                        JSON.stringify(
                            jsonRpcError(
                                null,
                                JsonRpcErrorCodes.PARSE_ERROR,
                                'Invalid JSON',
                            ),
                        ),
                    );
                    return;
                }
                const ctx = await args.resolveContext(req);
                const response = await args.handler(request, ctx);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
                return;
            }

            const dataMatch = req.url?.match(/^\/data\/([A-Za-z0-9_-]+)$/);
            if (req.method === 'GET' && dataMatch) {
                const bearer =
                    req.headers.authorization?.replace('Bearer ', '') ?? null;
                const principal = await (args.resolvePrincipal?.(req) ?? null);
                const read = args.store.read(dataMatch[1], bearer, principal);
                if (read.kind === 'notFound') {
                    res.writeHead(404).end();
                    return;
                }
                if (read.kind === 'unauthorized') {
                    res.writeHead(401).end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/jsonl' });
                for (const row of read.rows) {
                    if (!res.write(`${JSON.stringify(row)}\n`)) {
                        // eslint-disable-next-line no-await-in-loop -- backpressure: wait for the socket to drain
                        await once(res, 'drain');
                    }
                }
                res.end();
                return;
            }

            res.writeHead(404).end();
        } catch (e) {
            res.writeHead(500).end();
        }
    });

    await new Promise<void>((resolve) => {
        server.listen(args.port, host, resolve);
    });
    return { server, url: `http://${host}:${args.port}` };
};
