import { createServer, type RequestListener, type Server } from 'http';

export type ConnectionCallback = { code: string; grantUuid: string | null };
export class ConnectionCallbackError extends Error {
    readonly code:
        | 'agent_connections_unavailable'
        | 'agent_identity_disabled'
        | null;

    constructor(code: string) {
        super('Agent connection approval was denied. No credential was saved.');
        this.code =
            code === 'agent_connections_unavailable' ||
            code === 'agent_identity_disabled'
                ? code
                : null;
    }
}
export const createConnectionLoopback = async ({
    port,
    state,
    issuer,
    signal,
}: {
    port: number;
    state: string;
    issuer: string;
    signal: AbortSignal;
}) => {
    let settled = false;
    let resolveResult: (value: ConnectionCallback) => void = () => {};
    let rejectResult: (error: Error) => void = () => {};
    const result = new Promise<ConnectionCallback>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    void result.catch(() => {});
    const abort = () => {
        if (!settled) {
            settled = true;
            rejectResult(
                new Error(
                    'Agent connection approval timed out or was cancelled. No credential was saved.',
                ),
            );
        }
    };
    const handle: RequestListener = (req, res) => {
        const invalid = () => {
            res.writeHead(400);
            res.end('Invalid approval callback.');
        };
        let url: URL;
        try {
            url = new URL(req.url ?? '/', 'http://localhost');
        } catch {
            invalid();
            return;
        }
        const params = url.searchParams;
        const unique = [
            'state',
            'code',
            'iss',
            'error',
            'grant_uuid',
            'error_description',
        ].every((key) => params.getAll(key).length <= 1);
        const code = params.get('code');
        const error = params.get('error');
        if (
            settled ||
            req.method !== 'GET' ||
            req.url?.split('?', 1)[0] !== '/callback' ||
            url.pathname !== '/callback' ||
            !unique ||
            params.get('state') !== state ||
            params.get('iss') !== issuer ||
            (code === null) === (error === null) ||
            code === '' ||
            error === ''
        ) {
            invalid();
            return;
        }
        settled = true;
        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store',
        });
        res.end('You can return to the CLI.');
        if (error !== null) rejectResult(new ConnectionCallbackError(error));
        else
            resolveResult({ code: code!, grantUuid: params.get('grant_uuid') });
    };
    let servers: Server[] = [];
    const closeServers = async () => {
        const closing = servers;
        servers = [];
        await Promise.all(
            closing.map((server) => {
                server.closeAllConnections();
                return new Promise<void>((resolve) => {
                    server.close(() => resolve());
                });
            }),
        );
    };
    const listen = (host: string, onPort: number) =>
        new Promise<number>((resolve, reject) => {
            const server = createServer(handle);
            servers.push(server);
            server.once('error', reject);
            server.listen(onPort, host, () => {
                const address = server.address();
                if (!address || typeof address === 'string')
                    reject(new Error('No listener address'));
                else resolve(address.port);
            });
        });
    // localhost can resolve to either loopback family, so listen on both.
    const listenOnLoopback = async (attempt = 0): Promise<number> => {
        const bound = await listen('127.0.0.1', port);
        try {
            await listen('::1', bound);
            return bound;
        } catch (error) {
            const code =
                error instanceof Error && 'code' in error ? error.code : null;
            if (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT') {
                servers = servers.slice(0, 1);
                return bound;
            }
            await closeServers();
            if (code !== 'EADDRINUSE' || port !== 0 || attempt >= 4)
                throw error;
            return listenOnLoopback(attempt + 1);
        }
    };
    const close = async () => {
        signal.removeEventListener('abort', abort);
        abort();
        await closeServers();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
        await close();
        throw new Error('Agent connection approval was cancelled.');
    }
    try {
        const bound = await listenOnLoopback();
        if (signal.aborted)
            throw new Error('Could not start the approval callback listener.');
        return {
            redirectUri: `http://localhost:${bound}/callback`,
            result,
            close,
        };
    } catch {
        await close();
        throw new Error('Could not start the approval callback listener.');
    }
};
