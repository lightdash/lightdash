import { createServer, Server } from 'http';
import fetch from 'node-fetch';
import { createConnectionLoopback } from './loopback';

it.each([
    ['agent_connections_unavailable', 'agent_connections_unavailable'],
    ['agent_identity_disabled', 'agent_identity_disabled'],
    ['access_denied', null],
    ['unknown-personal-key\u001b[31m$(whoami)', null],
])(
    'preserves only recognised denial code %s and rejects replay',
    async (error, code) => {
        const listener = await createConnectionLoopback({
            port: 0,
            state: 'state',
            issuer: 'https://example.com',
            signal: new AbortController().signal,
        });
        try {
            const url = new URL(listener.redirectUri);
            url.search = new URLSearchParams({
                state: 'state',
                iss: 'https://example.com',
                error: error!,
                error_description: 'personal-key',
            }).toString();
            expect((await fetch(url)).status).toBe(200);
            await expect(listener.result).rejects.toMatchObject({
                code,
                message:
                    'Agent connection approval was denied. No credential was saved.',
            });
            expect((await fetch(url)).status).toBe(400);
        } finally {
            await listener.close();
        }
        await expect(fetch(listener.redirectUri)).rejects.toThrow();
    },
);
it.each([
    'path',
    'method',
    'missing-state',
    'missing-iss',
    'wrong-state',
    'wrong-iss',
    'duplicate-state',
    'duplicate-iss',
    'duplicate-error',
    'duplicate-description',
    'conflicting-code',
])('does not consume a known denial with %s', async (variant) => {
    const listener = await createConnectionLoopback({
        port: 0,
        state: 'state',
        issuer: 'https://example.com',
        signal: new AbortController().signal,
    });
    let settled = false;
    void listener.result.then(
        () => {
            settled = true;
        },
        () => {
            settled = true;
        },
    );
    try {
        const valid = new URL(listener.redirectUri);
        valid.search = new URLSearchParams({
            state: 'state',
            iss: 'https://example.com',
            error: 'agent_connections_unavailable',
        }).toString();
        const invalid = new URL(valid);
        if (variant === 'path') invalid.pathname = '/callback/extra';
        if (variant.startsWith('missing-'))
            invalid.searchParams.delete(variant.slice(8));
        if (variant.startsWith('wrong-'))
            invalid.searchParams.set(variant.slice(6), 'wrong');
        if (variant.startsWith('duplicate-')) {
            const field =
                variant === 'duplicate-description'
                    ? 'error_description'
                    : variant.slice(10);
            invalid.searchParams.append(field, 'repeated');
            invalid.searchParams.append(field, 'repeated');
        }
        if (variant === 'conflicting-code')
            invalid.searchParams.set('code', 'code');
        expect(
            (
                await fetch(invalid, {
                    method: variant === 'method' ? 'POST' : 'GET',
                })
            ).status,
        ).toBe(400);
        expect(settled).toBe(false);
        expect((await fetch(valid)).status).toBe(200);
        await expect(listener.result).rejects.toMatchObject({
            code: 'agent_connections_unavailable',
        });
    } finally {
        await listener.close();
    }
    await expect(fetch(listener.redirectUri)).rejects.toThrow();
});

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
        expect(listen.mock.calls.map(([, host]) => host)).toEqual([
            '127.0.0.1',
            '::1',
        ]);
        const url = new URL(listener.redirectUri);
        const families = await Promise.all(
            ['127.0.0.1', '[::1]'].map((host) =>
                fetch(`http://${host}:${url.port}/callback`),
            ),
        );
        expect(families.map((response) => response.status)).toEqual([400, 400]);
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
