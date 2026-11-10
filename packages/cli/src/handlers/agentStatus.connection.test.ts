import { AgentCapability } from '@lightdash/common';
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
import { agentProjectUuid, connectedAgentAccess } from './agentAccess.mock';
import { agentStatusHandler } from './agentStatus';

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
let payload: Record<string, unknown>;
let statusCode: number;
let warehouse: unknown;
let refreshOnce: boolean;
let warehouseCode: number;
let warehouseDelay: number;
let activeWarehouse: number;
let maxActiveWarehouse: number;
let warehouseByProject: Map<string, unknown>;
let requests: { url: string; auth: string | undefined }[];
const originalExitCode = process.exitCode;
const reasonMessages = {
    invalid_grant: 'Connection limits are invalid.',
    not_supported: 'This action is not available to agent connections.',
    revoked: 'This connection was revoked.',
    expired: 'This connection expired.',
    agent_identity_disabled: 'Agent identity is disabled.',
    project_access: 'You no longer have access to this project.',
    person_permission: 'Your role does not allow this action.',
    agent_policy:
        "Your organisation's agent permissions do not allow this action.",
};
const response = () => ({
    grantUuid: slot.grantUuid,
    name: slot.name,
    clientId: slot.clientId,
    approvedAt: slot.approvedAt,
    expiresAt: slot.grantExpiresAt,
    ...slot.lastReported,
});
const output = () =>
    JSON.parse(String(vi.mocked(console.log).mock.calls[0][0]));
const textOutput = () => vi.mocked(console.error).mock.calls.flat().join('\n');

beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', '');
    delete process.env.LIGHTDASH_AGENT_CONNECTION;
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-human-secret');
    process.exitCode = undefined;
    directory = await fs.mkdtemp(path.join(tmpdir(), 'connection-status-'));
    location.configFilePath = path.join(directory, 'config.yaml');
    requests = [];
    statusCode = 200;
    refreshOnce = false;
    warehouse = connectedAgentAccess;
    warehouseCode = 200;
    warehouseDelay = 0;
    activeWarehouse = 0;
    maxActiveWarehouse = 0;
    warehouseByProject = new Map();
    server = createServer((req, res) => {
        requests.push({ url: req.url!, auth: req.headers.authorization });
        const isWarehouse = req.url?.endsWith('/ai-access/me');
        if (
            refreshOnce &&
            req.url?.endsWith('/status') &&
            req.headers.authorization === 'Bearer private-access'
        ) {
            res.writeHead(401);
            res.end('{}');
            return;
        }
        if (refreshOnce && req.url === '/api/v1/oauth/token') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
                JSON.stringify({
                    access_token: 'rotated-access',
                    refresh_token: 'rotated-refresh',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_expires_in: 3600,
                    scope: 'read write',
                }),
            );
            return;
        }
        if (refreshOnce && req.url === '/api/v1/user') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        userUuid: slot.personUuid,
                        organizationUuid: slot.organizationUuid,
                    },
                }),
            );
            return;
        }
        const send = () => {
            res.writeHead(isWarehouse ? warehouseCode : statusCode, {
                'content-type': 'application/json',
            });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: isWarehouse
                        ? (warehouseByProject.get(req.url!.split('/')[4]) ??
                          warehouse)
                        : payload,
                }),
            );
            if (isWarehouse) activeWarehouse -= 1;
        };
        if (isWarehouse) {
            activeWarehouse += 1;
            maxActiveWarehouse = Math.max(maxActiveWarehouse, activeWarehouse);
        }
        if (isWarehouse && warehouseDelay > 0) setTimeout(send, warehouseDelay);
        else send();
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing server');
    const instanceUrl = `http://127.0.0.1:${address.port}`;
    slot = { ...slotFixture(), instanceUrl, resource: instanceUrl };
    slot.lastReported.approvedProjects = [
        {
            projectUuid: agentProjectUuid,
            name: 'Development',
            approvedCapabilities: [
                AgentCapability.ReadDiscover,
                AgentCapability.Query,
            ],
        },
    ];
    slot.lastReported.effectiveProjects = [
        {
            projectUuid: agentProjectUuid,
            capabilities: [
                AgentCapability.ReadDiscover,
                AgentCapability.Query,
            ].map((capability) => ({
                capability,
                allowed: true,
                reason: null,
            })),
        },
    ];
    store = new AgentConnectionStore();
    await store.saveSlot(slot);
    payload = response();
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
    'reports live status with its own token without a selected project (json=%s)',
    async (json) => {
        await agentStatusHandler({ name: slot.name, json, verbose: false });
        expect(process.exitCode ?? 0).toBe(0);
        expect(requests.map((r) => r.auth)).toEqual([
            'Bearer private-access',
            'Bearer private-access',
        ]);
        expect(requests.map((r) => r.url)).toEqual([
            `/api/v2/user/agent-connections/${slot.grantUuid}/status`,
            `/api/v2/projects/${agentProjectUuid}/ai-access/me`,
        ]);
        const saved = await store.readSlot(slot);
        expect(saved?.lastReported.status).toBe('active');
        if (json) {
            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.error).not.toHaveBeenCalled();
            expect(output()).toMatchObject({
                version: 1,
                connectionState: 'active',
                source: 'server',
                serverState: 'active',
                connectionValid: true,
                lastUsedAt: null,
                warehouse: { state: 'ready' },
                error: null,
            });
            expect(output().checkedAt).not.toBeNull();
            expect(JSON.stringify(output())).not.toMatch(
                /private-access|private-refresh|human-secret|\\u001b/,
            );
        } else {
            expect(textOutput()).toContain(
                'Connection: default | Active | CLI',
            );
            expect(textOutput()).toContain('Read and discover');
            expect(textOutput()).toContain(
                'Allowed actions can still have resource, destination or recurring-refresh restrictions.',
            );
            expect(textOutput()).toContain(
                'Default warehouse connection checked; review additional connections in the app.',
            );
        }
    },
);

describe.each([false, true])('local states (json=%s)', (json) => {
    it.each([
        'missing',
        'expired',
        'revoked',
        'invalid',
        'mismatched',
        'reconnect_required',
        'unreachable',
        'rejected',
    ] as const)('renders %s with exit 1', async (state) => {
        if (state === 'missing') await store.removeSlot(slot);
        if (state === 'expired') {
            slot.grantExpiresAt = new Date(Date.now() - 1000).toISOString();
            slot.tokens.accessTokenExpiresAt = slot.grantExpiresAt;
            await store.saveSlot(slot);
        }
        if (state === 'revoked') {
            slot.lastReported.status = 'revoked';
            await store.saveSlot(slot);
        }
        if (state === 'invalid')
            await fs.writeFile(store.filePath, 'invalid yaml: [');
        if (state === 'mismatched')
            vi.mocked(getConfig).mockResolvedValue({
                context: {
                    serverUrl: slot.instanceUrl,
                    apiKey: 'stored-human-secret',
                },
            });
        if (state === 'reconnect_required') {
            slot.refreshState = {
                kind: 'reconnect_required',
                since: new Date().toISOString(),
            };
            await store.saveSlot(slot);
        }
        if (state === 'unreachable')
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        if (state === 'rejected') statusCode = 403;
        await agentStatusHandler({ name: slot.name, json, verbose: false });
        expect(process.exitCode).toBe(1);
        if (json)
            expect(output()).toMatchObject({
                connectionState: state,
                source: 'local',
                serverState: null,
                checkedAt: null,
                warehouse: { state: 'unknown' },
            });
        else {
            expect(textOutput()).not.toBe('');
            if (state === 'missing')
                expect(textOutput()).toContain(
                    'Personal CLI login: available (not used). Warehouse status: unknown (not checked).',
                );
        }
        expect(requests.every((r) => r.auth === 'Bearer private-access')).toBe(
            true,
        );
    });
});

it.each(Object.entries(reasonMessages))(
    'maps the %s restriction in text and JSON',
    async (reason, message) => {
        payload.effectiveProjects = [
            {
                projectUuid: agentProjectUuid,
                capabilities: [
                    AgentCapability.ReadDiscover,
                    AgentCapability.Query,
                ].map((capability) => ({ capability, allowed: false, reason })),
            },
        ];
        await agentStatusHandler({ name: slot.name, verbose: false });
        expect(textOutput()).toContain(message);
        expect(process.exitCode).toBe(1);
        await agentStatusHandler({
            name: slot.name,
            json: true,
            verbose: false,
        });
        expect(output().effectiveProjects[0].capabilities[0]).toMatchObject({
            reason,
            allowed: false,
        });
        expect(requests.every((r) => !r.url.includes('ai-access'))).toBe(true);
    },
);

it('saves invalid server limits without inventing approval', async () => {
    payload.limitsStatus = 'invalid';
    payload.approvedProjects = [
        { projectUuid: agentProjectUuid, name: null, approvedCapabilities: [] },
    ];
    payload.effectiveProjects = [
        {
            projectUuid: agentProjectUuid,
            capabilities: Object.values(AgentCapability).map((capability) => ({
                capability,
                allowed: false,
                reason: 'invalid_grant',
            })),
        },
    ];
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionState: 'invalid',
        source: 'server',
        limitsStatus: 'invalid',
    });
    expect(output().approvedProjects[0].approvedCapabilities).toEqual([]);
    expect((await store.readSlot(slot))?.lastReported.limitsStatus).toBe(
        'invalid',
    );
    expect(process.exitCode).toBe(1);
});
it.each(['expired', 'revoked'] as const)(
    'reports server-confirmed %s',
    async (status) => {
        payload.status = status;
        payload.revokedAt =
            status === 'revoked' ? new Date().toISOString() : null;
        await agentStatusHandler({
            name: slot.name,
            json: true,
            verbose: false,
        });
        expect(output()).toMatchObject({
            connectionState: status,
            source: 'server',
            serverState: status,
        });
        expect(process.exitCode).toBe(1);
    },
);
it('shows unavailable project names and cached timestamps without claiming verification', async () => {
    slot.lastReported.approvedProjects[0].name = null;
    await store.saveSlot(slot);
    statusCode = 403;
    await agentStatusHandler({ name: slot.name, verbose: false });
    expect(textOutput()).toContain(`${agentProjectUuid} (Name unavailable)`);
    expect(textOutput()).toContain(slot.lastReported.checkedAt);
    expect(textOutput()).toContain('cached');
});
it.each([
    {
        access: { ...connectedAgentAccess, identity: 'ai_service_account' },
        state: 'ready',
    },
    {
        access: {
            ...connectedAgentAccess,
            identity: null,
            requirementSource: null,
        },
        state: 'ready',
    },
    {
        access: {
            ...connectedAgentAccess,
            refusal: {
                code: 'ai_access_refused',
                reason: 'needs_sign_in',
                action: 'sign_in',
                message: 'Sign in.',
                connectUrl: 'https://untrusted.example',
                settingsUrl: null,
            },
        },
        state: 'needs_setup',
    },
    { access: {}, state: 'unknown' },
])('maps warehouse readiness to $state', async ({ access, state }) => {
    warehouse = access;
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output().warehouse.state).toBe(state);
    expect(output().connectionValid).toBe(true);
    expect(process.exitCode ?? 0).toBe(state === 'ready' ? 0 : 1);
    expect(JSON.stringify(output())).not.toContain('untrusted.example');
});
it('reports partial readiness when a project cannot read warehouse readiness', async () => {
    const second = '00000000-0000-0000-0000-000000000002';
    payload.approvedProjects = [
        ...slot.lastReported.approvedProjects,
        {
            projectUuid: second,
            name: 'Second',
            approvedCapabilities: [AgentCapability.Query],
        },
    ];
    payload.effectiveProjects = [
        ...slot.lastReported.effectiveProjects,
        {
            projectUuid: second,
            capabilities: [
                {
                    capability: AgentCapability.Query,
                    allowed: true,
                    reason: null,
                },
            ],
        },
    ];
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output().warehouse.state).toBe('partial');
    expect(requests.filter((r) => r.url.includes('ai-access'))).toHaveLength(1);
    expect(process.exitCode).toBe(1);
});
it.each([
    {},
    { grantUuid: '00000000-0000-4000-8000-000000000009' },
    { effectiveProjects: [] },
    { name: 'other' },
])('rejects malformed or mismatched server data %j', async (change) => {
    payload = Object.keys(change).length ? { ...payload, ...change } : {};
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output().source).toBe('local');
    expect(process.exitCode).toBe(1);
    expect((await store.readSlot(slot))?.lastReported).toEqual(
        slot.lastReported,
    );
});
it('uses global selection and rejects a conflicting name before any request', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', slot.name);
    await agentStatusHandler({ json: true, verbose: false });
    expect(output().connectionState).toBe('active');
    requests = [];
    await expect(
        agentStatusHandler({ name: 'other', verbose: false }),
    ).rejects.toThrow('conflict');
    expect(requests).toEqual([]);
});
it('leaves the bare status path and credentials directory untouched', async () => {
    await fs.unlink(store.filePath);
    const read = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: slot.instanceUrl,
            apiKey: 'stored-human-secret',
            project: agentProjectUuid,
        },
    });
    await agentStatusHandler({ verbose: false });
    expect(textOutput()).toBe('Agent connected');
    expect(read).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(requests).toEqual([
        {
            url: `/api/v2/projects/${agentProjectUuid}/ai-access/me`,
            auth: 'ApiKey stored-human-secret',
        },
    ]);
});

it('refuses --json without a connection before any request or store read', async () => {
    await fs.unlink(store.filePath);
    const read = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
    requests = [];
    await expect(
        agentStatusHandler({ json: true, verbose: false }),
    ).rejects.toThrow(
        '--json is only available for an agent connection. Use it with --name <slot>.',
    );
    expect(read).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(requests).toEqual([]);
});

it('labels a different grant as mismatched without replacing the cache', async () => {
    payload.grantUuid = '44444444-4444-4444-8444-444444444444';
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionState: 'mismatched',
        source: 'local',
        checkedAt: null,
    });
    expect((await store.readSlot(slot))?.lastReported).toEqual(
        slot.lastReported,
    );
});
it('does not render or cache secrets echoed in project names', async () => {
    payload.approvedProjects = [
        {
            ...slot.lastReported.approvedProjects[0],
            name: `Leaked ${slot.tokens.accessToken}`,
        },
    ];
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(JSON.stringify(output())).not.toContain(slot.tokens.accessToken);
    expect((await store.readSlot(slot))?.lastReported).toEqual(
        slot.lastReported,
    );
    expect(process.exitCode).toBe(1);
});
it('does not invent warehouse checks when local status prevents a request', async () => {
    slot.lastReported.status = 'revoked';
    await store.saveSlot(slot);
    await agentStatusHandler({ name: slot.name, verbose: false });
    expect(textOutput()).not.toContain('Default warehouse connection checked;');
    expect(textOutput()).toContain('Warehouse sign-ins: unknown');
    expect(requests).toEqual([]);
});

it('bounds warehouse reads to four and checks only the default connection', async () => {
    const projects = Array.from({ length: 9 }, (_, index) => ({
        projectUuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name: `Project ${index}`,
        approvedCapabilities: [AgentCapability.ReadDiscover],
    }));
    payload.approvedProjects = projects;
    payload.effectiveProjects = projects.map((project) => ({
        projectUuid: project.projectUuid,
        capabilities: [
            {
                capability: AgentCapability.ReadDiscover,
                allowed: true,
                reason: null,
            },
        ],
    }));
    for (const project of projects)
        warehouseByProject.set(project.projectUuid, {
            ...connectedAgentAccess,
            projectUuid: project.projectUuid,
        });
    warehouseDelay = 20;
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(maxActiveWarehouse).toBe(4);
    expect(output().warehouse.projects).toHaveLength(9);
    expect(output().warehouse.state).toBe('ready');
    expect(
        requests.filter((request) => request.url.endsWith('/ai-access/me')),
    ).toHaveLength(9);
    expect(requests.every((request) => !request.url.includes('?'))).toBe(true);
});
it.each([403, 500])(
    'keeps connection validity separate when warehouse responds %s',
    async (code) => {
        warehouseCode = code;
        await agentStatusHandler({
            name: slot.name,
            json: true,
            verbose: false,
        });
        expect(output()).toMatchObject({
            connectionState: 'active',
            connectionValid: true,
            warehouse: { state: 'unknown' },
        });
        expect(process.exitCode).toBe(1);
        expect(
            requests.every(
                (request) => request.auth === 'Bearer private-access',
            ),
        ).toBe(true);
    },
);
it('reports a warehouse timeout as unknown', async () => {
    vi.stubEnv('LIGHTDASH_API_TIMEOUT_MS', '25');
    warehouseDelay = 60;
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionValid: true,
        warehouse: { state: 'unknown' },
    });
    expect(process.exitCode).toBe(1);
    await new Promise((resolve) => {
        setTimeout(resolve, 70);
    });
});
it('keeps zero-data approval valid without claiming warehouse readiness', async () => {
    payload.approvedProjects = [];
    payload.effectiveProjects = [];
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionState: 'active',
        connectionValid: true,
        warehouse: { state: 'unknown' },
    });
    expect(requests).toHaveLength(1);
    expect(process.exitCode).toBe(1);
});
it('saves only validated server fields and keeps the grant and human credentials private', async () => {
    payload.extraSecret = slot.tokens.refreshToken;
    payload.approvedProjects = [
        {
            ...slot.lastReported.approvedProjects[0],
            token: slot.tokens.accessToken,
        },
    ];
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(JSON.stringify(output())).not.toMatch(
        /private-access|private-refresh|human-secret/,
    );
    expect((await store.readSlot(slot))?.lastReported.approvedProjects).toEqual(
        slot.lastReported.approvedProjects,
    );
});

it('refreshes once for an explicitly safe status GET and caches the resulting generation', async () => {
    refreshOnce = true;
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionState: 'active',
        source: 'server',
        warehouse: { state: 'ready' },
    });
    expect((await store.readSlot(slot))?.tokens.generation).toBe(2);
    expect(
        requests.filter((request) => request.url === '/api/v1/oauth/token'),
    ).toHaveLength(1);
    expect(
        requests.filter((request) => request.url.endsWith('/status')),
    ).toHaveLength(3);
    expect(
        requests.filter((request) => request.auth?.includes('human')),
    ).toEqual([]);
    expect(process.exitCode).toBe(0);
});

it('does not call malformed server data invalid approved limits', async () => {
    payload = {};
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output()).toMatchObject({
        connectionState: 'invalid',
        error: 'The server returned invalid connection data. Connection status is unconfirmed.',
    });
});
it('does not inspect an existing default slot on the ordinary path', async () => {
    const before = await fs.readFile(store.filePath, 'utf8');
    const read = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: slot.instanceUrl,
            apiKey: 'stored-human-secret',
            project: agentProjectUuid,
        },
    });
    await agentStatusHandler({ verbose: false });
    expect(textOutput()).toBe('Agent connected');
    expect(read).not.toHaveBeenCalled();
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
});

it('uses the specified warehouse message when Read and discover is restricted', async () => {
    payload.effectiveProjects = [
        {
            projectUuid: agentProjectUuid,
            capabilities:
                slot.lastReported.effectiveProjects[0].capabilities.map(
                    (action) => ({
                        ...action,
                        allowed: false,
                        reason: 'agent_policy',
                    }),
                ),
        },
    ];
    await agentStatusHandler({ name: slot.name, verbose: false });
    expect(textOutput()).toContain(
        'Warehouse sign-ins: unknown (this connection cannot read warehouse readiness).',
    );
    expect(requests).toHaveLength(1);
});

it('projects cached metadata to public fields when the server cannot be reached', async () => {
    Object.assign(slot.lastReported.approvedProjects[0], {
        token: slot.tokens.accessToken,
    });
    Object.assign(slot.lastReported.effectiveProjects[0].capabilities[0], {
        token: slot.tokens.refreshToken,
    });
    Object.assign(slot.revokeState, { token: slot.tokens.accessToken });
    await store.saveSlot(slot);
    statusCode = 503;
    await agentStatusHandler({ name: slot.name, json: true, verbose: false });
    expect(output().source).toBe('local');
    expect(JSON.stringify(output())).not.toMatch(
        /private-access|private-refresh/,
    );
});

it('uses legacy text without reading the store after named JSON status on the same program', async () => {
    const command = new Command();
    registerAgentConnectionOption(command);
    command
        .command('agent')
        .command('status')
        .option('--name <slot>')
        .option('--json')
        .option('--verbose', undefined, false)
        .action(agentStatusHandler);
    await command.parseAsync(
        ['agent', 'status', '--name', slot.name, '--json'],
        { from: 'user' },
    );
    expect(output().slot).toBe(slot.name);
    vi.mocked(console.log).mockClear();
    vi.mocked(console.error).mockClear();
    requests = [];
    const read = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
    const readFile = vi.spyOn(fs, 'readFile');
    vi.mocked(getConfig).mockResolvedValue({
        context: {
            serverUrl: slot.instanceUrl,
            apiKey: 'stored-human-secret',
            project: agentProjectUuid,
        },
    });
    await command.parseAsync(['agent', 'status'], { from: 'user' });
    expect(textOutput()).toBe('Agent connected');
    expect(console.log).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(requests).toEqual([
        {
            url: `/api/v2/projects/${agentProjectUuid}/ai-access/me`,
            auth: 'ApiKey stored-human-secret',
        },
    ]);
});

it('uses a locally constructed link and strips terminal controls in project names', async () => {
    payload.approvedProjects = [
        {
            ...slot.lastReported.approvedProjects[0],
            name: 'Project\u001b[31m red\nnext\u0085line',
        },
    ];
    warehouse = {
        ...connectedAgentAccess,
        refusal: {
            reason: 'needs_sign_in',
            connectUrl: `${slot.instanceUrl}/?token=unseen marker!`,
            settingsUrl: '/?token=unseen marker!',
        },
    };
    await agentStatusHandler({ name: slot.name, json: true, verbose: true });
    const report = output();
    expect(JSON.stringify(report)).not.toContain('unseen marker!');
    expect(report.warehouse.projects[0].settingsUrl).toBe(
        `${slot.instanceUrl}/generalSettings/myAgentConnections`,
    );
    expect(report.approvedProjects[0].name).toBe('Project rednextline');
});
it('retains operation guidance for a server error envelope', async () => {
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(
            JSON.stringify({ status: 'error', error: { code: 'test_code' } }),
        );
    });
    await agentStatusHandler({ name: slot.name, json: true, verbose: true });
    expect(output().error).toContain('Connection status is unconfirmed.');
    expect(output().error).toContain('status 200');
});
