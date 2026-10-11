import { createServer, type Server } from 'http';
import { slotFixture } from '../../agentConnections/fixtures';
import {
    checkLightdashVersion,
    lightdashApi,
    lightdashRawApi,
} from './apiClient';

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    resolve: vi.fn(),
    config: vi.fn(),
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('../../config', () => ({ getConfig: mocks.config }));
vi.mock('../../credentials', async (original) => ({
    ...(await original<typeof import('../../credentials')>()),
    resolveCredential: mocks.resolve,
    getAgentConnectionSelection: () => 'default',
}));
let slot: ReturnType<typeof slotFixture>;
const response = (status = 200) => ({
    status,
    ok: status === 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ status: 'ok', results: {} }),
});
beforeEach(() => {
    slot = slotFixture();
    mocks.fetch.mockReset().mockResolvedValue(response());
    mocks.config.mockReset().mockImplementation(async () => ({
        user: {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
        context: {
            serverUrl: slot.instanceUrl,
            apiKey: 'personal-token',
            proxyAuthorization: 'proxy',
        },
    }));
    mocks.resolve.mockReset().mockImplementation(async () => ({
        kind: 'agent_connection',
        token: 'private-access',
        slot,
    }));
});
it('uses only agent Bearer and effective proxy headers', async () => {
    await lightdashApi({ method: 'GET', url: '/api/v1/user', body: undefined });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
        headers: {
            Authorization: 'Bearer private-access',
            'Proxy-Authorization': 'proxy',
        },
        redirect: 'error',
    });
    expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain(
        'personal-token',
    );
});
it.each([
    'Authorization',
    'authorization',
    'AUTHORIZATION',
    'Cookie',
    'cookie',
])('refuses %s injection before credential or request work', async (header) => {
    await expect(
        lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
            headers: { [header]: 'person' },
        }),
    ).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([
    'https://external.example/api/v1/user',
    '//external.example/api/v1/user',
    '/other',
    'https://user:password@example.com/api/v1/user',
])('refuses destination %s before obtaining tokens', async (url) => {
    await expect(
        lightdashApi({ method: 'GET', url, body: undefined }),
    ).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('retries an explicitly safe read once using the rejected generation', async () => {
    mocks.fetch.mockResolvedValueOnce(response(401));
    await lightdashApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
        safeToRetry: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.resolve.mock.calls[1][2]).toBe(1);
});
it.each([
    ['GET', false, 401],
    ['POST', true, 401],
    ['PUT', true, 401],
    ['DELETE', true, 401],
    ['GET', true, 403],
] as const)(
    'does not replay %s safe=%s status=%s',
    async (method, safeToRetry, status) => {
        mocks.fetch.mockResolvedValue(response(status));
        await expect(
            lightdashApi({
                method,
                url: '/api/v1/user',
                body: undefined,
                safeToRetry,
            }),
        ).rejects.toThrow();
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    },
);
it('does not retry a second 401 or leak server response data', async () => {
    mocks.fetch.mockResolvedValue({
        ...response(401),
        json: async () => ({ error: 'private-access private-refresh' }),
    });
    const error = await lightdashApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
        safeToRetry: true,
    }).catch((e: Error) => e);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(String(error)).not.toContain('private-');
});
it('propagates selected credential failures from advisory version checks', async () => {
    mocks.resolve.mockRejectedValue(new Error('Connection unavailable'));
    await expect(checkLightdashVersion()).rejects.toThrow(
        'Connection unavailable',
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('never forwards credentials through a real cross-origin redirect', async () => {
    function address(server: Server) {
        const bound = server.address();
        if (!bound || typeof bound === 'string') throw new Error('No address');
        return `http://127.0.0.1:${bound.port}`;
    }
    const externalRequests: unknown[] = [];
    const external = createServer((req, res) => {
        externalRequests.push(req.headers);
        res.end('{}');
    });
    const origin = createServer((_req, res) => {
        res.writeHead(302, { Location: `${address(external)}/api/v1/user` });
        res.end();
    });
    const listen = (server: Server) =>
        new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });

    await listen(external);
    await listen(origin);
    slot.instanceUrl = address(origin);
    slot.resource = slot.instanceUrl;
    const actual =
        await vi.importActual<typeof import('node-fetch')>('node-fetch');
    mocks.fetch.mockImplementation(actual.default);
    try {
        await expect(
            lightdashApi({
                method: 'GET',
                url: '/api/v1/user',
                body: undefined,
            }),
        ).rejects.toThrow();
        expect(externalRequests).toEqual([]);
    } finally {
        await Promise.all(
            [external, origin].map(
                (server) =>
                    new Promise<void>((resolve) => {
                        server.close(() => resolve());
                    }),
            ),
        );
    }
});
