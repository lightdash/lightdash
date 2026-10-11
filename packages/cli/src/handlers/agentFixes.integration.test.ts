import chalk from 'chalk';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from '../agentConnections/fixtures';
import type { AgentConnectionSlot } from '../agentConnections/schema';
import type { Config } from '../config';

const boundary = vi.hoisted(() => ({ home: '', token: vi.fn() }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => boundary.home,
}));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
vi.mock('../agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = boundary.token;
    },
}));
let server: Server;
let slot: AgentConnectionSlot;
let config: Config;
let configPath: string;
let requests: {
    method: string;
    path: string;
    authorization: string | undefined;
    body: string;
}[];
const oldExit = process.exitCode;
beforeEach(async () => {
    vi.resetModules();
    for (const key of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROJECT',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
    ])
        vi.stubEnv(key, undefined);
    chalk.level = 0;
    boundary.home = await fs.mkdtemp(path.join(tmpdir(), 'cli-fix-round-'));
    configPath = path.join(boundary.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    requests = [];
    server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
            body += String(chunk);
        });
        req.on('end', () => {
            requests.push({
                method: req.method!,
                path: req.url!,
                authorization: req.headers.authorization,
                body,
            });
            const user = req.method === 'GET' && req.url === '/api/v1/user';
            const revoke =
                req.method === 'DELETE' &&
                req.url === `/api/v2/user/agent-connections/${slot.grantUuid}`;
            const content =
                req.method === 'GET' && req.url?.startsWith('/api/v2/content?');
            res.writeHead(user || revoke || content ? 200 : 500, {
                'content-type': 'application/json',
            });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: (() => {
                        if (user) {
                            return {
                                userUuid: slot.personUuid,
                                organizationUuid: slot.organizationUuid,
                            };
                        }
                        if (revoke) {
                            return {
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
                        }
                        return {};
                    })(),
                }),
            );
        });
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
        { projectUuid: 'approved', name: 'Approved', approvedCapabilities: [] },
    ];
    config = {
        user: {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
        context: {
            serverUrl: instanceUrl,
            apiKey: 'ldpat_person',
            project: 'personal',
            projectName: 'Personal',
        },
    };
    await fs.writeFile(configPath, yaml.dump(config));
    boundary.token.mockReset().mockImplementation(async () => slot);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(boundary.home, { recursive: true, force: true });
    process.exitCode = oldExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});
it.each([false, true])(
    'human revoke leaves existing config bytes unchanged (slot=%s)',
    async (exists) => {
        const { AgentConnectionStore } =
            await import('../agentConnections/store');
        const store = new AgentConnectionStore();
        slot.lastReported.approvedProjects = [];
        if (exists) await store.saveSlot(slot);
        const before = await fs.readFile(configPath, 'utf8');
        const configModule = await import('../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { agentRevokeHandler } = await import('./agentRevoke');
        await agentRevokeHandler({ name: slot.name, human: true, json: true });
        expect(get.mock.calls).toEqual([[{ readOnly: true }]]);
        expect(await fs.readFile(configPath, 'utf8')).toBe(before);
        expect(requests).toEqual(
            exists
                ? [
                      {
                          method: 'GET',
                          path: '/api/v1/user',
                          authorization: 'ApiKey ldpat_person',
                          body: '',
                      },
                      {
                          method: 'DELETE',
                          path: `/api/v2/user/agent-connections/${slot.grantUuid}`,
                          authorization: 'ApiKey ldpat_person',
                          body: '',
                      },
                  ]
                : [],
        );
        expect(process.exitCode).toBe(exists ? 0 : 1);
        if (exists) expect(await store.readSlot(slot)).toBeNull();
    },
);
it.each([false, true])(
    'named revoke never creates missing config (human=%s)',
    async (human) => {
        await fs.unlink(configPath);
        vi.stubEnv('LIGHTDASH_API_KEY', 'ldpat_env');
        vi.stubEnv('LIGHTDASH_URL', slot.instanceUrl);
        const { agentRevokeHandler } = await import('./agentRevoke');
        await agentRevokeHandler({ name: 'missing', human, json: true });
        expect(await fs.readdir(path.dirname(configPath))).toEqual([]);
        expect(requests).toEqual([]);
        expect(process.exitCode).toBe(1);
    },
);
it.each([
    'projectUuids=approved&projectUuids[]=other',
    'projectUuids[0]=other',
    'projectUuids%5B%5D=other',
    'ProjectUuids=approved',
    'projectUuids=approved&ProjectUuids=other',
    '%70rojectUuids=approved',
    'projectUuids=other&projectUuids=approved',
    'projectUuids=approved&projectUuids=other',
    'projectUuids=approved,other',
    'projectUuids=approved&future=true',
])('refuses content filter %s without sending', async (query) => {
    const { runWithAgentConnectionSelection } = await import('../credentials');
    const { lightdashRawApi } = await import('./dbt/apiClient');
    await expect(
        runWithAgentConnectionSelection(slot.name, () =>
            lightdashRawApi({
                method: 'GET',
                url: `/api/v2/content?${query}`,
                body: undefined,
            }),
        ),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
});
it.each([
    'projectUuids=approved',
    'projectUuids=approved&projectUuids=approved',
    'projectUuids=approved&contentTypes=data_app&page=1&pageSize=100',
])('sends canonical content filter %s', async (query) => {
    const { runWithAgentConnectionSelection } = await import('../credentials');
    const { lightdashRawApi } = await import('./dbt/apiClient');
    await runWithAgentConnectionSelection(slot.name, () =>
        lightdashRawApi({
            method: 'GET',
            url: `/api/v2/content?${query}`,
            body: undefined,
        }),
    );
    expect(requests).toEqual([
        {
            method: 'GET',
            path: `/api/v2/content?${query}`,
            authorization: 'Bearer private-access',
            body: '',
        },
    ]);
});
it('forwards odd ordinary filters unchanged', async () => {
    const { lightdashRawApi } = await import('./dbt/apiClient');
    const url =
        '/api/v2/content?projectUuids[]=other&ProjectUuids=personal&future=true';
    await lightdashRawApi({ method: 'GET', url, body: undefined });
    expect(requests).toEqual([
        {
            method: 'GET',
            path: url,
            authorization: 'ApiKey ldpat_person',
            body: '',
        },
    ]);
    expect(boundary.token).not.toHaveBeenCalled();
});
it.each([0, 1, 2])('reports only the %s approved projects', async (count) => {
    slot.lastReported.approvedProjects = Array.from(
        { length: count },
        (_, index) => ({
            projectUuid: `approved-${index}`,
            name: `Approved ${index}`,
            approvedCapabilities: [],
        }),
    );
    vi.stubEnv('LIGHTDASH_PROJECT', 'environment-personal');
    const before = await fs.readFile(configPath, 'utf8');
    const { runWithAgentConnectionSelection } = await import('../credentials');
    const { getProjectHandler } = await import('./getProject');
    await expect(
        runWithAgentConnectionSelection(slot.name, () =>
            getProjectHandler({ verbose: true }),
        ),
    ).resolves.toBeUndefined();
    const output = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(output).not.toMatch(/personal|Personal|set-project/);
    if (count === 1)
        expect(output).toContain(
            '\nCurrent project:\n\n  Name: Approved 0\n  UUID: approved-0\n',
        );
    else
        expect(output).toContain(
            `This connection is approved for ${count} projects. Pass --project on the command.`,
        );
    for (let index = 0; count > 1 && index < count; index += 1)
        expect(output).toContain(`Approved ${index} (approved-${index})`);
    expect(requests).toEqual([]);
    expect(boundary.token).toHaveBeenCalledOnce();
    expect(await fs.readFile(configPath, 'utf8')).toBe(before);
    expect(process.exitCode).toBeUndefined();
});
