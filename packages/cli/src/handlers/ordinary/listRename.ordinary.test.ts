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

it.each([false, true])('pins project listing, empty=%s', async (empty) => {
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { listProjectsHandler } = await import('../listProjects');
    const trace = request('GET', '/api/v1/org/projects');
    server.replies.push({
        ...trace,
        results: empty
            ? []
            : [
                  {
                      projectUuid: 'P',
                      name: 'Production',
                      slug: 'production',
                      warehouseType: 'postgres',
                      type: 'DEFAULT',
                  },
                  { projectUuid: 'Q', name: 'Preview', type: 'PREVIEW' },
              ],
    });
    await expect(
        listProjectsHandler({ verbose: false }),
    ).resolves.toBeUndefined();
    expect(server.requests).toEqual([trace]);
    server.expectComplete();
    expect(get.mock.calls).toEqual([[]]);
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(vi.mocked(console.error).mock.calls).toEqual(
        (empty
            ? ['No projects found.']
            : [
                  '\nProjects (1):\n',
                  '  Production',
                  '    UUID: P',
                  '    Slug: production',
                  '    Warehouse: postgres',
                  '',
              ]
        ).map((line) => [line]),
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});
it.each([false, true])('pins project rename, rejected=%s', async (rejected) => {
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { renameProjectHandler } = await import('../renameProject');
    const write = vi.spyOn(fs, 'writeFile');
    let writesBeforeResponse: number | null = null;
    server.onRequest = () => {
        writesBeforeResponse = write.mock.calls.length;
    };
    const trace = request(
        'PATCH',
        `/api/v1/projects/${config.context!.project}/details`,
        '{"name":"Input"}',
    );
    server.replies.push({
        ...trace,
        ...(rejected
            ? { status: 403, error: 'denied' }
            : {
                  results: {
                      projectUuid: config.context!.project,
                      name: 'Server name',
                  },
              }),
    });
    const execute = renameProjectHandler({ name: '  Input  ', verbose: false });
    if (rejected) await expect(execute).rejects.toThrow('denied');
    else await expect(execute).resolves.toBeUndefined();
    expect(writesBeforeResponse).toBe(0);
    expect(server.requests).toEqual([trace]);
    server.expectComplete();
    expect(get.mock.calls).toEqual([[], []]);
    expect(await fs.readFile(file, 'utf8')).toBe(
        rejected
            ? before
            : yaml.dump({
                  ...config,
                  context: { ...config.context, projectName: 'Server name' },
              }),
    );
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(vi.mocked(console.error).mock.calls).toEqual(
        rejected ? [] : [['\n  ✅️ Renamed project to: Server name\n']],
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});
