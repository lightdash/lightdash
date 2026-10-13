// Passing against this double validates the design only; run this suite against the real issuer before launch.
// Real approval/code creation, token-family persistence/rotation, crash recovery, pod gating and URL/token separation remain unproved.
import { AgentCapability } from '@lightdash/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import * as yaml from 'js-yaml';
import fetch from 'node-fetch';
import { tmpdir } from 'os';
import path from 'path';
import type { ConnectionConnectOptions } from './connectInputs';

type Project = {
    projectUuid: string;
    slug: string;
    approvedCapabilities: AgentCapability[];
};
const personUuid = '22222222-2222-4222-8222-222222222222';
const organizationUuid = '11111111-1111-4111-8111-111111111111';
const projectUuid = '44444444-4444-4444-8444-444444444444';
const secondProject = '55555555-5555-4555-8555-555555555555';
const privateAccess = 'fixture-access-opaque';
const privateRefresh = 'fixture-refresh-opaque';
let home: string;
let instance: string;
let server: Server;
let request: Record<string, unknown>;
let grantUuid: string;
let code: string;
let used: boolean;
let approved: Project[];
let token: Record<string, unknown>;
let status: Record<string, unknown>;
let approval: Record<string, unknown>;
let callbackChange: (url: URL) => void;
let callbackStatus: number;
let bindingChange: (form: URLSearchParams) => void;
let responseText: string | undefined;
let responseDate: string | undefined;
let userUuid: string;
let revokedAtExchange: boolean;
let calls: {
    method: string;
    url: string;
    auth?: string;
    body: string;
    saved: boolean;
}[];
let errors: string[];
let callbackDone: Promise<void>;
let configBytes: string;
let config: typeof import('../config');
let connect: typeof import('../handlers/agentConnectionConnect');
let storeModule: typeof import('./store');
let providerModule: typeof import('./agentTokenProvider');
let globalState: typeof import('../globalState');
const key = () => ({
    instanceUrl: instance,
    personUuid,
    organizationUuid,
    name: 'default',
});
const store = () => new storeModule.AgentConnectionStore();
const envelope = (results: unknown) => ({ status: 'ok', results });
const projectStatus = (projects: Project[]) => ({
    approvedProjects: projects.map(
        ({ projectUuid: id, approvedCapabilities }) => ({
            projectUuid: id,
            name: 'Project',
            approvedCapabilities,
        }),
    ),
    effectiveProjects: projects.map(
        ({ projectUuid: id, approvedCapabilities }) => ({
            projectUuid: id,
            capabilities: approvedCapabilities.map((capability) => ({
                capability,
                allowed: true,
                reason: null,
            })),
        }),
    ),
});
const deliver = async () => {
    const url = new URL(String(request.redirectUri));
    url.search = new URLSearchParams({
        state: String(request.state),
        iss: instance,
        code,
        grant_uuid: grantUuid,
    }).toString();
    callbackChange(url);
    callbackStatus = (await fetch(url)).status;
    if (callbackStatus !== 200) {
        const denied = new URL(String(request.redirectUri));
        denied.search = new URLSearchParams({
            state: String(request.state),
            iss: instance,
            error: 'access_denied',
        }).toString();
        await fetch(denied);
    }
};
const run = async (options: Partial<ConnectionConnectOptions> = {}) => {
    await connect.agentConnectionConnectHandler({
        verbose: false,
        timeout: 3,
        ...options,
    });
    await callbackDone;
    expect(errors).toEqual([]);
    expect(await fs.readFile(config.configFilePath, 'utf8')).toBe(configBytes);
};
const refused = async () => {
    expect(process.exitCode).toBe(1);
    expect(await store().readSlot(key())).toBeNull();
    const output = vi.mocked(console.error).mock.calls.flat().join('\n');
    for (const secret of [privateAccess, privateRefresh, code])
        expect(output).not.toContain(secret);
};
beforeAll(async () => {
    home = await fs.mkdtemp(path.join(tmpdir(), 'issuer-contract-'));
    vi.stubEnv('HOME', home);
    vi.resetModules();
    config = await import('../config');
    connect = await import('../handlers/agentConnectionConnect');
    storeModule = await import('./store');
    providerModule = await import('./agentTokenProvider');
    globalState = await import('../globalState');
    expect(config.configFilePath.startsWith(home)).toBe(true);
});
afterAll(async () => {
    vi.unstubAllEnvs();
    await fs.rm(home, { recursive: true, force: true });
});
beforeEach(async () => {
    process.exitCode = undefined;
    for (const name of [
        'LIGHTDASH_URL',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_OAUTH_PORT',
    ])
        vi.stubEnv(name, undefined);
    globalState.default.setNonInteractive(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    grantUuid = randomUUID();
    code = 'fixture-code-opaque';
    used = false;
    revokedAtExchange = false;
    request = {};
    approved = [
        {
            projectUuid,
            slug: 'development',
            approvedCapabilities: [AgentCapability.Query],
        },
    ];
    token = {
        access_token: privateAccess,
        refresh_token: privateRefresh,
        token_type: 'Bearer',
        expires_in: 300,
        refresh_expires_in: 600,
        scope: 'read write',
    };
    status = {
        grantUuid,
        name: 'default',
        clientId: 'lightdash-cli',
        approvedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'active',
        limitsStatus: 'ok',
        lastUsedAt: null,
        revokedAt: null,
    };
    approval = {};
    calls = [];
    errors = [];
    callbackDone = Promise.resolve();
    callbackChange = () => {};
    bindingChange = () => {};
    callbackStatus = 0;
    responseText = undefined;
    responseDate = undefined;
    userUuid = personUuid;
    server = createServer((req, res) => {
        void (async () => {
            let body = '';
            for await (const chunk of req) body += String(chunk);
            calls.push({
                method: req.method!,
                url: req.url!,
                auth: req.headers.authorization,
                body,
                saved: (await store().readSlot(key())) !== null,
            });
            const reply = (value: unknown, codeValue = 200) => {
                res.writeHead(codeValue, {
                    'Content-Type': 'application/json',
                });
                res.end(JSON.stringify(value));
            };
            if (req.url === '/lightdash/api/v1/user') {
                reply(
                    envelope({
                        userUuid: req.headers.authorization?.startsWith(
                            'ApiKey ',
                        )
                            ? personUuid
                            : userUuid,
                        organizationUuid,
                    }),
                );
            } else if (
                req.url === '/lightdash/api/v2/user/agent-connections/requests'
            ) {
                request = JSON.parse(body) as Record<string, unknown>;
                reply(
                    envelope({
                        authorizationUrl: `${instance}/api/v1/oauth/authorize?agent_request=${projectUuid}`,
                        issuer: instance,
                        resource: instance,
                        expiresAt: new Date(Date.now() + 60000).toISOString(),
                        ...approval,
                    }),
                );
                if (!Object.keys(approval).length) callbackDone = deliver();
            } else if (req.url === '/lightdash/api/v1/oauth/token') {
                if (responseDate !== undefined)
                    res.setHeader('Date', responseDate);
                const form = new URLSearchParams(body);
                bindingChange(form);
                if (form.get('grant_type') === 'authorization_code') {
                    const challenge = createHash('sha256')
                        .update(form.get('code_verifier') ?? '')
                        .digest('base64url');
                    if (
                        used ||
                        revokedAtExchange ||
                        form.get('code') !== code ||
                        challenge !== request.codeChallenge ||
                        form.get('resource') !== instance ||
                        form.get('client_id') !== request.clientId ||
                        form.get('redirect_uri') !== request.redirectUri
                    ) {
                        reply({ error: 'invalid_grant' }, 400);
                        return;
                    }
                    used = true;
                } else if (
                    form.get('refresh_token') !== privateRefresh ||
                    form.get('resource') !== instance ||
                    form.get('scope') !== 'read write'
                ) {
                    reply({ error: 'invalid_grant' }, 400);
                    return;
                }
                if (responseText !== undefined) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(responseText);
                } else
                    reply({
                        agent_connection: {
                            grant_uuid: grantUuid,
                            grant_revision: 1,
                            approved_projects: approved.map(
                                ({ projectUuid: id, slug }) => ({
                                    project_uuid: id,
                                    slug,
                                }),
                            ),
                        },
                        issuer: instance,
                        resource: instance,
                        ...token,
                    });
            } else if (
                req.url ===
                `/lightdash/api/v2/user/agent-connections/${grantUuid}/status`
            )
                reply(envelope({ ...projectStatus(approved), ...status }));
            else
                reply(
                    { error: 'No project read is permitted by this double' },
                    403,
                );
        })().catch((error: unknown) => {
            errors.push(String(error));
            res.writeHead(500);
            res.end();
        });
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    instance = `http://127.0.0.1:${address.port}/lightdash`;
    await fs.mkdir(path.dirname(config.configFilePath), { recursive: true });
    await config.writeConfigToFile(config.configFilePath, {
        context: { serverUrl: `${instance}/`, apiKey: 'fixture-personal' },
    });
    configBytes = await fs.readFile(config.configFilePath, 'utf8');
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(path.dirname(config.configFilePath), {
        recursive: true,
        force: true,
    });
    process.exitCode = undefined;
    globalState.default.setNonInteractive(false);
    vi.restoreAllMocks();
});
it('accepts exact request, callback and token fields with state and S256, then verifies and saves through real code', async () => {
    await run();
    expect(process.exitCode).toBe(0);
    expect(request).toEqual({
        clientId: 'lightdash-cli',
        name: 'default',
        projects: null,
        capabilities: Object.values(AgentCapability),
        expiresInSeconds: 86400,
        redirectUri: expect.stringMatching(
            /^http:\/\/localhost:\d+\/callback$/,
        ),
        state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        codeChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        codeChallengeMethod: 'S256',
        resource: instance,
    });
    const form = new URLSearchParams(
        calls.find((call) => call.url.endsWith('/token'))!.body,
    );
    expect(Object.fromEntries(form)).toEqual({
        grant_type: 'authorization_code',
        code,
        code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        redirect_uri: request.redirectUri,
        client_id: 'lightdash-cli',
        resource: instance,
    });
    expect(
        createHash('sha256')
            .update(form.get('code_verifier')!)
            .digest('base64url'),
    ).toBe(request.codeChallenge);
    const saved = await store().readSlot(key());
    expect(saved?.grantUuid).toBe(grantUuid);
    expect(saved?.tokens.refreshTokenExpiresAt).not.toBeNull();
    expect(
        await new providerModule.AgentTokenProvider(store()).getToken(key()),
    ).toMatchObject({ grantUuid });
    expect(
        calls
            .filter((call) => call.auth?.startsWith('Bearer ') && !call.saved)
            .map((call) => call.url),
    ).toEqual([
        `/lightdash/api/v2/user/agent-connections/${grantUuid}/status`,
        '/lightdash/api/v1/user',
    ]);
});
it('saves a slug-selected project without Read and never reads the project for proof', async () => {
    await run({
        projects: ['development'],
        capabilities: AgentCapability.Query,
    });
    expect(process.exitCode).toBe(0);
    expect(
        (await store().readSlot(key()))?.lastReported.approvedProjects[0]
            .projectUuid,
    ).toBe(projectUuid);
    expect(calls.some((call) => call.url.includes('/projects/'))).toBe(false);
});
it.each([undefined, null, 0, -1, 1.5, '600', 2147483648])(
    'refuses unbounded initial refresh expiry %s without saving',
    async (value) => {
        token.refresh_expires_in = value;
        await run();
        await refused();
        expect(vi.mocked(console.error).mock.calls[2]).toEqual([
            'The server returned a token that is not bound to this agent connection. No credential was saved.',
        ]);
    },
);
it.each(['state', 'iss', 'code', 'grant_uuid', 'error_description'])(
    'refuses duplicate callback %s before exchange',
    async (field) => {
        callbackChange = (url) => {
            url.searchParams.append(field, 'extra');
            if (field === 'error_description')
                url.searchParams.append(field, 'second');
        };
        await run();
        expect(callbackStatus).toBe(400);
        expect(used).toBe(false);
        await refused();
    },
);
it.each([
    ['success', 'iss'],
    ['denial', 'iss'],
    ['success', 'state'],
    ['denial', 'state'],
])('requires %s callback binding %s', async (kind, field) => {
    callbackChange = (url) => {
        if (kind === 'denial') {
            url.searchParams.delete('code');
            url.searchParams.set('error', 'access_denied');
        }
        url.searchParams.delete(field);
    };
    await run();
    expect(callbackStatus).toBe(400);
    await refused();
});
it.each(['state', 'iss'])('refuses a wrong callback %s', async (field) => {
    callbackChange = (url) => url.searchParams.set(field, 'wrong');
    await run();
    expect(callbackStatus).toBe(400);
    await refused();
});
it.each([
    'agent_connections_unavailable',
    'agent_identity_disabled',
    'access_denied',
])(
    'accepts a bound denial %s with fixed output and no token request',
    async (error) => {
        callbackChange = (url) => {
            url.searchParams.delete('code');
            url.searchParams.delete('grant_uuid');
            url.searchParams.set('error', error);
            url.searchParams.set('error_description', privateAccess);
        };
        await run();
        expect(callbackStatus).toBe(200);
        expect(used).toBe(false);
        await refused();
        const messages: Record<string, string> = {
            agent_connections_unavailable:
                'Agent connections are not available on this server yet.',
            agent_identity_disabled:
                'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
            access_denied:
                'Agent connection approval was denied. No credential was saved.',
        };
        expect(vi.mocked(console.error).mock.calls).toEqual([
            [
                `Open this page to approve the agent connection:\n${instance}/api/v1/oauth/authorize?agent_request=${projectUuid}`,
            ],
            ['Waiting for browser approval and warehouse setup...'],
            [messages[error]],
            [
                'No agent connection credential was saved. Your personal CLI login is unchanged.',
            ],
            [
                `Manage warehouse agent sign-ins in the app:\n${instance}/generalSettings/myAgentConnections`,
            ],
        ]);
    },
);
it.each(['code_verifier', 'resource', 'client_id', 'redirect_uri', 'code'])(
    'handles issuer refusal of broken %s binding without saving',
    async (field) => {
        bindingChange = (form) => form.set(field, 'wrong');
        await run();
        await refused();
    },
);
it.each(['issuer', 'resource'])(
    'refuses a token with wrong %s',
    async (field) => {
        token[field] = 'https://other.example';
        await run();
        await refused();
    },
);
it.each(['issuer', 'resource'])(
    'refuses an approval response with wrong %s',
    async (field) => {
        approval[field] = 'https://other.example';
        await run();
        expect(used).toBe(false);
        await refused();
    },
);
it.each(['missing', 'mismatch', 'malformed'])(
    'refuses %s connection identity',
    async (kind) => {
        token.agent_connection =
            kind === 'missing'
                ? undefined
                : {
                      grant_uuid:
                          kind === 'malformed' ? 'invalid' : secondProject,
                  };
        if (kind === 'missing')
            callbackChange = (url) => url.searchParams.delete('grant_uuid');
        await run();
        await refused();
    },
);
it.each(['missing', 'wrong-id', 'wrong-slug'])(
    'refuses %s token project proof for a slug selection',
    async (kind) => {
        const projects = [
            {
                project_uuid: kind === 'wrong-id' ? secondProject : projectUuid,
                slug: kind === 'wrong-slug' ? 'other' : 'development',
            },
        ];
        token.agent_connection = {
            grant_uuid: grantUuid,
            approved_projects: kind === 'missing' ? undefined : projects,
        };
        await run({ projects: ['development'] });
        await refused();
    },
);
it('refuses a project outside the requested UUID set', async () => {
    await run({ projects: [secondProject] });
    await refused();
});
it('refuses approval actions wider than requested', async () => {
    approved[0].approvedCapabilities.push(AgentCapability.ReadDiscover);
    await run({ capabilities: AgentCapability.Query });
    await refused();
});
it('honours different actions per project and refuses cross-project effective widening', async () => {
    approved.push({
        projectUuid: secondProject,
        slug: 'second',
        approvedCapabilities: [AgentCapability.DeployUpload],
    });
    status.effectiveProjects = projectStatus(approved).effectiveProjects.map(
        (project) => ({
            ...project,
            capabilities: [
                {
                    capability: AgentCapability.Query,
                    allowed: true,
                    reason: null,
                },
            ],
        }),
    );
    await run();
    await refused();
});
it('saves the constraints-v2 per-project map without flattening actions', async () => {
    approved.push({
        projectUuid: secondProject,
        slug: 'second',
        approvedCapabilities: [AgentCapability.DeployUpload],
    });
    await run();
    expect(process.exitCode).toBe(0);
    expect(
        (await store().readSlot(key()))?.lastReported.approvedProjects,
    ).toEqual(projectStatus(approved).approvedProjects);
});
it.each(['revoked', 'expired', 'wrong-person', 'wrong-status-id'])(
    'refuses %s at exchange verification',
    async (kind) => {
        if (kind === 'wrong-person') userUuid = secondProject;
        else if (kind === 'wrong-status-id') status.grantUuid = secondProject;
        else status.status = kind;
        await run();
        await refused();
    },
);
it.each([
    'revoked',
    'expired',
    'wrong-person',
    'wrong-status-id',
    'wrong-client',
])(
    'refuses %s at first use and preserves the saved credential',
    async (kind) => {
        await run();
        const before = await fs.readFile(store().filePath, 'utf8');
        if (kind === 'wrong-person') userUuid = secondProject;
        else if (kind === 'wrong-status-id') status.grantUuid = secondProject;
        else if (kind === 'wrong-client') status.clientId = 'other-client';
        else status.status = kind;
        await expect(
            new providerModule.AgentTokenProvider(store()).getToken(key()),
        ).rejects.toThrow();
        expect(await fs.readFile(store().filePath, 'utf8')).toBe(before);
    },
);
it('clips both token deadlines to the absolute connection expiry', async () => {
    token.expires_in = 7200;
    token.refresh_expires_in = 7200;
    await run();
    const saved = await store().readSlot(key());
    expect(saved?.tokens.accessTokenExpiresAt).toBe(status.expiresAt);
    expect(saved?.tokens.refreshTokenExpiresAt).toBe(status.expiresAt);
});
it('rejects a replay through the real exchange path', async () => {
    await run();
    const before = await fs.readFile(store().filePath, 'utf8');
    const form = new URLSearchParams(
        calls.find((call) => call.url.endsWith('/token'))!.body,
    );
    const { exchangeInitialConnectionToken } = await import('./initialToken');
    await expect(
        exchangeInitialConnectionToken({
            instanceUrl: instance,
            code,
            verifier: form.get('code_verifier')!,
            redirectUri: String(request.redirectUri),
            grantUuid,
            signal: AbortSignal.timeout(2000),
            proxyAuthorization: null,
        }),
    ).rejects.toThrow();
    expect(await fs.readFile(store().filePath, 'utf8')).toBe(before);
});
it('requires a new connection for replacement', async () => {
    await run();
    const before = await fs.readFile(store().filePath, 'utf8');
    used = false;
    await run();
    expect(process.exitCode).toBe(1);
    expect(await fs.readFile(store().filePath, 'utf8')).toBe(before);
});
it('accepts a replacement with a new connection id', async () => {
    await run();
    grantUuid = randomUUID();
    status.grantUuid = grantUuid;
    code = 'replacement-code';
    token.access_token = 'replacement-access';
    token.refresh_token = 'replacement-refresh';
    used = false;
    await run();
    expect(process.exitCode).toBe(0);
    expect((await store().readSlot(key()))?.grantUuid).toBe(grantUuid);
});
it('drops unknown token and project-proof fields without persisting them', async () => {
    token.future_field = 'not-persisted';
    token.agent_connection = {
        grant_uuid: grantUuid,
        future_field: 'not-persisted',
        approved_projects: [
            {
                project_uuid: projectUuid,
                slug: 'development',
                future_field: 'not-persisted',
            },
        ],
    };
    await run({ projects: ['development'] });
    expect(process.exitCode).toBe(0);
    const saved = (await store().readSlot(key()))!;
    const persisted = yaml.load(
        await fs.readFile(store().filePath, 'utf8'),
    ) as {
        instances: Record<
            string,
            {
                organizations: Record<
                    string,
                    {
                        people: Record<
                            string,
                            { slots: Record<string, unknown> }
                        >;
                    }
                >;
            }
        >;
    };
    expect(
        persisted.instances[instance].organizations[organizationUuid].people[
            personUuid
        ].slots.default,
    ).toEqual(saved);
    expect(Object.keys(saved).sort()).toEqual(
        [
            'instanceUrl',
            'organizationUuid',
            'personUuid',
            'name',
            'clientId',
            'resource',
            'grantUuid',
            'grantRevision',
            'approvedAt',
            'grantExpiresAt',
            'tokens',
            'lastReported',
            'refreshState',
            'revokeState',
        ].sort(),
    );
    expect(Object.keys(saved.tokens).sort()).toEqual(
        [
            'accessToken',
            'accessTokenExpiresAt',
            'refreshToken',
            'refreshTokenExpiresAt',
            'scopes',
            'generation',
            'lastRefreshAttemptUuid',
        ].sort(),
    );
    expect(saved.lastReported.approvedProjects).toEqual(
        projectStatus(approved).approvedProjects,
    );
    used = false;
    const form = new URLSearchParams(
        calls.find((call) => call.url.endsWith('/token'))!.body,
    );
    const { exchangeInitialConnectionToken } = await import('./initialToken');
    const parsed = await exchangeInitialConnectionToken({
        instanceUrl: instance,
        code,
        verifier: form.get('code_verifier')!,
        redirectUri: String(request.redirectUri),
        grantUuid,
        signal: AbortSignal.timeout(2000),
        proxyAuthorization: null,
    });
    expect(Object.keys(parsed).sort()).toEqual([
        'approvedProjectProof',
        'grantRevision',
        'grantUuid',
        'tokens',
    ]);
    expect(parsed.approvedProjectProof).toEqual([
        { projectUuid, slug: 'development' },
    ]);
});
it('refuses malformed JSON without saving or echoing it', async () => {
    responseText = `{"access_token":"${privateAccess}"`;
    await run();
    await refused();
});
it('demonstrates the current last-value JSON duplicate behaviour as a decision, not a strict parser guarantee', async () => {
    responseText = JSON.stringify({
        ...token,
        agent_connection: { grant_uuid: grantUuid },
    }).replace('"expires_in":300', '"expires_in":0,"expires_in":300');
    await run();
    expect(process.exitCode).toBe(0);
});
it('keeps opaque fixture credentials disjoint from decoded and printed approval URL values', async () => {
    await run();
    const output = vi.mocked(console.error).mock.calls.flat().join('\n');
    const url = new URL(
        output
            .split('Open this page to approve the agent connection:\n')[1]
            .split('\n')[0],
    );
    const values = [
        url.href,
        decodeURIComponent(url.href),
        ...url.searchParams.values(),
    ];
    for (const credential of [code, privateAccess, privateRefresh])
        for (const value of values)
            expect(
                credential.includes(value) || value.includes(credential),
            ).toBe(false);
});
it('refreshes the same connection with bounded expiry and real journal/store handling', async () => {
    await run();
    token.access_token = 'rotated-access';
    token.refresh_token = 'rotated-refresh';
    token.refresh_expires_in = 120;
    const refreshed = await new providerModule.AgentTokenProvider(
        store(),
    ).getToken(key(), 1);
    expect(refreshed.grantUuid).toBe(grantUuid);
    expect(refreshed.tokens.generation).toBe(2);
    const refreshRequest = calls
        .filter((call) => call.url.endsWith('/token'))
        .at(-1)!;
    expect(
        Object.fromEntries(new URLSearchParams(refreshRequest.body)),
    ).toEqual({
        grant_type: 'refresh_token',
        client_id: 'lightdash-cli',
        refresh_token: privateRefresh,
        resource: instance,
        scope: 'read write',
    });

    expect(
        Date.parse(refreshed.tokens.refreshTokenExpiresAt!),
    ).toBeLessThanOrEqual(Date.now() + 120000);
    expect(await fs.readdir(path.dirname(config.configFilePath))).toEqual(
        expect.arrayContaining(['config.yaml', 'agent-connections.yaml']),
    );
    expect(
        (await fs.readdir(path.dirname(config.configFilePath))).some((file) =>
            file.endsWith('.journal'),
        ),
    ).toBe(false);
});
it.each([undefined, null, 0, -1, 1.5, '120', 2147483648])(
    'refuses unbounded refresh response expiry %s without saving replacement credentials',
    async (value) => {
        await run();
        token.access_token = 'rotated-access';
        token.refresh_token = 'rotated-refresh';
        token.refresh_expires_in = value;
        await expect(
            new providerModule.AgentTokenProvider(store()).getToken(key(), 1),
        ).rejects.toThrow('Reconnect');
        const saved = await store().readSlot(key());
        expect(saved?.tokens.accessToken).toBe(privateAccess);
        expect(saved?.tokens.refreshToken).toBe(privateRefresh);
        expect(saved?.refreshState.kind).toBe('reconnect_required');
        const journalFiles = (
            await fs.readdir(path.dirname(store().filePath))
        ).filter((file) => file.endsWith('.journal'));
        expect(journalFiles).toHaveLength(1);
        const journalBytes = await fs.readFile(
            path.join(path.dirname(store().filePath), journalFiles[0]),
            'utf8',
        );
        const journal: unknown = JSON.parse(journalBytes);
        expect(journal).toEqual({
            grantUuid,
            generation: 1,
            attemptUuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        const beforeSecondUse = calls.length;
        await expect(
            new providerModule.AgentTokenProvider(store()).getToken(key()),
        ).rejects.toThrow(
            'Reconnect before using this agent connection. Its refresh outcome is uncertain.',
        );
        expect(calls).toHaveLength(beforeSecondUse);
        expect(
            await fs.readFile(
                path.join(path.dirname(store().filePath), journalFiles[0]),
                'utf8',
            ),
        ).toBe(journalBytes);
        expect((await store().readSlot(key()))?.tokens).toEqual(saved?.tokens);
    },
);
it('requires bounded refresh responses even for a legacy slot with no saved refresh deadline', async () => {
    await run();
    const saved = (await store().readSlot(key()))!;
    await store().saveSlot({
        ...saved,
        tokens: { ...saved.tokens, refreshTokenExpiresAt: null },
    });
    token.access_token = 'rotated-access';
    token.refresh_token = 'rotated-refresh';
    delete token.refresh_expires_in;
    await expect(
        new providerModule.AgentTokenProvider(store()).getToken(key(), 1),
    ).rejects.toThrow('Reconnect');
    expect((await store().readSlot(key()))?.tokens.accessToken).toBe(
        privateAccess,
    );
});

it('ignores repeated unknown callback fields while preserving known bindings', async () => {
    callbackChange = (url) => {
        url.searchParams.append('future', 'first');
        url.searchParams.append('future', 'second');
    };
    await run();
    expect(process.exitCode).toBe(0);
    expect(callbackStatus).toBe(200);
});
it('accepts UUID selection without slug proof metadata', async () => {
    token.agent_connection = { grant_uuid: grantUuid };
    await run({ projects: [projectUuid] });
    expect(process.exitCode).toBe(0);
    expect(calls.some((call) => call.url.includes('/projects/'))).toBe(false);
});
it('refuses mismatching token project IDs even for an all-project request', async () => {
    token.agent_connection = {
        grant_uuid: grantUuid,
        approved_projects: [{ project_uuid: secondProject, slug: null }],
    };
    await run();
    await refused();
});
it('handles a connection revoked before exchange without saving or trying proof calls', async () => {
    revokedAtExchange = true;
    await run();
    await refused();
    expect(calls.some((call) => call.url.endsWith('/status'))).toBe(false);
});
it('preserves a frozen approval while effective permissions shrink', async () => {
    await run();
    status.effectiveProjects = [
        {
            projectUuid,
            capabilities: [
                {
                    capability: AgentCapability.Query,
                    allowed: false,
                    reason: 'person_permission',
                },
            ],
        },
    ];
    const result = await new providerModule.AgentTokenProvider(
        store(),
    ).getToken(key());
    expect(
        result.lastReported.approvedProjects[0].approvedCapabilities,
    ).toEqual([AgentCapability.Query]);
    expect(
        result.lastReported.effectiveProjects[0].capabilities[0].allowed,
    ).toBe(false);
});

it('refuses a UUID selector matched only by another project slug without saving', async () => {
    approved[0].slug = secondProject;
    await run({ projects: [secondProject] });
    await refused();
});
it('accepts a project selected by its UUID when its slug equals that same UUID', async () => {
    approved[0].slug = projectUuid;
    await run({ projects: [projectUuid] });
    expect(process.exitCode).toBe(0);
    expect(
        (await store().readSlot(key()))?.lastReported.approvedProjects[0]
            .projectUuid,
    ).toBe(projectUuid);
});
it('refuses duplicate slugs with two distinct matching status IDs', async () => {
    approved.push({
        projectUuid: secondProject,
        slug: 'development',
        approvedCapabilities: [AgentCapability.Query],
    });
    await run({ projects: [projectUuid, secondProject] });
    await refused();
    expect(used).toBe(true);
});
it.each([false, true])(
    'checks duplicate project IDs directly at initial exchange: duplicate=%s',
    async (duplicate) => {
        const verifier = 'fixture-verifier';
        request = {
            clientId: 'lightdash-cli',
            redirectUri: 'http://localhost:12345/callback',
            codeChallenge: createHash('sha256')
                .update(verifier)
                .digest('base64url'),
        };
        token.agent_connection = {
            grant_uuid: grantUuid,
            approved_projects: [
                { project_uuid: projectUuid, slug: 'development' },
                {
                    project_uuid: duplicate ? projectUuid : secondProject,
                    slug: 'second',
                },
            ],
        };
        const { exchangeInitialConnectionToken } =
            await import('./initialToken');
        const exchange = exchangeInitialConnectionToken({
            instanceUrl: instance,
            code,
            verifier,
            redirectUri: String(request.redirectUri),
            grantUuid,
            signal: AbortSignal.timeout(2000),
            proxyAuthorization: null,
        });
        if (duplicate)
            await expect(exchange).rejects.toThrow(
                'Invalid approved projects.',
            );
        else
            expect((await exchange).approvedProjectProof).toEqual([
                { projectUuid, slug: 'development' },
                { projectUuid: secondProject, slug: 'second' },
            ]);
        expect(used).toBe(true);
        expect(calls.map((call) => call.url)).toEqual([
            '/lightdash/api/v1/oauth/token',
        ]);
        expect(await store().readSlot(key())).toBeNull();
        expect(await fs.readFile(config.configFilePath, 'utf8')).toBe(
            configBytes,
        );
    },
);
it('accepts a reordered approved map with distinct slugs and per-project actions', async () => {
    approved.push({
        projectUuid: secondProject,
        slug: 'second',
        approvedCapabilities: [AgentCapability.DeployUpload],
    });
    token.agent_connection = {
        grant_uuid: grantUuid,
        approved_projects: [...approved].reverse().map((project) => ({
            project_uuid: project.projectUuid,
            slug: project.slug,
        })),
    };
    await run({ projects: ['development', 'second'] });
    expect(process.exitCode).toBe(0);
    approved.reverse();
    const result = await new providerModule.AgentTokenProvider(
        store(),
    ).getToken(key());
    expect(result.lastReported.approvedProjects).toEqual(
        projectStatus(approved).approvedProjects,
    );
});
it.each(['previous', 'legacy', 'past-server'])(
    'bounds the refresh family deadline with %s evidence',
    async (kind) => {
        await run();
        const saved = (await store().readSlot(key()))!;
        const previous = new Date(Date.now() + 60000).toISOString();
        let { refreshTokenExpiresAt } = saved.tokens;
        if (kind === 'legacy') refreshTokenExpiresAt = null;
        else if (kind === 'previous') refreshTokenExpiresAt = previous;
        await store().saveSlot({
            ...saved,
            tokens: { ...saved.tokens, refreshTokenExpiresAt },
        });
        token.access_token = 'rotated-access';
        token.refresh_token = 'rotated-refresh';
        token.refresh_expires_in = 120;
        const serverTime =
            Math.floor(
                (Date.now() - (kind === 'past-server' ? 30000 : 0)) / 1000,
            ) * 1000;
        responseDate = new Date(serverTime).toUTCString();
        const result = await new providerModule.AgentTokenProvider(
            store(),
        ).getToken(key(), 1);
        expect(result.tokens.refreshTokenExpiresAt).toBe(
            kind === 'previous'
                ? previous
                : new Date(serverTime + 120000).toISOString(),
        );
        expect((await store().readSlot(key()))?.tokens).toEqual(result.tokens);
    },
);
