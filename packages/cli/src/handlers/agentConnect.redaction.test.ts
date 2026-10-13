import { Console } from 'console';
import { Response } from 'node-fetch';
import { Writable } from 'stream';
import { slotFixture } from '../agentConnections/fixtures';
import GlobalState from '../globalState';
import { agentConnectionConnectHandler } from './agentConnectionConnect';
import { ConnectionCallbackError } from './login/loopback';

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    loopback: vi.fn(),
    save: vi.fn(),
}));
vi.mock('node-fetch', async (original) => ({
    ...(await original<typeof import('node-fetch')>()),
    default: mocks.fetch,
}));
vi.mock('../config', () => ({
    getConfig: async () => ({
        context: {
            serverUrl: 'https://example.com',
            apiKey: 'connect-personal-secret',
        },
    }),
}));
vi.mock('../agentConnections/store', () => ({
    AgentConnectionStore: class {
        readSlot = async () => null;
        saveSlot = mocks.save;
    },
}));
vi.mock('./login/loopback', async (original) => ({
    ...(await original<typeof import('./login/loopback')>()),
    createConnectionLoopback: mocks.loopback,
}));
const slot = slotFixture();
slot.approvedAt = new Date().toISOString();
const unknown = 'connect-never-seen-token';
const code = 'connect-callback-code';
let approvalUrl: string;
let verifier: string;
let phase: 'success' | 'start' | 'exchange' | 'proof';
let output: string;
const previousExit = process.exitCode;
const reply = (value: unknown) => new Response(JSON.stringify(value));
beforeEach(() => {
    phase = 'success';
    output = '';
    approvalUrl = '';
    verifier = '';
    process.exitCode = undefined;
    GlobalState.setVerbose(true);
    const stream = new Writable({
        write(chunk, _encoding, done) {
            output += String(chunk);
            done();
        },
    });
    vi.stubGlobal('console', new Console(stream, stream));
    mocks.save.mockResolvedValue({ cleanupIncomplete: false });
    mocks.loopback.mockImplementation(async () => ({
        redirectUri: 'http://localhost:9999/callback',
        result: Promise.resolve({ code, grantUuid: slot.grantUuid }),
        close: async () => {},
    }));
    mocks.fetch.mockReset().mockImplementation(
        async (
            url: string,
            init: {
                body?: string | URLSearchParams;
                headers?: Record<string, string>;
            },
        ) => {
            if (url.endsWith('/requests')) {
                approvalUrl = `https://example.com/api/v1/oauth/authorize?agent_request=${slot.grantUuid}`;
                if (phase === 'start')
                    return reply({
                        status: 'error',
                        error: {
                            message: `${unknown} ${code} connect-personal-secret`,
                        },
                    });
                return reply({
                    status: 'ok',
                    results: {
                        authorizationUrl: `${approvalUrl}&untrusted=server-written-link!`,
                        issuer: slot.instanceUrl,
                        resource: slot.resource,
                        expiresAt: new Date(Date.now() + 60000).toISOString(),
                    },
                });
            }
            if (url.endsWith('/oauth/token')) {
                verifier = new URLSearchParams(String(init.body)).get(
                    'code_verifier',
                )!;
                if (phase === 'exchange')
                    return reply({
                        status: 'error',
                        error: {
                            message: `${unknown} ${verifier} ${code}`,
                        },
                    });
                return reply({
                    access_token: 'connect-access-secret',
                    refresh_token: 'connect-refresh-secret',
                    token_type: 'Bearer',
                    expires_in: 300,
                    scope: 'read write',
                    agent_connection: { grant_uuid: slot.grantUuid },
                });
            }
            if (url.endsWith('/status')) {
                if (phase === 'proof')
                    return reply({
                        status: 'error',
                        error: {
                            message: `${unknown} connect-access-secret connect-refresh-secret`,
                        },
                    });
                return reply({
                    status: 'ok',
                    results: {
                        ...slot.lastReported,
                        name: slot.name,
                        grantUuid: slot.grantUuid,
                        clientId: slot.clientId,
                        approvedAt: slot.approvedAt,
                        expiresAt: slot.grantExpiresAt,
                    },
                });
            }
            return reply({
                status: 'ok',
                results: {
                    userUuid: slot.personUuid,
                    organizationUuid: slot.organizationUuid,
                },
            });
        },
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    GlobalState.setVerbose(false);
    process.exitCode = previousExit;
});
it.each(['success', 'start', 'exchange', 'proof'] as const)(
    'contains connect %s with verbose output and preserves the full approval URL',
    async (scenario) => {
        phase = scenario;
        await agentConnectionConnectHandler(
            { verbose: true },
            { launchBrowser: async () => true },
        );
        expect(process.exitCode).toBe(scenario === 'success' ? 0 : 1);
        expect(output).not.toContain(unknown);
        if (scenario !== 'start') expect(output).toContain(approvalUrl);
        expect(output).not.toContain('server-written-link!');
        for (const value of [
            'connect-personal-secret',
            code,
            'connect-access-secret',
            'connect-refresh-secret',
            verifier,
        ].filter(Boolean))
            expect(output).not.toContain(value);
    },
);
it('prints a fixed denial without callback error text', async () => {
    mocks.loopback.mockImplementation(async () => {
        const result = Promise.reject(
            new ConnectionCallbackError(`${unknown} ${code}`),
        );
        void result.catch(() => {});
        return {
            redirectUri: 'http://localhost:9999/callback',
            result,
            close: async () => {},
        };
    });
    await agentConnectionConnectHandler(
        { verbose: true },
        { launchBrowser: async () => true },
    );
    expect(process.exitCode).toBe(1);
    expect(output).toContain('Agent connection approval was denied.');
    expect(output).toContain(approvalUrl);
    expect(output).not.toContain('server-written-link!');
    expect(output).not.toContain(unknown);
    expect(output).not.toContain(code);
    expect(
        mocks.fetch.mock.calls.some(([url]) =>
            String(url).endsWith('/oauth/token'),
        ),
    ).toBe(false);
});
