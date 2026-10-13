import { AgentCapability, AuthTokenPrefix } from '@lightdash/common';
import { promises as fs } from 'fs';
import { createServer, Server } from 'http';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import path from 'path';
import { AgentTokenProvider } from '../agentConnections/agentTokenProvider';
import { acquireLock } from '../agentConnections/configLock';
import { slotFixture } from '../agentConnections/fixtures';
import { AgentConnectionStore } from '../agentConnections/store';
import { getConfig } from '../config';
import {
    personalLoginRequired,
    runWithAgentConnectionSelection,
} from '../credentials';
import GlobalState from '../globalState';
import { agentConnectionConnectHandler } from './agentConnectionConnect';
import { generatePersonalAccessToken } from './login/pat';
import { loginWithOauth } from './oauthLogin';

const location = vi.hoisted(() => ({ configFilePath: '' }));
vi.mock('../config', () => ({
    getConfig: vi.fn(),
    get configFilePath() {
        return location.configFilePath;
    },
}));
vi.mock('./login/pat', () => ({ generatePersonalAccessToken: vi.fn() }));
vi.mock('./oauthLogin', () => ({ loginWithOauth: vi.fn() }));
let directory: string;
let server: Server;
let instance: string;
let requestCode: number;
let requestReply: unknown;
let statusCode: number;
let status: Record<string, unknown>;
let token: Record<string, unknown>;
let person: Record<string, unknown>;
let bootstrapCode: number;
let warehouseCode: number;
let warehouseResult: Record<string, unknown>;
let requestBody: Record<string, unknown>;
let calls: {
    method: string;
    url: string;
    auth?: string;
    cookie?: string;
    proxy?: string;
    body: string;
}[];
let launcher: ReturnType<typeof vi.fn<(url: string) => Promise<boolean>>>;
let callbackGrant: string | null;
const projectUuid = '44444444-4444-4444-8444-444444444444';
const oldExitCode = process.exitCode;
const configBytes = 'personal config bytes must never change\n';
const unavailable = 'Agent connections are not available on this server yet.';
const disabled =
    'Agent connections are disabled on this server. Ask an administrator to enable agent identity.';
const denied = 'Agent connection approval was denied. No credential was saved.';
const failed =
    'Could not start agent connection approval. No credential was saved. Try again when the server is available.';
const unchanged =
    'No agent connection credential was saved. Your personal CLI login is unchanged.';
const unbound =
    'The server returned a token that is not bound to this agent connection. No credential was saved.';
const output = () => vi.mocked(console.error).mock.calls.flat().join('\n');
const callback = () => {
    const url = new URL(String(requestBody.redirectUri));
    url.searchParams.set('state', String(requestBody.state));
    url.searchParams.set('code', 'private-code');
    url.searchParams.set('iss', instance);
    if (callbackGrant !== null)
        url.searchParams.set('grant_uuid', callbackGrant);
    return url;
};
const run = (options = {}) =>
    agentConnectionConnectHandler(
        { verbose: false, ...options },
        { launchBrowser: launcher },
    );
const key = () => ({ ...slotFixture(), instanceUrl: instance });
const noSave = async () => {
    expect(await fs.readFile(location.configFilePath, 'utf8')).toBe(
        configBytes,
    );
    expect(await fs.readdir(directory)).toEqual(['config.yaml']);
    expect(generatePersonalAccessToken).not.toHaveBeenCalled();
    expect(loginWithOauth).not.toHaveBeenCalled();
    for (const secret of [
        'private-access',
        'private-refresh',
        'personal-key',
        'private-code',
    ])
        expect(output()).not.toContain(secret);
};
const closed = async () => {
    if (requestBody.redirectUri)
        await expect(fetch(String(requestBody.redirectUri))).rejects.toThrow();
};
beforeEach(async () => {
    process.exitCode = undefined;
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_OAUTH_PORT', undefined);
    vi.stubEnv('CI', undefined);
    GlobalState.setNonInteractive(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-connect-'));
    location.configFilePath = path.join(directory, 'config.yaml');
    await fs.writeFile(location.configFilePath, configBytes);
    calls = [];
    requestCode = 200;
    requestReply = null;
    requestBody = {};
    statusCode = 200;
    bootstrapCode = 200;
    warehouseCode = 200;
    warehouseResult = {
        projectUuid,
        warehouseConnectionUuid: null,
        identity: 'connected_person',
        requirementSource: 'organization',
        expiresAt: null,
        refusal: null,
    };
    callbackGrant = slotFixture().grantUuid;
    person = {
        userUuid: slotFixture().personUuid,
        organizationUuid: slotFixture().organizationUuid,
    };
    status = {
        grantUuid: callbackGrant,
        name: 'default',
        clientId: 'lightdash-cli',
        approvedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        status: 'active',
        limitsStatus: 'ok',
        lastUsedAt: null,
        revokedAt: null,
        approvedProjects: [
            {
                projectUuid,
                name: 'Development',
                approvedCapabilities: [
                    AgentCapability.ReadDiscover,
                    AgentCapability.Query,
                ],
            },
        ],
        effectiveProjects: [
            {
                projectUuid,
                capabilities: [
                    AgentCapability.ReadDiscover,
                    AgentCapability.Query,
                ].map((capability) => ({
                    capability,
                    allowed: true,
                    reason: null,
                })),
            },
        ],
    };
    token = {
        access_token: 'private-access',
        refresh_token: 'private-refresh',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'read write',
        agent_connection: { grant_uuid: callbackGrant, grant_revision: 1 },
    };
    server = createServer((req, res) => {
        let body = '';
        req.on('data', (data) => {
            body += String(data);
        });
        req.on('end', () => {
            calls.push({
                method: req.method!,
                url: req.url!,
                auth: req.headers.authorization,
                cookie: req.headers.cookie,
                proxy: req.headers['proxy-authorization']?.toString(),
                body,
            });
            const reply = (code: number, value: unknown) => {
                res.writeHead(code, { 'Content-Type': 'application/json' });
                res.end(
                    typeof value === 'string' ? value : JSON.stringify(value),
                );
            };
            if (req.url?.endsWith('/requests')) {
                try {
                    requestBody = JSON.parse(body);
                } catch {
                    reply(400, {});
                    return;
                }
                reply(
                    requestCode,
                    requestReply ?? {
                        status: 'ok',
                        results: {
                            authorizationUrl: `${instance}/api/v1/oauth/authorize?agent_request=44444444-4444-4444-8444-444444444444`,
                            issuer: instance,
                            resource: instance,
                            expiresAt: new Date(
                                Date.now() + 60_000,
                            ).toISOString(),
                        },
                    },
                );
            } else if (req.url?.endsWith('/oauth/token')) reply(200, token);
            else if (req.url?.endsWith('/status'))
                reply(statusCode, { status: 'ok', results: status });
            else if (req.url?.endsWith('/user'))
                reply(
                    req.headers.authorization?.startsWith('ApiKey')
                        ? bootstrapCode
                        : 200,
                    {
                        status: 'ok',
                        results: req.headers.authorization?.startsWith('ApiKey')
                            ? {
                                  userUuid: slotFixture().personUuid,
                                  organizationUuid:
                                      slotFixture().organizationUuid,
                              }
                            : person,
                    },
                );
            else if (req.url?.endsWith('/ai-access/me'))
                reply(warehouseCode, {
                    status: 'ok',
                    results: warehouseResult,
                });
            else if (req.url?.endsWith(`/projects/${projectUuid}`))
                reply(200, {
                    status: 'ok',
                    results: { projectUuid, slug: 'development' },
                });
            else reply(500, {});
        });
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('No fixture address');
    instance = `http://127.0.0.1:${address.port}/lightdash`;
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: instance,
            apiKey: 'personal-key',
            proxyAuthorization: 'personal-proxy',
            project: 'ignored-saved-project',
        },
    });
    launcher = vi.fn(async () => {
        await fetch(callback());
        return true;
    });
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(directory, { recursive: true, force: true });
    process.exitCode = oldExitCode;
    GlobalState.setNonInteractive(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});
it('requests all projects and all eleven actions for 24h, proves binding, saves privately and reports narrower approval', async () => {
    await run();
    expect(requestBody).toMatchObject({
        clientId: 'lightdash-cli',
        name: 'default',
        projects: null,
        capabilities: Object.values(AgentCapability),
        expiresInSeconds: 86400,
        codeChallengeMethod: 'S256',
        resource: instance,
    });
    expect(Object.keys(requestBody).sort()).toEqual(
        [
            'clientId',
            'name',
            'projects',
            'capabilities',
            'expiresInSeconds',
            'redirectUri',
            'state',
            'codeChallenge',
            'codeChallengeMethod',
            'resource',
        ].sort(),
    );
    expect(calls.slice(0, 2).map((c) => [c.method, c.url, c.auth])).toEqual([
        ['GET', '/lightdash/api/v1/user', 'ApiKey personal-key'],
        [
            'POST',
            '/lightdash/api/v2/user/agent-connections/requests',
            'ApiKey personal-key',
        ],
    ]);
    const exchange = calls.find((c) => c.url.endsWith('/oauth/token'))!;
    const body = new URLSearchParams(exchange.body);
    expect(Object.fromEntries(body)).toMatchObject({
        grant_type: 'authorization_code',
        code: 'private-code',
        client_id: 'lightdash-cli',
        resource: instance,
        redirect_uri: requestBody.redirectUri,
    });
    const { createHash } = await import('crypto');
    expect(
        createHash('sha256')
            .update(body.get('code_verifier')!)
            .digest('base64url'),
    ).toBe(requestBody.codeChallenge);
    expect(exchange.auth).toBeUndefined();
    expect(
        calls
            .filter(
                (c) =>
                    c.url.endsWith('/status') ||
                    c.auth === 'Bearer private-access',
            )
            .every((c) => c.auth === 'Bearer private-access'),
    ).toBe(true);
    expect(calls.every((c) => c.cookie === undefined)).toBe(true);
    const store = new AgentConnectionStore();
    const saved = await store.readSlot(key());
    expect(saved?.tokens.accessToken).toBe('private-access');
    expect(saved?.grantExpiresAt).toBe(status.expiresAt);
    expect((await fs.stat(store.filePath)).mode % 512).toBe(0o600);
    expect(output()).toContain('Agent connection saved: default');
    expect(output()).toContain('Projects: Development');
    expect(output()).toContain(
        'Approved actions: Read and discover, Query data',
    );
    expect(output()).toContain(`Expires: ${String(status.expiresAt)}`);
    expect(output()).toContain(
        'Use: lightdash --agent-connection default <command>',
    );
    expect(output()).not.toContain('private-access');
    expect(output()).not.toContain('private-refresh');
    expect(await fs.readFile(location.configFilePath, 'utf8')).toBe(
        configBytes,
    );
    expect(process.exitCode).toBe(0);
    expect(generatePersonalAccessToken).not.toHaveBeenCalled();
    expect(loginWithOauth).not.toHaveBeenCalled();
    await closed();
});
it('narrows deduplicated UUIDs and slugs, capabilities, expiry and name', async () => {
    status.name = 'work';
    await run({
        name: 'work',
        projects: [projectUuid, 'development', projectUuid],
        capabilities: 'read_discover,query,query',
        expiresIn: '2h',
    });
    expect(requestBody).toMatchObject({
        name: 'work',
        projects: [projectUuid, 'development'],
        capabilities: ['read_discover', 'query'],
        expiresInSeconds: 7200,
    });
    expect(process.exitCode).toBe(0);
});
it('proves a requested slug using only the returned Bearer', async () => {
    await run({ projects: ['development'] });
    expect(
        calls.find((c) => c.url.endsWith(`/projects/${projectUuid}`))?.auth,
    ).toBe('Bearer private-access');
    expect(process.exitCode).toBe(0);
});
it.each([
    { name: '' },
    { name: '../x' },
    { name: 'x'.repeat(65) },
    { projects: [''] },
    { projects: [' x'] },
    { projects: ['x/y'] },
    { projects: ['x?y'] },
    { projects: ['x#y'] },
    { projects: ['x\\y'] },
    { projects: ['x\ny'] },
    { capabilities: '' },
    { capabilities: 'query,unknown' },
    { capabilities: 'query,' },
    { expiresIn: '0h' },
    { expiresIn: '-1h' },
    { expiresIn: '8d' },
    { expiresIn: '1.5h' },
    { expiresIn: '99999999999999999999d' },
    { oauthPort: '1bad' },
    { oauthPort: '0' },
    { oauthPort: '65536' },
    { timeout: 0 },
    { timeout: NaN },
    { timeout: Infinity },
    { timeout: 2147484 },
])('validates before config, requests or listeners: %j', async (options) => {
    const listen = vi.spyOn(Server.prototype, 'listen');
    await expect(run(options)).rejects.toThrow();
    expect(getConfig).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    await noSave();
});
it.each([
    [404, {}, unavailable],
    [405, {}, unavailable],
    [404, '<html>missing</html>', unavailable],
    [503, { error: { code: 'agent_connections_unavailable' } }, unavailable],
    [
        403,
        { error: { code: 'agent_identity_disabled' } },
        'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
    ],
    [
        401,
        {},
        'Your personal CLI login was rejected. Run lightdash login for this instance, then try again.',
    ],
    [
        403,
        { error: { message: 'personal-key should never be echoed' } },
        'The server refused agent connection approval. Check your permissions with an administrator.',
    ],
    [500, {}, failed],
    [200, '<html>login</html>', failed],
    [200, {}, failed],
])('fails closed on request response %s %j', async (code, reply, message) => {
    requestCode = Number(code);
    requestReply = reply;
    await run();
    expect(process.exitCode).toBe(1);
    expect(output()).toContain(String(message));
    expect(output()).toContain(unchanged);
    expect(calls.map((c) => c.url)).toEqual([
        '/lightdash/api/v1/user',
        '/lightdash/api/v2/user/agent-connections/requests',
    ]);
    expect(launcher).not.toHaveBeenCalled();
    await noSave();
    await closed();
});
it.each([
    'https://evil.example/api/v1/oauth/authorize',
    '/api/v1/oauth/authorize',
    'wrong-path',
    'userinfo',
    'wrong-issuer',
    'wrong-resource',
    'expired',
])('rejects an unsafe approval response %s', async (variant) => {
    const results = {
        authorizationUrl: `${instance}/api/v1/oauth/authorize`,
        issuer: instance,
        resource: instance,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    if (variant === 'wrong-path')
        results.authorizationUrl = `${instance}/api/v1/other`;
    else if (variant === 'userinfo')
        results.authorizationUrl = results.authorizationUrl.replace(
            'http://',
            'http://evil@',
        );
    else if (variant === 'wrong-issuer')
        results.issuer = 'https://evil.example';
    else if (variant === 'wrong-resource') results.resource = `${instance}/mcp`;
    else if (variant === 'expired')
        results.expiresAt = new Date(0).toISOString();
    else results.authorizationUrl = variant;
    requestReply = { status: 'ok', results };
    await run();
    expect(output()).toContain(failed);
    expect(launcher).not.toHaveBeenCalled();
    await noSave();
    await closed();
});
it.each([
    'unbound',
    'grant',
    'client',
    'name',
    'person',
    'organisation',
    'limits',
    'actions',
    'projects',
    'expiry',
    'expired',
    'missing-hint',
    'conflict-hint',
    'resource',
    'token-type',
    'token-expiry',
])('does not save an invalid binding: %s', async (variant) => {
    const options = {
        projects: [projectUuid],
        capabilities: 'read_discover,query',
        expiresIn: '2h',
    };
    if (variant === 'unbound') statusCode = 403;
    if (variant === 'grant') status.grantUuid = projectUuid;
    if (variant === 'client') status.clientId = 'other';
    if (variant === 'name') status.name = 'other';
    if (variant === 'person') person.userUuid = projectUuid;
    if (variant === 'organisation') person.organizationUuid = projectUuid;
    if (variant === 'limits') status.limitsStatus = 'invalid';
    if (variant === 'actions') options.capabilities = 'read_discover';
    if (variant === 'projects')
        options.projects = ['55555555-5555-4555-8555-555555555555'];
    if (variant === 'expiry')
        status.expiresAt = new Date(Date.now() + 86400000).toISOString();
    if (variant === 'expired') status.expiresAt = new Date(0).toISOString();
    if (variant === 'missing-hint') {
        delete token.agent_connection;
        callbackGrant = null;
    }
    if (variant === 'conflict-hint') callbackGrant = projectUuid;
    if (variant === 'resource') token.resource = `${instance}/mcp`;
    if (variant === 'token-type') token.token_type = 'ApiKey';
    if (variant === 'token-expiry') token.expires_in = 0;
    await run(options);
    expect(process.exitCode).toBe(1);
    expect(output()).toContain(
        variant === 'missing-hint'
            ? 'The server did not identify an agent connection. No credential was saved.'
            : unbound,
    );
    await noSave();
    await closed();
});
it('keeps an existing slot unchanged after replacement fails and warns before starting', async () => {
    const store = new AgentConnectionStore();
    await store.saveSlot({ ...key(), resource: instance });
    const before = await fs.readFile(store.filePath, 'utf8');
    launcher.mockImplementation(async () => {
        expect(output()).toContain('Replacing agent connection slot default');
        await fetch(callback());
        return true;
    });
    statusCode = 403;
    await run();
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
    expect(await fs.readFile(location.configFilePath, 'utf8')).toBe(
        configBytes,
    );
    expect(calls.every((c) => c.method !== 'DELETE')).toBe(true);
});
it.each([401, 500])(
    'fails bootstrap %s before starting a listener',
    async (code) => {
        bootstrapCode = code;
        const listen = vi.spyOn(Server.prototype, 'listen');
        await run();
        expect(listen).not.toHaveBeenCalled();
        expect(calls).toHaveLength(1);
        expect(process.exitCode).toBe(1);
        await noSave();
    },
);
it('refuses a service account before sending it', async () => {
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: instance,
            apiKey: `${AuthTokenPrefix.SERVICE_ACCOUNT}secret`,
        },
    });
    await run();
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
    await noSave();
});
it('refuses global selection before reading inputs or config', async () => {
    await expect(
        runWithAgentConnectionSelection('work', () => run({ name: '' })),
    ).rejects.toThrow(personalLoginRequired);
    expect(getConfig).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
});
it('captures personal credential, proxy and instance once', async () => {
    const config = {
        context: {
            serverUrl: instance,
            apiKey: 'personal-key',
            proxyAuthorization: 'personal-proxy',
        },
    };
    vi.mocked(getConfig).mockResolvedValue(config);
    server.prependListener('request', (req) => {
        if (req.url?.endsWith('/user')) {
            config.context.apiKey = 'changed';
            config.context.serverUrl = 'https://evil.example';
            config.context.proxyAuthorization = 'changed';
        }
    });
    await run();
    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(
        calls
            .slice(0, 2)
            .every(
                (c) =>
                    c.auth === 'ApiKey personal-key' &&
                    c.proxy === 'personal-proxy',
            ),
    ).toBe(true);
    expect(process.exitCode).toBe(0);
});
it.each([200, 403, 500])(
    'saving is successful regardless of warehouse state %s',
    async (code) => {
        warehouseCode = code;
        await run();
        expect(process.exitCode).toBe(0);
        expect(await new AgentConnectionStore().readSlot(key())).not.toBeNull();
    },
);
it('prints the URL and waits without launching a browser in non-interactive mode', async () => {
    GlobalState.setNonInteractive(true);
    const completion = run({ timeout: 0.1 });
    await completion;
    expect(launcher).not.toHaveBeenCalled();
    expect(output()).toContain(`${instance}/api/v1/oauth/authorize`);
    expect(process.exitCode).toBe(1);
    expect(calls).toHaveLength(2);
    await noSave();
    await closed();
});
it('checks state on denial and accepts only a valid denial', async () => {
    launcher.mockImplementation(async () => {
        const url = callback();
        url.searchParams.delete('code');
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set('state', 'wrong');
        expect((await fetch(url)).status).toBe(400);
        url.searchParams.set('state', String(requestBody.state));
        expect((await fetch(url)).status).toBe(200);
        return true;
    });
    await run();
    expect(process.exitCode).toBe(1);
    expect(calls).toHaveLength(2);
    await noSave();
    await closed();
});
it.each([
    {
        label: 'unavailable',
        error: 'agent_connections_unavailable',
        message: unavailable,
    },
    { label: 'disabled', error: 'agent_identity_disabled', message: disabled },
    { label: 'cancel', error: 'access_denied', message: denied },
    { label: 'unknown', error: 'unknown_error', message: denied },
    {
        label: 'shell metacharacters',
        error: '$(whoami); `id` | >&2',
        message: denied,
    },
    {
        label: 'ANSI escapes',
        error: '\u001b[31mhostile\u001b[0m',
        message: denied,
    },
    { label: 'long value', error: 'x'.repeat(10_000), message: denied },
    {
        label: 'personal key',
        error: 'prefix-personal-key-suffix',
        message: denied,
    },
    {
        label: 'repeated code in one value',
        error: 'agent_connections_unavailable,agent_connections_unavailable',
        message: denied,
    },
])(
    'reports only fixed callback text for $label',
    async ({ error, message }) => {
        const save = vi.spyOn(AgentConnectionStore.prototype, 'saveSlot');
        const write = vi.spyOn(fs, 'writeFile');
        const rename = vi.spyOn(fs, 'rename');
        let callbackStatus: number | undefined;
        launcher.mockImplementation(async () => {
            const url = callback();
            url.searchParams.delete('code');
            url.searchParams.set('error', error);
            url.searchParams.set(
                'error_description',
                'personal-key\u001b[31m$(whoami)',
            );
            callbackStatus = (await fetch(url)).status;
            return true;
        });
        await run();
        expect(callbackStatus).toBe(200);
        expect(process.exitCode).toBe(1);
        expect(vi.mocked(console.error).mock.calls).toEqual([
            [
                `Open this page to approve the agent connection:\n${instance}/api/v1/oauth/authorize?agent_request=44444444-4444-4444-8444-444444444444`,
            ],
            ['Waiting for browser approval and warehouse setup...'],
            [message],
            [unchanged],
            [
                `Manage warehouse agent sign-ins in the app:\n${instance}/generalSettings/myAgentConnections`,
            ],
        ]);
        expect(calls.map((call) => [call.method, call.url])).toEqual([
            ['GET', '/lightdash/api/v1/user'],
            ['POST', '/lightdash/api/v2/user/agent-connections/requests'],
        ]);
        expect(save).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(rename).not.toHaveBeenCalled();
        expect(getConfig).toHaveBeenCalledWith({ readOnly: true });
        await noSave();
        await closed();
    },
);
it.each([
    ['agent_connections_unavailable', unavailable],
    ['agent_identity_disabled', disabled],
])(
    'reuses the POST output for callback code %s, including a screened settings link',
    async (error, message) => {
        vi.mocked(getConfig).mockResolvedValue({
            context: { serverUrl: instance, apiKey: 'generalSettings' },
        });
        requestCode = 403;
        requestReply = { error: { code: error } };
        await run();
        const postOutput = output();
        expect(postOutput).toBe(
            `${message}\n${unchanged}\nManage warehouse agent sign-ins in the app:\nName unavailable`,
        );
        expect(process.exitCode).toBe(1);
        await noSave();
        await closed();
        vi.mocked(console.error).mockClear();
        requestCode = 200;
        requestReply = null;
        launcher.mockImplementation(async () => {
            const url = callback();
            url.searchParams.delete('code');
            url.searchParams.set('error', error);
            await fetch(url);
            return true;
        });
        await run();
        expect(
            vi.mocked(console.error).mock.calls.slice(2).flat().join('\n'),
        ).toBe(postOutput);
        expect(process.exitCode).toBe(1);
        expect(calls).toHaveLength(4);
        await noSave();
        await closed();
    },
);
it.each([
    ['agent_connections_unavailable', 'state'],
    ['agent_connections_unavailable', 'iss'],
    ['agent_identity_disabled', 'state'],
    ['agent_identity_disabled', 'iss'],
])(
    'ignores callback %s with wrong %s until a valid denial',
    async (error, field) => {
        const responses: number[] = [];
        launcher.mockImplementation(async () => {
            const url = callback();
            url.searchParams.delete('code');
            url.searchParams.set('error', error);
            const original = url.searchParams.get(field)!;
            url.searchParams.set(field, 'wrong');
            responses.push((await fetch(url)).status);
            url.searchParams.set(field, original);
            url.searchParams.set('error', 'access_denied');
            responses.push((await fetch(url)).status);
            return true;
        });
        await run();
        expect(responses).toEqual([400, 200]);
        expect(process.exitCode).toBe(1);
        expect(vi.mocked(console.error).mock.calls.slice(2)).toEqual([
            [denied],
            [unchanged],
            [
                `Manage warehouse agent sign-ins in the app:\n${instance}/generalSettings/myAgentConnections`,
            ],
        ]);
        expect(calls).toHaveLength(2);
        await noSave();
        await closed();
    },
);
it.each([
    'path',
    'method',
    'state',
    'issuer',
    'duplicate-state',
    'duplicate-code',
    'duplicate-issuer',
    'duplicate-grant',
    'conflict',
])('ignores invalid callback %s before a valid one', async (variant) => {
    launcher.mockImplementation(async () => {
        const url = callback();
        if (variant === 'path') url.pathname = '/callback/extra';
        if (variant === 'state') url.searchParams.set('state', 'wrong');
        if (variant === 'issuer')
            url.searchParams.set('iss', 'https://evil.example');
        if (variant.startsWith('duplicate-')) {
            const field = {
                'duplicate-state': 'state',
                'duplicate-code': 'code',
                'duplicate-issuer': 'iss',
                'duplicate-grant': 'grant_uuid',
            }[variant]!;
            url.searchParams.append(field, url.searchParams.get(field)!);
        }
        if (variant === 'conflict')
            url.searchParams.set('error', 'access_denied');
        expect(
            (
                await fetch(url, {
                    method: variant === 'method' ? 'POST' : 'GET',
                })
            ).status,
        ).toBe(400);
        await fetch(callback());
        return true;
    });
    await run();
    expect(process.exitCode).toBe(0);
    expect(calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(1);
    await closed();
});

it.each(['s', 'm', 'h', 'd'])(
    'accepts positive integer durations in %s',
    async (unit) => {
        requestCode = 404;
        await run({ expiresIn: `2${unit}` });
        expect(requestBody.expiresInSeconds).toBe(
            { s: 2, m: 120, h: 7200, d: 172800 }[unit],
        );
        await noSave();
    },
);
it('accepts the maximum seven-day duration', async () => {
    requestCode = 404;
    await run({ expiresIn: '7d' });
    expect(requestBody.expiresInSeconds).toBe(604800);
});
it('lists all valid keys on an unknown capability', async () => {
    await expect(run({ capabilities: 'unknown' })).rejects.toThrow(
        Object.values(AgentCapability).join(', '),
    );
});
it('reports why a service account cannot bootstrap approval', async () => {
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: instance,
            apiKey: `${AuthTokenPrefix.SERVICE_ACCOUNT}secret`,
        },
    });
    await run();
    expect(output()).toContain(
        'Agent connection approval requires a personal CLI login. Service account credentials cannot start approval.',
    );
});
it.each(['bootstrap', 'request', 'exchange', 'proof'])(
    'never follows a redirect or retries at %s',
    async (phase) => {
        const match = {
            bootstrap: '/user',
            request: '/requests',
            exchange: '/oauth/token',
            proof: '/status',
        }[phase]!;
        const listeners = server.listeners('request');
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            if (req.url?.endsWith(match)) {
                calls.push({
                    method: req.method!,
                    url: req.url!,
                    auth: req.headers.authorization,
                    body: '',
                });
                res.writeHead(302, { Location: `${instance}/must-not-follow` });
                res.end();
            } else
                for (const handle of listeners) handle.call(server, req, res);
        });
        await run();
        expect(calls.filter((call) => call.url.endsWith(match))).toHaveLength(
            1,
        );
        expect(calls.some((call) => call.url.includes('must-not-follow'))).toBe(
            false,
        );
        expect(process.exitCode).toBe(1);
        await noSave();
        await closed();
    },
);
it.each(['bootstrap', 'request'])(
    'reports a network failure at %s without fallback',
    async (phase) => {
        const match = phase === 'bootstrap' ? '/user' : '/requests';
        const listeners = server.listeners('request');
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            if (req.url?.endsWith(match)) {
                calls.push({ method: req.method!, url: req.url!, body: '' });
                req.socket.destroy();
            } else
                for (const handle of listeners) handle.call(server, req, res);
        });
        await run();
        expect(output()).toContain(failed);
        expect(calls).toHaveLength(phase === 'bootstrap' ? 1 : 2);
        expect(launcher).not.toHaveBeenCalled();
        await noSave();
        await closed();
    },
);
it('does not print a personal token echoed into the approval URL', async () => {
    requestReply = {
        status: 'ok',
        results: {
            authorizationUrl: `${instance}/api/v1/oauth/authorize?approval_request=personal-key`,
            issuer: instance,
            resource: instance,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
    };
    await run();
    expect(process.exitCode).toBe(1);
    expect(launcher).not.toHaveBeenCalled();
    await noSave();
});
it('accepts the callback hint without token metadata', async () => {
    delete token.agent_connection;
    await run();
    expect(process.exitCode).toBe(0);
    expect((await new AgentConnectionStore().readSlot(key()))?.grantUuid).toBe(
        callbackGrant,
    );
});
it('accepts token metadata without a callback hint', async () => {
    callbackGrant = null;
    await run();
    expect(process.exitCode).toBe(0);
});
it.each([
    ['refresh_expires_in', -1],
    ['refresh_expires_in', 99999999999],
    ['scope', ''],
    ['scope', 'read\nwrite'],
    ['agent_connection', { grant_uuid: 'not-uuid' }],
])('refuses malformed token field %s', async (field, value) => {
    token[String(field)] = value;
    await run();
    expect(output()).toContain(unbound);
    await noSave();
});
it('saves a returned refresh deadline only when it is within the grant', async () => {
    token.refresh_expires_in = 600;
    const before = Date.now();
    await run();
    const saved = await new AgentConnectionStore().readSlot(key());
    expect(
        Date.parse(saved!.tokens.refreshTokenExpiresAt!),
    ).toBeGreaterThanOrEqual(before + 600000);
});
it('preserves a failed replacement on an unavailable server', async () => {
    const store = new AgentConnectionStore();
    await store.saveSlot({ ...key(), resource: instance });
    const before = await fs.readFile(store.filePath, 'utf8');
    requestCode = 404;
    await run();
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
    expect(output()).toContain(unavailable);
});
it('aborts a stalled request and closes the listener', async () => {
    const listeners = server.listeners('request');
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
        if (req.url?.endsWith('/requests')) {
            let body = '';
            req.on('data', (data) => {
                body += String(data);
            });
            req.on('end', () => {
                try {
                    requestBody = JSON.parse(body);
                } catch {
                    requestBody = {};
                }
            });
        } else for (const handle of listeners) handle.call(server, req, res);
    });
    await run({ timeout: 0.1 });
    expect(process.exitCode).toBe(1);
    expect(launcher).not.toHaveBeenCalled();
    await noSave();
    await closed();
});
it('cancels an active approval and removes its signal listeners', async () => {
    const before = process.listenerCount('SIGINT');
    launcher.mockImplementation(async () => {
        process.emit('SIGINT');
        return true;
    });
    await run();
    expect(process.listenerCount('SIGINT')).toBe(before);
    expect(calls).toHaveLength(2);
    expect(process.exitCode).toBe(1);
    await noSave();
    await closed();
});
it('does not request warehouse status without effective read permission', async () => {
    status.approvedProjects = [
        {
            projectUuid,
            name: 'Development',
            approvedCapabilities: [AgentCapability.Query],
        },
    ];
    status.effectiveProjects = [
        {
            projectUuid,
            capabilities: [
                {
                    capability: AgentCapability.Query,
                    allowed: true,
                    reason: null,
                },
            ],
        },
    ];
    await run();
    expect(calls.some((call) => call.url.endsWith('/ai-access/me'))).toBe(
        false,
    );
    expect(process.exitCode).toBe(0);
});

it('reports known warehouse setup needs without failing the credential save', async () => {
    warehouseResult.identity = null;
    warehouseResult.refusal = {
        reason: 'needs_sign_in',
        settingsUrl: null,
        connectUrl: null,
    };
    await run();
    expect(output()).toContain('Warehouse sign-ins: needs_setup');
    expect(output()).toContain(
        'Default warehouse connection checked; review additional connections in the app.',
    );
    expect(process.exitCode).toBe(0);
});

it('measures the requested lifetime from approval rather than time spent waiting', async () => {
    launcher.mockImplementation(async () => {
        const approved = Date.now() + 10000;
        vi.spyOn(Date, 'now').mockReturnValue(approved);
        status.approvedAt = new Date(approved).toISOString();
        status.expiresAt = new Date(approved + 7200000).toISOString();
        await fetch(callback());
        return true;
    });
    await run({ expiresIn: '2h' });
    expect(process.exitCode).toBe(0);
    expect(
        (await new AgentConnectionStore().readSlot(key()))?.grantExpiresAt,
    ).toBe(status.expiresAt);
});

it('refuses a callback after the approval transaction expires', async () => {
    launcher.mockImplementation(async () => {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000);
        await fetch(callback());
        return true;
    });
    await run();
    expect(process.exitCode).toBe(1);
    expect(calls.some((call) => call.url.endsWith('/oauth/token'))).toBe(false);
    await noSave();
    await closed();
});

it('rejects a parseable approval deadline that is not an ISO timestamp', async () => {
    requestReply = {
        status: 'ok',
        results: {
            authorizationUrl: `${instance}/api/v1/oauth/authorize`,
            issuer: instance,
            resource: instance,
            expiresAt: '2099',
        },
    };
    await run();
    expect(process.exitCode).toBe(1);
    expect(launcher).not.toHaveBeenCalled();
    await noSave();
});

it('updates and stops the interactive countdown while waiting for approval', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stderr, 'isTTY', {
        configurable: true,
        value: true,
    });
    vi.stubEnv('CI', undefined);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { default: ora } = await import('ora');
    const spinner = ora({ isEnabled: false });
    const stop = vi.spyOn(spinner, 'stop');
    const start = vi
        .spyOn(GlobalState, 'startSpinner')
        .mockImplementation((options) => {
            spinner.text =
                typeof options === 'object'
                    ? (options.text ?? '')
                    : String(options);
            return spinner;
        });
    vi.spyOn(GlobalState, 'getActiveSpinner').mockReturnValue(spinner);
    let firstText: string | undefined;
    let laterText: string | undefined;
    launcher.mockImplementation(async () => {
        firstText = GlobalState.getActiveSpinner()?.text;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 1050);
        });
        laterText = GlobalState.getActiveSpinner()?.text;
        await fetch(callback());
        return true;
    });
    try {
        await run();
        expect(start).toHaveBeenCalledTimes(1);
        expect(firstText).not.toBe(laterText);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(GlobalState.getActiveSpinner()?.isSpinning).toBe(false);
        expect(process.exitCode).toBe(0);
    } finally {
        if (descriptor)
            Object.defineProperty(process.stderr, 'isTTY', descriptor);
        else Reflect.deleteProperty(process.stderr, 'isTTY');
        GlobalState.getActiveSpinner()?.stop();
    }
});

const existingGrant = '66666666-6666-4666-8666-666666666666';
const existingConnection = () => ({
    ...key(),
    resource: instance,
    grantUuid: existingGrant,
});
const existingRefused =
    'The server returned the existing agent connection instead of a new one. No credential was saved.';
it.each([60, 100000])(
    'clips token lifetimes of %s seconds to the grant after a delayed exchange',
    async (lifetime) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const started = Date.now();
        status.approvedAt = new Date(started).toISOString();
        status.expiresAt = new Date(started + 60000).toISOString();
        token.expires_in = lifetime;
        token.refresh_expires_in = lifetime;
        server.prependListener('request', (req) => {
            if (req.url?.endsWith('/oauth/token'))
                vi.setSystemTime(started + 150);
        });
        await run({ expiresIn: '60s' });
        expect(process.exitCode).toBe(0);
        const saved = await new AgentConnectionStore().readSlot(key());
        expect(saved?.tokens.accessTokenExpiresAt).toBe(status.expiresAt);
        expect(saved?.tokens.refreshTokenExpiresAt).toBe(status.expiresAt);
    },
);
it('bases shorter token deadlines on exchange start, never response receipt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const started = Date.now();
    token.refresh_expires_in = 600;
    server.prependListener('request', (req) => {
        if (req.url?.endsWith('/oauth/token')) vi.setSystemTime(started + 150);
    });
    await run();
    const saved = await new AgentConnectionStore().readSlot(key());
    expect(saved?.tokens.accessTokenExpiresAt).toBe(
        new Date(started + 300000).toISOString(),
    );
    expect(saved?.tokens.refreshTokenExpiresAt).toBe(
        new Date(started + 600000).toISOString(),
    );
});
it('refuses an existing grant hint before proof requests', async () => {
    const store = new AgentConnectionStore();
    await store.saveSlot({ ...key(), resource: instance });
    const before = await fs.readFile(store.filePath, 'utf8');
    await run();
    expect(process.exitCode).toBe(1);
    expect(output()).toContain(existingRefused);
    expect(calls.some((call) => call.url.endsWith('/status'))).toBe(false);
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
});
it.each(['signal', 'timer', 'approval', 'grant', 'token', 'same-grant'])(
    'checks %s inside the save lock after another writer releases it',
    async (variant) => {
        const store = new AgentConnectionStore();
        await store.saveSlot(existingConnection());
        let before = await fs.readFile(store.filePath, 'utf8');
        const release = await acquireLock(`${store.filePath}.lock`);
        const save = AgentConnectionStore.prototype.saveSlot;
        let reached!: () => void;
        const waiting = new Promise<void>((resolve) => {
            reached = resolve;
        });
        vi.spyOn(AgentConnectionStore.prototype, 'saveSlot').mockImplementation(
            function saveWithWait(this: AgentConnectionStore, ...args) {
                const result = save.apply(this, args);
                reached();
                return result;
            },
        );
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        const completion = run({ timeout: variant === 'timer' ? 180 : 7200 });
        await waiting;
        if (variant === 'same-grant') {
            await fs.writeFile(
                store.filePath,
                before.replace(existingGrant, key().grantUuid),
            );
            before = await fs.readFile(store.filePath, 'utf8');
        } else if (variant === 'signal') process.emit('SIGINT');
        else if (variant === 'timer') await vi.advanceTimersByTimeAsync(180001);
        else
            vi.setSystemTime(
                Date.now() +
                    { approval: 60001, token: 300001, grant: 3600001 }[
                        variant as 'approval' | 'token' | 'grant'
                    ],
            );
        await release();
        let completed = false;
        void completion.then(() => {
            completed = true;
        });
        await vi.waitFor(() => expect(completed).toBe(true));
        await completion;
        expect(process.exitCode).toBe(1);
        const messages = {
            'same-grant': existingRefused,
            grant: 'The agent connection expired. No credential was saved.',
            token: 'The agent connection token expired before it could be saved. No credential was saved.',
            approval:
                'The approval transaction expired. No credential was saved.',
            signal: 'Agent connection approval timed out or was cancelled. No credential was saved.',
            timer: 'Agent connection approval timed out or was cancelled. No credential was saved.',
        };
        expect(output()).toContain(messages[variant as keyof typeof messages]);
        expect(output()).not.toContain('Agent connection saved:');
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
    },
);
it.each(['journal', 'directory', 'release', 'cancel-after-commit'])(
    'reports the committed slot after %s and permits the next selected use',
    async (fault) => {
        const store = new AgentConnectionStore();
        const old = existingConnection();
        await store.saveSlot(old);
        await store.withLock(async (locked) =>
            locked.writeJournal(old, {
                grantUuid: old.grantUuid,
                attemptUuid: projectUuid,
                generation: 1,
            }),
        );
        const { unlink, open, rename } = fs;
        let committed = false;
        vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
            await rename(...args);
            if (args[1] === store.filePath) {
                committed = true;
                if (fault === 'cancel-after-commit') process.emit('SIGINT');
            }
        });
        vi.spyOn(fs, 'unlink').mockImplementation(async (file) => {
            if (
                committed &&
                ((fault === 'journal' && String(file).endsWith('.journal')) ||
                    (fault === 'release' && String(file).endsWith('.lock')))
            )
                throw new Error('cleanup failed');
            return unlink(file);
        });
        vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
            const handle = await open(...args);
            if (committed && fault === 'directory' && args[0] === directory)
                vi.spyOn(handle, 'sync').mockRejectedValue(
                    new Error('directory sync failed'),
                );
            return handle;
        });
        await run();
        expect(process.exitCode).toBe(0);
        expect(output()).toContain('Agent connection saved: default');
        expect(output()).not.toContain(unchanged);
        if (fault !== 'cancel-after-commit')
            expect(output()).toContain(
                'The credential was saved, but local clean-up did not finish. Run lightdash agent status --name default to check it.',
            );
        expect((await store.readSlot(key()))?.grantUuid).toBe(key().grantUuid);
        vi.mocked(fs.open).mockRestore();
        vi.mocked(fs.unlink).mockRestore();
        vi.mocked(fs.rename).mockRestore();
        if (fault === 'release') await fs.unlink(`${store.filePath}.lock`);
        expect(
            (await new AgentTokenProvider(store).getToken(key())).grantUuid,
        ).toBe(key().grantUuid);
        expect(
            (await fs.readdir(directory)).some((file) =>
                file.endsWith('.journal'),
            ),
        ).toBe(false);
    },
);
it.each([
    '%70ersonal-key',
    '%2570ersonal-key',
    'personal%2dkey',
    'personal%2Dkey',
    '%70ersonal-proxy',
    '%2570ersonal-proxy',
])(
    'refuses reflected approval URL secret %s before output or launch',
    async (echo) => {
        requestReply = {
            status: 'ok',
            results: {
                authorizationUrl: `${instance}/api/v1/oauth/authorize?approval_request=${echo}`,
                issuer: instance,
                resource: instance,
                expiresAt: new Date(Date.now() + 60000).toISOString(),
            },
        };
        await run();
        expect(process.exitCode).toBe(1);
        expect(output()).toContain(failed);
        expect(output()).not.toContain(echo);
        expect(launcher).not.toHaveBeenCalled();
        await noSave();
    },
);
it.each([
    'personal-key',
    '%70ersonal-key',
    '%2570ersonal-key',
    'personal%2dkey',
    'personal%2Dkey',
    'personal-proxy',
    '%2570ersonal-proxy',
    'private-access',
    '%2570rivate-refresh',
])(
    'replaces a reflected project secret %s with a neutral name after saving',
    async (echo) => {
        status.approvedProjects = [
            {
                projectUuid,
                name: echo,
                approvedCapabilities: [
                    AgentCapability.ReadDiscover,
                    AgentCapability.Query,
                ],
            },
        ];
        await run();
        expect(process.exitCode).toBe(0);
        expect(output()).toContain('Agent connection saved: default');
        expect(output()).toContain('Projects: Name unavailable');
        expect(output()).not.toContain(echo);
        expect(await new AgentConnectionStore().readSlot(key())).not.toBeNull();
    },
);
it.each([
    'personal-key',
    'personal-proxy',
    'private-access',
    'private-refresh',
])(
    'screens the echoed slot name and selection command for %s',
    async (echo) => {
        status.name = echo;
        await run({ name: echo });
        expect(process.exitCode).toBe(0);
        expect(output()).not.toContain(echo);
        expect(output()).toContain('Agent connection saved: Name unavailable');
    },
);

it('screens the settings link on failure with the captured bootstrap secret', async () => {
    vi.mocked(getConfig).mockResolvedValue({
        context: { serverUrl: instance, apiKey: 'lightdash' },
    });
    requestCode = 404;
    await run();
    expect(process.exitCode).toBe(1);
    expect(output()).toContain(unavailable);
    expect(output()).toContain(
        'Manage warehouse agent sign-ins in the app:\nName unavailable',
    );
    expect(output()).not.toContain(instance);
});
it('screens the settings link after save with the newly returned token', async () => {
    token.access_token = 'lightdash';
    await run();
    expect(process.exitCode).toBe(0);
    expect(output()).toContain('Settings: Name unavailable');
});
