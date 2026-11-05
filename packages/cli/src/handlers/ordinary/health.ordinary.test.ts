import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
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
    warehouse: vi.fn(),
    prompt: vi.fn(),
}));
vi.mock('@lightdash/warehouses', async (original) => ({
    ...(await original<typeof import('@lightdash/warehouses')>()),
    warehouseClientFromCredentials: location.warehouse,
}));
vi.mock('inquirer', () => ({ default: { prompt: location.prompt } }));
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

it.each([
    'refresh',
    'warehouse',
    'missing-refresh',
    'missing-warehouse',
    'decline',
])('uses real advisory health and ordinary %s flow', async (mode) => {
    vi.stubEnv('LIGHTDASH_DBT_VERSION', '1.8.0');
    vi.stubEnv('CI', mode === 'decline' ? undefined : 'true');
    location.warehouse.mockReset().mockReturnValue({});
    location.prompt.mockReset().mockResolvedValue({ isConfirm: false });
    if (mode === 'decline')
        config.answers!.permissionToStoreWarehouseCredentials = true;
    const projectUuid = config.context!.project!;
    if (mode.startsWith('missing')) delete config.context!.project;
    await saveConfig(location.home, config);
    before = await fs.readFile(file, 'utf8');
    await fs.writeFile(
        path.join(location.home, 'dbt_project.yml'),
        'name: pin\nprofile: pin\n',
    );
    const credentials = {
        type: 'postgres',
        host: 'warehouse.invalid',
        user: 'dbt',
        password: 'fixture',
        port: 5432,
        dbname: 'db',
        schema: 'public',
    };
    await fs.writeFile(
        path.join(location.home, 'profiles.yml'),
        yaml.dump({ pin: { target: 'dev', outputs: { dev: credentials } } }),
    );
    const project = {
        projectUuid,
        name: 'Remote',
        dbtConnection: { type: 'github', repository: 'fixture' },
        dbtVersion: 'v1.8',
    };
    const trace = [request('GET', '/api/v1/health?skipMigrationCheck=true')];
    server.replies.push({
        ...trace[0],
        status: 500,
        error: 'health unavailable',
    });
    if (!mode.startsWith('missing')) {
        trace.push(request('GET', `/api/v1/projects/${projectUuid}`));
        server.replies.push({ ...trace[1], results: project });
        if (mode !== 'decline') {
            trace.push(
                mode === 'refresh'
                    ? request('POST', `/api/v1/projects/${projectUuid}/refresh`)
                    : request(
                          'PATCH',
                          `/api/v1/projects/${projectUuid}`,
                          JSON.stringify({
                              name: project.name,
                              dbtConnection: project.dbtConnection,
                              dbtVersion: project.dbtVersion,
                              warehouseConnection: credentials,
                          }),
                      ),
                request('GET', '/api/v1/jobs/J'),
            );
            server.replies.push(
                { ...trace[2], results: { jobUuid: 'J' } },
                { ...trace[3], results: { jobStatus: 'DONE', steps: [] } },
            );
        }
    }
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { refreshHandler } = await import('../dbt/refresh');
    const { setWarehouseHandler } = await import('../setWarehouse');
    let spinnerOutput = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        spinnerOutput += String(chunk);
        return true;
    });
    const execution = mode.includes('refresh')
        ? refreshHandler({ verbose: false })
        : setWarehouseHandler({
              projectDir: location.home,
              profilesDir: location.home,
              assumeYes: mode !== 'decline',
              verbose: false,
          });
    if (mode.startsWith('missing'))
        await expect(execution).rejects.toThrow(
            mode === 'missing-refresh'
                ? "No active Lightdash project. Run 'lightdash login --help'"
                : "No project selected. Run 'lightdash config set-project' first or pass '--project <uuid or slug>'.",
        );
    else await expect(execution).resolves.toBeUndefined();
    expect(server.requests).toEqual(trace);
    server.expectComplete();
    expect(get.mock.calls).toEqual(
        Array.from(
            {
                length: (() => {
                    if (mode.startsWith('missing')) {
                        return 2;
                    }
                    if (mode === 'refresh') {
                        return 5;
                    }
                    if (mode === 'decline') {
                        return 4;
                    }
                    return 6;
                })(),
            },
            () => [],
        ),
    );
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(vi.mocked(console.error).mock.calls).toEqual(
        (() => {
            if (mode.startsWith('missing')) {
                return [];
            }
            if (mode === 'decline') {
                return [['Aborted.']];
            }
            return [
                ...(mode === 'refresh'
                    ? [[`\nUsing project: ${projectUuid}\n`]]
                    : []),
                [
                    mode === 'refresh'
                        ? 'Successfully refreshed project:'
                        : 'Successfully updated warehouse connection:',
                ],
                [''],
                [`      ⚡️ ${server.url}/projects/${projectUuid}/home`],
                [''],
            ];
        })(),
    );
    expect(spinnerOutput).toBe(
        (() => {
            if (mode.startsWith('missing') || mode === 'decline') {
                return '';
            }
            if (mode === 'refresh') {
                return '-   Refreshing dbt project\n';
            }
            return '-   Updating warehouse connection...\n';
        })(),
    );
    expect(location.prompt).toHaveBeenCalledTimes(mode === 'decline' ? 1 : 0);
    expect(location.warehouse).toHaveBeenCalledTimes(
        mode === 'warehouse' || mode === 'decline' ? 1 : 0,
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});
