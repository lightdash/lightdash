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

it.each(['success', 'health-failure', 'exposure-failure'])(
    'pins ordinary exposures: %s',
    async (mode) => {
        vi.stubEnv('LIGHTDASH_DBT_VERSION', '1.8.0');
        const output = path.join(location.home, 'exposures.yml');
        await fs.writeFile(output, 'sentinel');
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { CLI_VERSION } = await import('../../env');
        const { generateExposuresHandler } =
            await import('../generateExposures');
        const trace = [
            request('GET', '/api/v1/health?skipMigrationCheck=true'),
            request(
                'GET',
                `/api/v1/projects/${config.context!.project}/dbt-exposures`,
            ),
        ];
        server.replies.push(
            {
                ...trace[0],
                ...(mode === 'health-failure'
                    ? { status: 500, error: 'health unavailable' }
                    : { results: { version: CLI_VERSION } }),
            },
            {
                ...trace[1],
                ...(mode === 'exposure-failure'
                    ? { status: 500, error: 'exposures unavailable' }
                    : {
                          results: {
                              orders: {
                                  name: 'orders',
                                  type: 'dashboard',
                                  dependsOn: ["ref('orders')"],
                                  tags: ['pin'],
                              },
                          },
                      }),
            },
        );
        vi.spyOn(console, 'info').mockImplementation(() => {});
        let stderr = '';
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            stderr += String(chunk);
            return true;
        });
        const execution = generateExposuresHandler({
            projectDir: location.home,
            output,
            verbose: false,
        });
        if (mode === 'exposure-failure')
            await expect(execution).rejects.toThrow('exposures unavailable');
        else await expect(execution).resolves.toBeUndefined();
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[], [], []]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(await fs.readFile(output, 'utf8')).toBe(
            mode === 'exposure-failure'
                ? 'sentinel'
                : "version: 2\nexposures:\n  - name: orders\n    type: dashboard\n    depends_on:\n      - ref('orders')\n    tags:\n      - pin\n",
        );
        expect(vi.mocked(console.info).mock.calls).toEqual([
            [
                'This is an experimental feature and may change in future versions',
            ],
            ...(mode === 'exposure-failure' ? [] : [['Found 1 exposures']]),
        ]);
        expect(vi.mocked(console.error).mock.calls).toEqual([
            [`\nUsing project: ${config.context!.project}\n`],
        ]);
        expect(stderr).toBe(
            `-   Generating Lightdash exposures .yml for project Main\n${mode === 'exposure-failure' ? "✖   Failed to generate exposures file'\n" : `✔   Generated exposures file in '${output}'\n`}`,
        );
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
