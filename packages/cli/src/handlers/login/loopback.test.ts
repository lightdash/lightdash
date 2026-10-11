import { createServer, Server } from 'http';
import fetch from 'node-fetch';
import { createConnectionLoopback } from './loopback';

it('binds only loopback, accepts the first callback and rejects replay', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen');
    const abort = new AbortController();
    const listener = await createConnectionLoopback({
        port: 0,
        state: 'state',
        issuer: 'https://example.com',
        signal: abort.signal,
    });
    try {
        expect(listen).toHaveBeenCalledWith(
            0,
            '127.0.0.1',
            expect.any(Function),
        );
        const url = new URL(listener.redirectUri);
        expect(url.hostname).toBe('localhost');
        url.search = new URLSearchParams({
            state: 'state',
            iss: 'https://example.com',
            code: 'first',
        }).toString();
        expect((await fetch(url)).status).toBe(200);
        url.searchParams.set('code', 'second');
        expect((await fetch(url)).status).toBe(400);
        await expect(listener.result).resolves.toMatchObject({ code: 'first' });
    } finally {
        await listener.close();
        listen.mockRestore();
    }
    await expect(fetch(listener.redirectUri)).rejects.toThrow();
});
it('aborts a pending wait and releases the port', async () => {
    const abort = new AbortController();
    const listener = await createConnectionLoopback({
        port: 0,
        state: 'state',
        issuer: 'https://example.com',
        signal: abort.signal,
    });
    abort.abort();
    await expect(listener.result).rejects.toThrow();
    await listener.close();
    await expect(fetch(listener.redirectUri)).rejects.toThrow();
});
it('fails cleanly on an occupied port', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => {
        occupied.listen(0, '127.0.0.1', resolve);
    });
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    try {
        await expect(
            createConnectionLoopback({
                port: address.port,
                state: 'state',
                issuer: 'https://example.com',
                signal: new AbortController().signal,
            }),
        ).rejects.toThrow();
    } finally {
        await new Promise<void>((resolve) => {
            occupied.close(() => resolve());
        });
    }
});

it('rejects a path that only normalises to /callback', async () => {
    const { request } = await import('http');
    const listener = await createConnectionLoopback({
        port: 0,
        state: 'state',
        issuer: 'https://example.com',
        signal: new AbortController().signal,
    });
    try {
        const address = new URL(listener.redirectUri);
        const status = await new Promise<number | undefined>(
            (resolve, reject) => {
                const req = request(
                    {
                        hostname: address.hostname,
                        port: address.port,
                        path: '/extra/../callback?state=state&iss=https%3A%2F%2Fexample.com&code=wrong',
                    },
                    (res) => {
                        res.resume();
                        res.on('end', () => resolve(res.statusCode));
                    },
                );
                req.on('error', reject);
                req.end();
            },
        );
        expect(status).toBe(400);
    } finally {
        await listener.close();
    }
});
