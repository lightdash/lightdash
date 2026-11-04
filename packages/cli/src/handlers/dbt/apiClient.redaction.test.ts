import { slotFixture } from '../../agentConnections/fixtures';
import { runWithAgentConnectionSelection } from '../../credentials';
import {
    checkLightdashVersion,
    lightdashApi,
    lightdashRawApi,
    readRawApiJson,
} from './apiClient';

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    config: vi.fn(),
    resolve: vi.fn(),
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('../../config', () => ({ getConfig: mocks.config }));
vi.mock('../../credentials', async (original) => ({
    ...(await original<typeof import('../../credentials')>()),
    resolveCredential: mocks.resolve,
}));
const slot = slotFixture();
const unseen = 'brand-new-never-held-token';
const pat = 'personal-credential-value';
beforeEach(() => {
    mocks.config.mockResolvedValue({
        context: { serverUrl: slot.instanceUrl, apiKey: pat },
    });
    mocks.resolve.mockResolvedValue({
        kind: 'agent_connection',
        token: slot.tokens.accessToken,
        slot,
    });
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 400,
                message: `server-text ${slot.tokens.accessToken} ${slot.tokens.refreshToken} ${pat} ${unseen}`,
            },
        }),
    });
});
it.each([false, true])(
    'never renders a 200 error envelope with a connection (safe read %s)',
    async (safeToRetry) => {
        const error = await runWithAgentConnectionSelection('default', () =>
            lightdashApi({
                method: 'GET',
                url: '/api/v1/user',
                body: undefined,
                safeToRetry,
            }),
        ).catch((e: Error) => e);
        expect(String(error)).toContain('status 200');
        expect(String(error)).not.toMatch(
            /server-text|private-access|private-refresh|brand-new-never-held-token/,
        );
    },
);
it('omits invalid error identifiers and malformed JSON parser messages', async () => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
            throw new Error(unseen);
        },
    });
    const error = await runWithAgentConnectionSelection('default', () =>
        lightdashApi({ method: 'GET', url: '/api/v1/user', body: undefined }),
    ).catch((e: Error) => e);
    expect(String(error)).not.toContain(unseen);
});

it.each([
    'Invalid code with spaces',
    '<secret>',
    'a'.repeat(65),
    'server_identifier_marker',
])('omits unknown error identifier %s', async (name) => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'error',
            error: { name, message: unseen },
        }),
    });
    const error = await runWithAgentConnectionSelection('default', () =>
        lightdashApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        }),
    ).catch((e: Error) => e);
    expect(String(error)).toBe(
        'Error: The server rejected the agent connection request (status 200).',
    );
});
it.each([
    [
        'agent_connections_unavailable',
        'Agent connections are not available on this server yet.',
    ],
    [
        'agent_identity_disabled',
        'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
    ],
])('maps %s to fixed guidance', async (code, message) => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'error',
            error: { code, message: unseen },
        }),
    });
    const error = await runWithAgentConnectionSelection('default', () =>
        lightdashApi({ method: 'GET', url: '/api/v1/user', body: undefined }),
    ).catch((e: Error) => e);
    expect(String(error)).toBe(`Error: ${message}`);
});

it('contains raw response parser and stream errors for connection callers', async () => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
            throw new Error(unseen);
        },
    });
    await expect(
        runWithAgentConnectionSelection('default', async () =>
            readRawApiJson(
                await lightdashRawApi({
                    method: 'GET',
                    url: '/api/v1/user',
                    body: undefined,
                }),
            ),
        ),
    ).rejects.toThrow(
        'The server rejected the agent connection request (status 200).',
    );
});

it('rejects malformed server versions before displaying update advice', async () => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'ok',
            results: { version: 'unseen server marker!' },
        }),
    });
    await expect(
        runWithAgentConnectionSelection('default', () =>
            checkLightdashVersion(),
        ),
    ).rejects.toThrow('The server returned invalid version data.');
});

it('accepts a server version with both a prerelease and build part', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'ok',
            results: { version: '999.0.0-rc.1+build.2' },
        }),
    });
    try {
        await runWithAgentConnectionSelection('default', checkLightdashVersion);
        expect(output).toHaveBeenCalledWith(
            'The CLI and server use different major versions. Use a CLI version that matches your server.',
        );
    } finally {
        output.mockRestore();
    }
});

it('keeps the raw reader safe after the connection selection scope ends', async () => {
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
            throw new Error('X3 leak!');
        },
    });
    const response = await runWithAgentConnectionSelection('default', () =>
        lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        }),
    );
    await expect(readRawApiJson(response)).rejects.toThrow(
        'The server rejected the agent connection request (status 200).',
    );
});

it('uses fixed upgrade advice for a valid server version with prose', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            status: 'ok',
            results: { version: '999.0.0-server-written-marker' },
        }),
    });
    try {
        await runWithAgentConnectionSelection('default', checkLightdashVersion);
        expect(output).toHaveBeenCalledWith(
            'The CLI and server use different major versions. Use a CLI version that matches your server.',
        );
        expect(JSON.stringify(output.mock.calls)).not.toContain(
            'server-written-marker',
        );
    } finally {
        output.mockRestore();
    }
});
