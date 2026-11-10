import { ProjectType } from '@lightdash/common';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
    OrdinaryServer,
    personalConfig,
    request,
    saveConfig,
} from './harness.mocks';

const location = vi.hoisted(() => ({
    home: '',
    execa: vi.fn(),
    warehouse: vi.fn(),
}));
vi.mock('execa', () => ({ default: location.execa }));
vi.mock('@lightdash/warehouses', async (original) => ({
    ...(await original<typeof import('@lightdash/warehouses')>()),
    warehouseClientFromCredentials: location.warehouse,
}));
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
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

it.each(['allowed', 'denied', 'user-failure'])(
    'pins creation without warehouse credentials: %s',
    async (mode) => {
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { createProject } = await import('../createProject');
        const result = { projectUuid: 'created', name: 'New' };
        const user = request('GET', '/api/v1/user');
        server.replies.push({
            ...user,
            ...(mode === 'user-failure'
                ? { status: 500, error: 'user unavailable' }
                : {
                      results: {
                          userUuid: 'person',
                          organizationUuid: 'org',
                          abilityRules:
                              mode === 'allowed'
                                  ? [{ action: 'create', subject: 'Project' }]
                                  : [],
                      },
                  }),
        });
        const create = request(
            'POST',
            '/api/v1/org/projects',
            JSON.stringify({
                name: 'New',
                type: 'DEFAULT',
                copyWarehouseConnectionFromUpstreamProject: false,
                dbtConnection: { type: 'none' },
                dbtVersion: 'v1.12',
                asyncCopyContent: false,
            }),
        );
        if (mode !== 'denied')
            server.replies.push({ ...create, results: result });
        const execute = createProject({
            name: 'New',
            projectDir: location.home,
            profilesDir: location.home,
            target: undefined,
            profile: undefined,
            type: ProjectType.DEFAULT,
            warehouseCredentials: false,
        });
        if (mode === 'denied')
            await expect(execute).rejects.toThrow(
                "You don't have permission to create projects in this organization.\nThis typically requires the 'admin' or 'developer' role.\nContact your organization admin to request access.",
            );
        else await expect(execute).resolves.toEqual(result);
        expect(server.requests).toEqual(
            mode === 'denied' ? [user] : [user, create],
        );
        server.expectComplete();
        expect(get.mock.calls).toEqual(mode === 'denied' ? [[]] : [[], []]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(location.execa).not.toHaveBeenCalled();
        expect(location.warehouse).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
