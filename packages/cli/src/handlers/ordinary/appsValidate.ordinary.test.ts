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
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

it.each([false, true])(
    'pins live app validation wiring, missing project=%s',
    async (missing) => {
        if (missing) {
            delete config.context!.project;
            await saveConfig(location.home, config);
            before = await fs.readFile(file, 'utf8');
        }
        const app = path.join(location.home, 'app');
        const { writeBundleToDir } = await import('../apps/appCodeFiles');
        await writeBundleToDir(app, {
            manifest: {
                codeVersion: 1,
                projectUuid: 'manifest-project',
                slug: 'orders-app',
                version: 1,
                name: 'Orders app',
                description: '',
                template: null,
                downloadedAt: '2026-08-01T00:00:00.000Z',
            },
            files: [
                {
                    path: 'src/App.tsx',
                    contentBase64: Buffer.from(
                        "import { query } from '@lightdash/query-sdk'; query('orders').dimensions(['id']);",
                    ).toString('base64'),
                },
            ],
        });
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { appsValidateHandler } = await import('../apps/validate');
        const trace = missing
            ? []
            : [
                  request(
                      'GET',
                      `/api/v1/projects/${config.context!.project}/explores`,
                  ),
                  request(
                      'GET',
                      `/api/v1/projects/${config.context!.project}/explores/orders`,
                  ),
              ];
        if (!missing)
            server.replies.push(
                { ...trace[0], results: [{ name: 'orders' }] },
                {
                    ...trace[1],
                    results: {
                        name: 'orders',
                        tables: {
                            orders: {
                                dimensions: {
                                    id: { name: 'id', table: 'orders' },
                                },
                                metrics: {},
                            },
                        },
                    },
                },
            );
        const write = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        const execution = appsValidateHandler([app], {
            live: true,
            build: false,
            format: 'json',
            verbose: false,
        });
        if (missing)
            await expect(execution).rejects.toThrow(
                'Data app validation failed with 1 error(s).',
            );
        else await expect(execution).resolves.toBeUndefined();
        const expected = {
            build: false,
            valid: !missing,
            mode: 'live',
            summary: {
                apps: 1,
                dataApps: 1,
                chartTypes: 0,
                errors: missing ? 1 : 0,
                warnings: 0,
                callSites: 1,
                unanalyzedCallSites: 0,
            },
            apps: [
                {
                    path: app,
                    name: 'Orders app',
                    projectUuid: config.context!.project ?? null,
                    template: null,
                    valid: !missing,
                    errors: missing
                        ? [
                              {
                                  code: 'semantic_layer',
                                  message:
                                      "Could not load live semantic layer: No project selected. Run 'lightdash config set-project' before using --live validation.",
                                  location: null,
                              },
                          ]
                        : [],
                    warnings: [],
                    coverage: {
                        callSites: 1,
                        fullyResolved: 1,
                        partiallyResolved: 0,
                        unresolved: 0,
                        unanalyzed: 0,
                    },
                },
            ],
        };
        expect(write.mock.calls).toEqual([
            [`${JSON.stringify(expected, null, 2)}\n`],
        ]);
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual(missing ? [[]] : [[], [], []]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
