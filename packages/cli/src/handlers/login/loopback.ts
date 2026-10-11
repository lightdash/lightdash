import { createServer } from 'http';

export type ConnectionCallback = { code: string; grantUuid: string | null };
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
    const server = createServer((req, res) => {
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
        if (error !== null)
            rejectResult(
                new Error(
                    'Agent connection approval was denied. No credential was saved.',
                ),
            );
        else
            resolveResult({ code: code!, grantUuid: params.get('grant_uuid') });
    });
    const close = async () => {
        signal.removeEventListener('abort', abort);
        abort();
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
        await close();
        throw new Error('Agent connection approval was cancelled.');
    }
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string' || signal.aborted)
            throw new Error('Could not start the approval callback listener.');
        return {
            redirectUri: `http://localhost:${address.port}/callback`,
            result,
            close,
        };
    } catch {
        await close();
        throw new Error('Could not start the approval callback listener.');
    }
};
