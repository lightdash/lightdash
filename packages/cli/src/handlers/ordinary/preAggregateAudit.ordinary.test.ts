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
        'LIGHTDASH_PROJECT_UUID',
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

it.each(['success', 'miss', 'no-project'])(
    'pins the real audit command entry: %s',
    async (mode) => {
        if (mode === 'no-project') {
            delete config.context!.project;
            await saveConfig(location.home, config);
            before = await fs.readFile(file, 'utf8');
        }
        const { CLI_VERSION } = await import('../../env');
        const audit = {
            dashboardUuid: 'D',
            dashboardName: 'Dashboard',
            dashboardSlug: 'dashboard',
            tabs: [],
            summary: {
                hitCount: 0,
                missCount: mode === 'miss' ? 1 : 0,
                ineligibleCount: 0,
            },
        };
        const trace = [
            request('GET', '/api/v1/health?skipMigrationCheck=true'),
            ...(mode === 'no-project'
                ? []
                : [
                      request(
                          'GET',
                          `/api/v1/projects/${config.context!.project}/dashboards`,
                      ),
                      request(
                          'GET',
                          `/api/v2/projects/${config.context!.project}/pre-aggregates/dashboards/D/audit`,
                      ),
                  ]),
        ];
        const replies = [
            { ...trace[0], results: { version: CLI_VERSION } },
            ...(mode === 'no-project'
                ? []
                : [
                      { ...trace[1], results: [{ uuid: 'D' }] },
                      { ...trace[2], results: audit },
                  ]),
        ];
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { preAggregateAuditHandler } =
            await import('../preAggregateAudit');
        const write = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        server.replies.push(...replies);
        const execution = preAggregateAuditHandler({
            all: true,
            json: true,
            failOnMiss: true,
        });
        if (mode === 'success')
            await expect(execution).resolves.toBeUndefined();
        else await expect(execution).rejects.toThrow('Unexpected exit');
        expect(get.mock.calls).toEqual(
            Array.from({ length: trace.length + 1 }, () => []),
        );
        expect(write.mock.calls.map(([chunk]) => chunk)).toEqual(
            mode === 'no-project'
                ? []
                : [`${JSON.stringify({ dashboards: [audit] }, null, 2)}\n`],
        );
        expect(vi.mocked(console.error).mock.calls).toEqual(
            mode === 'no-project'
                ? [
                      [
                          'No project selected. Pass --project <uuid or slug>, set LIGHTDASH_PROJECT_UUID, or run `lightdash login`.',
                      ],
                  ]
                : [],
        );
        expect(vi.mocked(process.exit).mock.calls).toEqual(
            mode === 'success' ? [] : [[1]],
        );
        write.mockRestore();
        server.replies.push(...replies);
        const result = await runOrdinaryCli(location.home, [
            'pre-aggregate-audit',
            '--all',
            '--json',
            '--fail-on-miss',
        ]);
        expect(result).toEqual({
            code: mode === 'success' ? 0 : 1,
            stdout:
                mode === 'no-project'
                    ? ''
                    : `${JSON.stringify({ dashboards: [audit] }, null, 2)}\n`,
            stderr: (() => {
                if (mode === 'success') {
                    return 'Done 🕶\n';
                }
                if (mode === 'no-project') {
                    return 'No project selected. Pass --project <uuid or slug>, set LIGHTDASH_PROJECT_UUID, or run `lightdash login`.\n';
                }
                return '';
            })(),
        });
        expect(server.requests).toEqual([...trace, ...trace]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
    30_000,
);
