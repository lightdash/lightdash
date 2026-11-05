import chalk from 'chalk';
import { promises as fs, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from '../../agentConnections/fixtures';
import {
    OrdinaryServer,
    personalConfig,
    request,
    saveConfig,
} from './harness.mocks';

const location = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => location.home,
}));
vi.mock('../../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));
let server: OrdinaryServer;
let file: string;
let before: string;
let config: ReturnType<typeof personalConfig>;
const previousExit = process.exitCode;
beforeEach(async () => {
    vi.resetModules();
    for (const key of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_PROJECT',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
    ])
        vi.stubEnv(key, undefined);
    vi.stubEnv('CI', 'true');
    chalk.level = 0;
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-deploy-'));
    server = new OrdinaryServer();
    await server.start();
    config = personalConfig(server.url);
    file = await saveConfig(location.home, config);
    before = await fs.readFile(file, 'utf8');
    await fs.writeFile(
        path.join(location.home, 'lightdash.config.yml'),
        'spotlight:\n  default_visibility: show\n',
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Unexpected exit');
    });
    process.exitCode = undefined;
});
afterEach(async () => {
    vi.useRealTimers();
    vi.useRealTimers();
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

it.each(['bare', 'status', 'revoke', 'human'])(
    'pins lifecycle separation with real config and store: %s',
    async (mode) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
        const slot = {
            ...slotFixture(),
            instanceUrl: server.url,
            resource: server.url,
        };
        config.user = {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
            ...(mode === 'bare' ? { anonymousUuid: 'fixed' } : {}),
        };
        config.context!.proxyAuthorization = 'proxy-fixture';
        await saveConfig(location.home, config);
        before = await fs.readFile(file, 'utf8');
        const { AgentConnectionStore } =
            await import('../../agentConnections/store');
        const store = new AgentConnectionStore();
        await store.saveSlot(slot);
        const storeBefore = await fs.readFile(store.filePath, 'utf8');
        const listing = await fs.readdir(path.dirname(file));
        const readSlot = vi.spyOn(AgentConnectionStore.prototype, 'readSlot');
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { agentStatusHandler } = await import('../agentStatus');
        const { agentRevokeHandler } = await import('../agentRevoke');
        const base = `/api/v2/user/agent-connections/${slot.grantUuid}`;
        const status = {
            grantUuid: slot.grantUuid,
            name: slot.name,
            clientId: slot.clientId,
            approvedAt: slot.approvedAt,
            expiresAt: slot.grantExpiresAt,
            limitsStatus: 'ok',
            approvedProjects: [],
            effectiveProjects: [],
            status: mode === 'status' ? 'active' : 'revoked',
            revokedAt: mode === 'status' ? null : new Date().toISOString(),
            lastUsedAt: null,
        };
        const bearer = (method: string, url: string) => ({
            ...request(method, url),
            authorization: 'Bearer private-access',
        });
        const trace = (() => {
            if (mode === 'bare') {
                return [
                    request(
                        'GET',
                        `/api/v2/projects/${config.context!.project}/ai-access/me`,
                    ),
                ];
            }
            if (mode === 'status') {
                return [bearer('GET', `${base}/status`)];
            }
            if (mode === 'human') {
                return [
                    request('GET', '/api/v1/user'),
                    request('DELETE', base),
                ];
            }
            return [bearer('DELETE', base)];
        })();
        server.replies.push(
            ...trace.map((entry) => ({
                ...entry,
                results: (() => {
                    if (mode === 'bare') {
                        return {
                            refusal: null,
                            identity: 'connected_person',
                            expiresAt: null,
                        };
                    }
                    if (entry.path === '/api/v1/user') {
                        return {
                            userUuid: slot.personUuid,
                            organizationUuid: slot.organizationUuid,
                        };
                    }
                    return status;
                })(),
            })),
        );
        let pendingBeforeDelete = false;
        server.onRequest = () => {
            if (server.requests.at(-1)?.method === 'DELETE')
                pendingBeforeDelete = readFileSync(
                    store.filePath,
                    'utf8',
                ).includes('kind: unconfirmed');
        };
        if (mode === 'bare' || mode === 'status')
            await agentStatusHandler({
                verbose: false,
                ...(mode === 'status' ? { name: slot.name, json: true } : {}),
            });
        else
            await agentRevokeHandler({
                name: slot.name,
                json: true,
                human: mode === 'human',
            });
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual(
            (() => {
                if (mode === 'bare') {
                    return [[], []];
                }
                if (mode === 'human') {
                    return [[{ readOnly: true }]];
                }
                return [[{ readOnly: true }], [{ readOnly: true }]];
            })(),
        );
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(listing);
        expect(
            server.headers.map((headers) => ({
                proxy: headers['proxy-authorization'],
                cookie: headers.cookie,
            })),
        ).toEqual(
            trace.map(() => ({
                proxy: mode === 'bare' ? undefined : 'proxy-fixture',
                cookie: undefined,
            })),
        );
        if (mode === 'bare') {
            expect(readSlot).not.toHaveBeenCalled();
            expect(await fs.readFile(store.filePath, 'utf8')).toBe(storeBefore);
            expect(vi.mocked(console.error).mock.calls).toEqual([
                ['Agent connected'],
            ]);
            expect(console.log).not.toHaveBeenCalled();
            expect(process.exitCode).toBeUndefined();
        } else if (mode === 'status') {
            const expected = {
                version: 1,
                slot: slot.name,
                instanceUrl: server.url,
                personUuid: slot.personUuid,
                organizationUuid: slot.organizationUuid,
                grantUuid: slot.grantUuid,
                clientId: slot.clientId,
                connectionState: 'active',
                connectionValid: true,
                serverState: 'active',
                source: 'server',
                checkedAt: new Date().toISOString(),
                lastReportedAt: new Date().toISOString(),
                approvedAt: slot.approvedAt,
                grantExpiresAt: slot.grantExpiresAt,
                lastUsedAt: null,
                limitsStatus: 'ok',
                approvedProjects: [],
                effectiveProjects: [],
                warehouse: { state: 'unknown', projects: [] },
                revokeState: { kind: 'none' },
                settingsUrl: `${server.url}/generalSettings/myAgentConnections`,
                error: null,
            };
            expect(vi.mocked(console.log).mock.calls).toEqual([
                [JSON.stringify(expected)],
            ]);
            expect(console.error).not.toHaveBeenCalled();
            expect((await store.readSlot(slot))?.lastReported.status).toBe(
                'active',
            );
            expect(process.exitCode).toBe(1);
        } else {
            expect(pendingBeforeDelete).toBe(true);
            expect(await store.readSlot(slot)).toBeNull();
            expect(vi.mocked(console.log).mock.calls).toEqual([
                [
                    JSON.stringify({
                        version: 1,
                        slot: slot.name,
                        grantUuid: slot.grantUuid,
                        confirmed: true,
                        localRemoved: true,
                        settingsUrl: `${server.url}/generalSettings/myAgentConnections`,
                        error: null,
                    }),
                ],
            ]);
            expect(console.error).not.toHaveBeenCalled();
            expect(process.exitCode).toBe(0);
        }
        expect(process.exit).not.toHaveBeenCalled();
    },
);
