import { AuthTokenPrefix } from '@lightdash/common';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { registerAgentConnectionOption } from '../agentConnectionOption';
import { slotFixture } from '../agentConnections/fixtures';
import { type AgentConnectionSlot } from '../agentConnections/schema';
import { AgentConnectionStore } from '../agentConnections/store';
import { getConfig } from '../config';
import {} from '../credentials';
import { agentRevokeHandler } from './agentRevoke';

const location = vi.hoisted(() => ({ configFilePath: '' }));
vi.mock('../config', () => ({
    getConfig: vi.fn(),
    get configFilePath() {
        return location.configFilePath;
    },
}));
let directory: string;
let server: Server;
let slot: AgentConnectionSlot;
let store: AgentConnectionStore;
let payload: unknown;
let statusCode: number;
let loseResponse: boolean;
let replaceSlot: boolean;
let replaceGeneration: boolean;
let emptyResponse: boolean;
let stallResponse: boolean;
let afterUserRequest: (() => void) | null;
let receivedHeaders: import('http').IncomingHttpHeaders[];
let freshPerson: { userUuid: string; organizationUuid: string };
let requests: {
    method: string;
    url: string;
    auth: string | undefined;
    pending: boolean;
}[];
const originalExitCode = process.exitCode;
const output = () =>
    JSON.parse(String(vi.mocked(console.log).mock.calls[0][0]));
const textOutput = () => vi.mocked(console.error).mock.calls.flat().join('\n');
beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', '');
    delete process.env.LIGHTDASH_AGENT_CONNECTION;
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-human-secret');
    process.exitCode = undefined;
    directory = await fs.mkdtemp(path.join(tmpdir(), 'connection-revoke-'));
    location.configFilePath = path.join(directory, 'config.yaml');
    requests = [];
    afterUserRequest = null;
    receivedHeaders = [];
    statusCode = 200;
    loseResponse = false;
    replaceSlot = false;
    replaceGeneration = false;
    emptyResponse = false;
    stallResponse = false;
    server = createServer((req, res) => {
        void (async () => {
            receivedHeaders.push(req.headers);
            requests.push({
                method: req.method!,
                url: req.url!,
                auth: req.headers.authorization,
                pending:
                    (await store.readSlot(slot))?.revokeState.kind ===
                    'unconfirmed',
            });
            if (replaceSlot && req.method === 'DELETE') {
                await store.saveSlot({
                    ...slot,
                    grantUuid: '44444444-4444-4444-8444-444444444444',
                    tokens: { ...slot.tokens, generation: 2 },
                });
            }
            if (replaceGeneration && req.method === 'DELETE')
                await store.saveSlot({
                    ...slot,
                    tokens: { ...slot.tokens, generation: 2 },
                });
            if (stallResponse) return;
            if (emptyResponse) {
                res.writeHead(200);
                res.end();
                return;
            }
            if (loseResponse) {
                req.socket.destroy();
                return;
            }
            const isUser = req.url?.endsWith('/api/v1/user');
            if (isUser) afterUserRequest?.();
            res.writeHead(isUser ? 200 : statusCode, {
                'content-type': 'application/json',
            });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: isUser ? freshPerson : payload,
                }),
            );
        })();
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing server');
    const instanceUrl = `http://127.0.0.1:${address.port}`;
    slot = { ...slotFixture(), instanceUrl, resource: instanceUrl };
    store = new AgentConnectionStore();
    await store.saveSlot(slot);
    payload = {
        grantUuid: slot.grantUuid,
        name: slot.name,
        clientId: slot.clientId,
        approvedAt: slot.approvedAt,
        expiresAt: slot.grantExpiresAt,
        limitsStatus: 'ok',
        approvedProjects: [],
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        lastUsedAt: null,
    };
    freshPerson = {
        userUuid: slot.personUuid,
        organizationUuid: slot.organizationUuid,
    };
    vi.mocked(getConfig).mockResolvedValue({
        context: { serverUrl: instanceUrl, apiKey: 'stored-human-secret' },
        user: {
            anonymousUuid: 'test',
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(directory, { recursive: true, force: true });
    process.exitCode = originalExitCode;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});
it.each([false, true])(
    'confirms own Bearer revocation and removes the local slot (json=%s)',
    async (json) => {
        await agentRevokeHandler({ name: slot.name, json });
        expect(requests).toEqual([
            {
                method: 'DELETE',
                url: `/api/v2/user/agent-connections/${slot.grantUuid}`,
                auth: 'Bearer private-access',
                pending: true,
            },
        ]);
        expect(await store.readSlot(slot)).toBeNull();
        expect(process.exitCode).toBe(0);
        if (json) {
            expect(output()).toEqual({
                version: 1,
                slot: slot.name,
                grantUuid: slot.grantUuid,
                confirmed: true,
                localRemoved: true,
                settingsUrl: `${slot.instanceUrl}/generalSettings/myAgentConnections`,
                error: null,
            });
            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.error).not.toHaveBeenCalled();
            expect(JSON.stringify(output())).not.toMatch(
                /private-access|private-refresh|human-secret|\\u001b/,
            );
        } else
            expect(textOutput()).toBe(
                'Agent connection revoked: default. Local credential removed.',
            );
    },
);
it.each([401, 403, 404])(
    'keeps unconfirmed state after %s and never replays the DELETE',
    async (code) => {
        statusCode = code;
        await agentRevokeHandler({ name: slot.name, json: true });
        expect(output()).toMatchObject({
            confirmed: false,
            localRemoved: false,
        });
        expect((await store.readSlot(slot))?.revokeState.kind).toBe(
            'unconfirmed',
        );
        expect(requests).toHaveLength(1);
        expect(requests[0].auth).toBe('Bearer private-access');
        expect(process.exitCode).toBe(1);
    },
);
it.each([
    null,
    {},
    { status: 'revoked' },
    { grantUuid: '44444444-4444-4444-8444-444444444444' },
    { name: 'other' },
    { clientId: 'other' },
    { status: 'active' },
    { revokedAt: null },
])(
    'does not accept an incomplete or mismatched confirmation %j',
    async (change) => {
        payload =
            change === null ||
            Object.keys(change).length === 0 ||
            ('status' in change && change.status === 'revoked')
                ? change
                : { ...Object(payload), ...change };
        await agentRevokeHandler({ name: slot.name, json: true });
        expect(output()).toMatchObject({
            confirmed: false,
            localRemoved: false,
        });
        expect((await store.readSlot(slot))?.revokeState.kind).toBe(
            'unconfirmed',
        );
        expect(process.exitCode).toBe(1);
    },
);
it('keeps secrets on a lost response and directs a deliberate dead-token retry to recovery', async () => {
    loseResponse = true;
    await agentRevokeHandler({ name: slot.name });
    expect(textOutput()).toContain(
        'Revocation was not confirmed. The local slot was kept.',
    );
    expect(process.exitCode).toBe(1);
    const pending = await store.readSlot(slot);
    expect(pending?.tokens).toEqual(slot.tokens);
    expect(pending?.revokeState.kind).toBe('unconfirmed');
    loseResponse = false;
    statusCode = 401;
    await agentRevokeHandler({ name: slot.name });
    expect(textOutput()).toContain(
        'This credential cannot confirm revocation.',
    );
    expect(textOutput()).toContain('--human');
    expect(requests).toHaveLength(2);
    expect(
        requests.every(
            (r) => r.auth === 'Bearer private-access' && r.method === 'DELETE',
        ),
    ).toBe(true);
});
it('does not refresh a dead access token just to revoke', async () => {
    slot.tokens.accessTokenExpiresAt = new Date(
        Date.now() - 1000,
    ).toISOString();
    await store.saveSlot(slot);
    await agentRevokeHandler({ name: slot.name });
    expect(requests).toEqual([]);
    expect(textOutput()).toContain(
        'This credential cannot confirm revocation.',
    );
    expect(await store.readSlot(slot)).not.toBeNull();
});
it('allows a known live access token with an uncertain refresh for self-revoke', async () => {
    slot.refreshState = {
        kind: 'reconnect_required',
        since: new Date().toISOString(),
    };
    await store.saveSlot(slot);
    await agentRevokeHandler({ name: slot.name });
    expect(await store.readSlot(slot)).toBeNull();
    expect(requests).toHaveLength(1);
});
it('uses personal auth only when explicitly requested and accepts already-revoked confirmation', async () => {
    slot.lastReported.status = 'revoked';
    slot.lastReported.revokedAt = new Date().toISOString();
    await store.saveSlot(slot);
    await agentRevokeHandler({ name: slot.name, human: true, json: true });
    expect(
        requests.map((r) => ({ method: r.method, url: r.url, auth: r.auth })),
    ).toEqual([
        {
            method: 'GET',
            url: '/api/v1/user',
            auth: 'ApiKey stored-human-secret',
        },
        {
            method: 'DELETE',
            url: `/api/v2/user/agent-connections/${slot.grantUuid}`,
            auth: 'ApiKey stored-human-secret',
        },
    ]);
    expect(await store.readSlot(slot)).toBeNull();
    expect(output().confirmed).toBe(true);
});
it.each(['userUuid', 'organizationUuid'] as const)(
    'requires matching fresh %s for human recovery',
    async (field) => {
        freshPerson[field] = '44444444-4444-4444-8444-444444444444';
        await agentRevokeHandler({ name: slot.name, human: true, json: true });
        expect(requests.map((r) => r.method)).toEqual(['GET']);
        expect(output().confirmed).toBe(false);
        expect(await store.readSlot(slot)).not.toBeNull();
        expect(process.exitCode).toBe(1);
    },
);
it('rejects human recovery with global selection before network', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', slot.name);
    await expect(
        agentRevokeHandler({ name: slot.name, human: true }),
    ).rejects.toThrow('conflict');
    expect(requests).toEqual([]);
});
it('rejects a different selected name and permits the matching one', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'other');
    await expect(agentRevokeHandler({ name: slot.name })).rejects.toThrow(
        'conflict',
    );
    expect(requests).toEqual([]);
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', slot.name);
    await agentRevokeHandler({ name: slot.name });
    expect(process.exitCode).toBe(0);
});
it('keeps a slot replaced during the request', async () => {
    replaceSlot = true;
    await agentRevokeHandler({ name: slot.name, json: true });
    expect((await store.readSlot(slot))?.grantUuid).toBe(
        '44444444-4444-4444-8444-444444444444',
    );
    expect(output()).toMatchObject({ confirmed: true, localRemoved: false });
    expect(process.exitCode).toBe(1);
});
it('reports failure to remove a confirmed revocation and leaves the slot blocked', async () => {
    const original = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
        if (requests.some((r) => r.method === 'DELETE'))
            throw new Error('Disk unavailable');
        return original(...args);
    });
    await agentRevokeHandler({ name: slot.name, json: true });
    expect(output()).toMatchObject({
        confirmed: true,
        localRemoved: false,
        error: 'The server confirmed revocation, but the local credential could not be removed.',
    });
    expect((await store.readSlot(slot))?.revokeState.kind).toBe('unconfirmed');
    expect(process.exitCode).toBe(1);
});
it('sends no request for a missing slot', async () => {
    await store.removeSlot(slot);
    await agentRevokeHandler({ name: slot.name, json: true });
    expect(requests).toEqual([]);
    expect(output()).toMatchObject({
        confirmed: false,
        localRemoved: false,
        grantUuid: null,
    });
    expect(process.exitCode).toBe(1);
});

it('keeps an empty 200 response unconfirmed', async () => {
    emptyResponse = true;
    await agentRevokeHandler({ name: slot.name, json: true });
    expect(output()).toMatchObject({ confirmed: false, localRemoved: false });
    expect((await store.readSlot(slot))?.revokeState.kind).toBe('unconfirmed');
    expect(requests).toHaveLength(1);
});
it('keeps an actual timeout unconfirmed and does not retry', async () => {
    vi.stubEnv('LIGHTDASH_API_TIMEOUT_MS', '25');
    stallResponse = true;
    await agentRevokeHandler({ name: slot.name, json: true });
    expect(output()).toMatchObject({
        confirmed: false,
        localRemoved: false,
        error: 'Revocation was not confirmed. The local slot was kept.',
    });
    expect((await store.readSlot(slot))?.revokeState.kind).toBe('unconfirmed');
    expect(requests).toHaveLength(1);
    expect(process.exitCode).toBe(1);
});
it('does not remove a replacement generation of the same grant', async () => {
    replaceGeneration = true;
    await agentRevokeHandler({ name: slot.name, json: true });
    expect((await store.readSlot(slot))?.tokens.generation).toBe(2);
    expect(output()).toMatchObject({ confirmed: true, localRemoved: false });
    expect(process.exitCode).toBe(1);
});
it('keeps the slot if writing the pending state fails before DELETE', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValue(new Error('Disk unavailable'));
    await agentRevokeHandler({ name: slot.name, json: true });
    expect(requests).toEqual([]);
    expect(await store.readSlot(slot)).not.toBeNull();
    expect(process.exitCode).toBe(1);
});
it('rejects an environment selection with explicit human recovery', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', slot.name);
    await expect(
        agentRevokeHandler({ name: slot.name, human: true }),
    ).rejects.toThrow('conflict');
    expect(requests).toEqual([]);
});

it('does not retain human, name or JSON permission on a reused revoke command', async () => {
    const command = new Command().exitOverride();
    registerAgentConnectionOption(command);
    const revoke = command
        .command('agent')
        .command('revoke')
        .requiredOption('--name <slot>')
        .option('--json')
        .option('--human')
        .action(agentRevokeHandler);
    statusCode = 500;
    await command.parseAsync(
        ['agent', 'revoke', '--name', slot.name, '--human', '--json'],
        { from: 'user' },
    );
    expect(requests.map((r) => r.auth)).toEqual([
        'ApiKey stored-human-secret',
        'ApiKey stored-human-secret',
    ]);
    requests = [];
    vi.mocked(console.log).mockClear();
    await command.parseAsync(['agent', 'revoke', '--name', slot.name], {
        from: 'user',
    });
    expect(requests.map((r) => r.auth)).toEqual(['Bearer private-access']);
    expect(console.log).not.toHaveBeenCalled();
    expect(revoke.opts().human).toBeUndefined();
    await expect(
        command.parseAsync(['agent', 'revoke'], { from: 'user' }),
    ).rejects.toThrow('required option');
});
it.each(['config-person', 'config-instance', 'env-key'] as const)(
    'pins recovery credentials and destination when %s changes after user verification',
    async (change) => {
        const initial = await getConfig();
        initial.context!.proxyAuthorization = 'first-proxy';
        if (change === 'env-key')
            vi.mocked(getConfig).mockImplementation(async () => ({
                ...initial,
                context: {
                    ...initial.context,
                    apiKey: process.env.LIGHTDASH_API_KEY,
                },
            }));
        const firstToken =
            change === 'env-key' ? 'env-human-secret' : 'stored-human-secret';
        afterUserRequest = () => {
            vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', 'second-proxy');
            if (change === 'env-key')
                vi.stubEnv('LIGHTDASH_API_KEY', 'second-human-secret');
            else {
                initial.context!.apiKey = 'second-human-secret';
                if (change === 'config-instance')
                    initial.context!.serverUrl = `${slot.instanceUrl}/other`;
                else
                    initial.user!.userUuid =
                        '44444444-4444-4444-8444-444444444444';
            }
        };
        await agentRevokeHandler({ name: slot.name, human: true, json: true });
        expect(
            requests.map(({ method, url, auth }) => ({ method, url, auth })),
        ).toEqual([
            {
                method: 'GET',
                url: '/api/v1/user',
                auth: `ApiKey ${firstToken}`,
            },
            {
                method: 'DELETE',
                url: `/api/v2/user/agent-connections/${slot.grantUuid}`,
                auth: `ApiKey ${firstToken}`,
            },
        ]);
        expect(receivedHeaders.map((h) => h['proxy-authorization'])).toEqual([
            'first-proxy',
            'first-proxy',
        ]);
        expect(receivedHeaders.every((h) => h.cookie === undefined)).toBe(true);
        expect(output().confirmed).toBe(true);
    },
);
it('sends both recovery requests under the instance sub-path', async () => {
    slot = {
        ...slot,
        instanceUrl: `${slot.instanceUrl}/lightdash`,
        resource: `${slot.instanceUrl}/lightdash`,
    };
    await store.saveSlot(slot);
    const config = await getConfig();
    config.context!.serverUrl = slot.instanceUrl;
    await agentRevokeHandler({ name: slot.name, human: true, json: true });
    expect(requests.map((r) => r.url)).toEqual([
        '/lightdash/api/v1/user',
        `/lightdash/api/v2/user/agent-connections/${slot.grantUuid}`,
    ]);
    expect(output().confirmed).toBe(true);
});
it('refuses a recovery capture whose instance differs from the returned slot', async () => {
    vi.spyOn(AgentConnectionStore.prototype, 'readSlot').mockResolvedValue({
        ...slot,
        instanceUrl: `${slot.instanceUrl}/other`,
        resource: `${slot.instanceUrl}/other`,
    });
    await agentRevokeHandler({ name: slot.name, human: true, json: true });
    expect(requests).toEqual([]);
    expect(output().confirmed).toBe(false);
});
it('refuses a service account for recovery before any request', async () => {
    const config = await getConfig();
    config.context!.apiKey = `${AuthTokenPrefix.SERVICE_ACCOUNT}test`;
    await agentRevokeHandler({ name: slot.name, human: true, json: true });
    expect(requests).toEqual([]);
    expect(output().confirmed).toBe(false);
});
it.each([401, 403, 500])(
    'does not retry an explicit human DELETE rejected with %s',
    async (code) => {
        statusCode = code;
        await agentRevokeHandler({ name: slot.name, human: true, json: true });
        expect(requests.map((r) => r.method)).toEqual(['GET', 'DELETE']);
        expect(output().confirmed).toBe(false);
        expect((await store.readSlot(slot))?.revokeState.kind).toBe(
            'unconfirmed',
        );
    },
);
