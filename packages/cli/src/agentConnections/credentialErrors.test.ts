import { promises as fs } from 'fs';
import fetch, { Response } from 'node-fetch';
import { tmpdir } from 'os';
import path from 'path';
import { createConnectionLoopback } from '../handlers/login/loopback';
import { AgentTokenProvider } from './agentTokenProvider';
import { slotFixture } from './fixtures';
import { exchangeInitialConnectionToken } from './initialToken';
import { AgentConnectionStore } from './store';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./apiUrl', async (original) => ({
    ...(await original<typeof import('./apiUrl')>()),
    createAgentConnectionFetch: () => mocks.fetch,
}));
let directory: string;
let store: AgentConnectionStore;
let slot: ReturnType<typeof slotFixture>;
const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status });
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'cli-credential-errors-'));
    store = new AgentConnectionStore(path.join(directory, 'connections.yaml'));
    slot = slotFixture();
    slot.tokens.accessTokenExpiresAt = new Date(
        Date.now() - 1000,
    ).toISOString();
    await store.saveSlot(slot);
    mocks.fetch.mockReset().mockImplementation(async (url: string) => {
        if (url.endsWith('/oauth/token'))
            return response({
                access_token: 'rotated-access-value',
                refresh_token: 'rotated-refresh-value',
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_expires_in: 3600,
                scope: 'read write',
            });
        return response({
            status: 'ok',
            results: url.endsWith('/user')
                ? {
                      userUuid: slot.personUuid,
                      organizationUuid: slot.organizationUuid,
                  }
                : {
                      ...slot.lastReported,
                      ...slot,
                      expiresAt: slot.grantExpiresAt,
                      status: 'active',
                  },
        });
    });
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
it('never includes failed refresh server text', async () => {
    mocks.fetch.mockResolvedValue(
        response(
            {
                error: {
                    message: `${slot.tokens.accessToken} ${slot.tokens.refreshToken} unknown-remote-token`,
                },
            },
            400,
        ),
    );
    const error = await new AgentTokenProvider(store)
        .getToken(slot)
        .catch((e: Error) => e);
    expect(String(error)).toContain('refresh outcome is uncertain');
    expect(String(error)).not.toMatch(/private-|unknown-remote-token/);
});
it('rejects malformed token responses with fixed proof errors', async () => {
    mocks.fetch.mockResolvedValue(
        response({
            access_token: 'malformed-access-value',
            refresh_token: 'malformed-refresh-value',
        }),
    );
    await expect(
        exchangeInitialConnectionToken({
            instanceUrl: slot.instanceUrl,
            code: 'malformed-code-value',
            verifier: 'malformed-verifier-value',
            redirectUri: 'http://localhost/callback',
            grantUuid: null,
            signal: new AbortController().signal,
            proxyAuthorization: null,
        }),
    ).rejects.toThrow('No credential was saved');
});

it('rejects mismatched callback state, then accepts the valid callback', async () => {
    const listener = await createConnectionLoopback({
        port: 0,
        state: 'expected-public-state',
        issuer: slot.instanceUrl,
        signal: new AbortController().signal,
    });
    try {
        const url = new URL(listener.redirectUri);
        url.searchParams.set('state', 'wrong-state');
        url.searchParams.set('iss', slot.instanceUrl);
        url.searchParams.set('code', 'mismatched-callback-secret');
        const invalid = await fetch(url);
        expect(invalid.status).toBe(400);
        expect(await invalid.text()).toBe('Invalid approval callback.');

        url.searchParams.set('state', 'expected-public-state');
        url.searchParams.set('code', 'valid-callback-secret');
        expect((await fetch(url)).status).toBe(200);
        expect(await listener.result).toEqual({
            code: 'valid-callback-secret',
            grantUuid: null,
        });
    } finally {
        await listener.close();
    }
});
