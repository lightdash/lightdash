import chalk from 'chalk';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
    OrdinaryServer,
    personalConfig,
    request,
    runOrdinaryCli,
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

const checkUnchanged = async () => {
    server.expectComplete();
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
};
it.each([
    'uuid',
    'slug',
    'ambiguous',
    'missing',
    'agent-saved',
    'agent-explicit',
])('pins project resolver %s', async (mode) => {
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { resolveProjectFlag } = await import('../resolveProjectFlag');
    const { resolveAgentProject } = await import('../agentAccess');
    const lookup = ['slug', 'ambiguous', 'missing'].includes(mode);
    const trace = request('GET', '/api/v1/org/projects');
    if (lookup)
        server.replies.push({
            ...trace,
            results:
                mode === 'missing'
                    ? []
                    : [
                          {
                              projectUuid: config.context!.project,
                              name: 'Main',
                              slug: 'main',
                          },
                          ...(mode === 'ambiguous'
                              ? [
                                    {
                                        projectUuid: 'other',
                                        name: 'Other',
                                        slug: 'main',
                                    },
                                ]
                              : []),
                      ],
        });
    const execute = mode.startsWith('agent')
        ? resolveAgentProject(
              mode === 'agent-explicit' ? config.context!.project : undefined,
          )
        : resolveProjectFlag(lookup ? 'main' : config.context!.project!);
    if (mode === 'ambiguous')
        await expect(execute).rejects.toThrow(
            `Project slug "main" matches more than one project. Use the project UUID instead:\n  Main: ${config.context!.project}\n  Other: other`,
        );
    else if (mode === 'missing')
        await expect(execute).rejects.toThrow(
            'No project found with UUID or slug "main". Run lightdash config list-projects to see the projects you have access to.',
        );
    else await expect(execute).resolves.toBe(config.context!.project);
    expect(get.mock.calls).toEqual(
        lookup || mode === 'agent-saved' ? [[]] : [],
    );
    expect(server.requests).toEqual(lookup ? [trace] : []);
    expect(console.error).not.toHaveBeenCalled();
    await checkUnchanged();
});
it.each([200, 403, 500, 0])(
    'pins real cloud warehouse catalogue, status=%s',
    async (status) => {
        location.execa
            .mockReset()
            .mockResolvedValue({ all: 'Connection type postgres' });
        location.warehouse.mockReset().mockReturnValue({});
        if (status === 0) {
            delete config.context!.project;
            await saveConfig(location.home, config);
            before = await fs.readFile(file, 'utf8');
        }
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { default: getWarehouseClient } =
            await import('../dbt/getWarehouseClient');
        const trace = request(
            'GET',
            `/api/v1/projects/${config.context!.project}/sqlRunner/fields?tableName=orders&schemaName=public&databaseName=db`,
        );
        if (status)
            server.replies.push({
                ...trace,
                status,
                ...(status === 200
                    ? { results: { id: 'number' } }
                    : { error: 'schema unavailable' }),
            });
        const { warehouseClient } = await getWarehouseClient({
            isDbtCloudCLI: true,
            profilesDir: location.home,
            profile: 'pin',
        });
        await expect(
            warehouseClient.getCatalog([
                { database: 'db', schema: 'public', table: 'orders' },
            ]),
        ).resolves.toEqual(
            status === 200
                ? { db: { public: { orders: { id: 'number' } } } }
                : {},
        );
        expect(location.execa.mock.calls).toEqual([
            [
                'dbt',
                ['environment', 'show'],
                { all: true, stdio: ['pipe', 'pipe', 'pipe'] },
            ],
        ]);
        expect(location.warehouse).toHaveBeenCalledOnce();
        expect(get.mock.calls).toEqual(status ? [[], []] : [[]]);
        expect(server.requests).toEqual(status ? [trace] : []);
        expect(console.error).not.toHaveBeenCalled();
        await checkUnchanged();
    },
);
it('keeps bare agent status personal in the real CLI', async () => {
    const trace = request(
        'GET',
        `/api/v2/projects/${config.context!.project}/ai-access/me`,
    );
    server.replies.push({
        ...trace,
        results: {
            refusal: null,
            identity: 'connected_person',
            expiresAt: null,
        },
    });
    expect(await runOrdinaryCli(location.home, ['agent', 'status'])).toEqual({
        code: 0,
        stdout: '',
        stderr: 'Agent connected\nDone 🕶\n',
    });
    expect(server.requests).toEqual([trace]);
    expect(console.error).not.toHaveBeenCalled();
    await checkUnchanged();
}, 30_000);
