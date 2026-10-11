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

const preview = '22222222-2222-4222-8222-222222222222';
it.each(
    [403, 404, 200, 500].flatMap((status) =>
        [false, true].map((environment) => ({ status, environment })),
    ),
)(
    'pins preview cleanup for $status, environment=$environment',
    async ({ status, environment }) => {
        config.context = {
            ...config.context,
            previewProject: preview,
            previewName: 'Preview',
        };
        await saveConfig(location.home, config);
        before = await fs.readFile(file, 'utf8');
        if (environment)
            vi.stubEnv('LIGHTDASH_PROJECT', config.context.project!);
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { selectProject } = await import('../selectProject');
        const trace = request('GET', `/api/v1/projects/${preview}`);
        server.replies.push({
            ...trace,
            status,
            ...(status === 200
                ? { results: { projectUuid: preview, type: 'DEFAULT' } }
                : { error: 'fixture failure' }),
        });
        await expect(
            selectProject(await configModule.getConfig()),
        ).resolves.toEqual({
            projectUuid:
                status === 500 && !environment
                    ? preview
                    : config.context.project,
            isPreview: status === 500 && !environment,
        });
        expect(server.requests).toEqual([trace]);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[], []]);
        expect(await fs.readFile(file, 'utf8')).toBe(
            status === 500
                ? before
                : yaml.dump({
                      ...config,
                      context: {
                          ...config.context,
                          previewProject: undefined,
                          previewName: undefined,
                      },
                  }),
        );
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(vi.mocked(console.error).mock.calls).toEqual(
            status === 500 && environment
                ? [
                      [
                          `\nUsing project ${config.context.project} from LIGHTDASH_PROJECT; active preview "Preview" ignored.\nPass --project ${preview} or unset LIGHTDASH_PROJECT to target the preview.\n`,
                      ],
                  ]
                : [],
        );
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
it('retains a stale preview if its ordinary cleanup write fails', async () => {
    config.context = {
        ...config.context,
        previewProject: preview,
        previewName: 'Preview',
    };
    await saveConfig(location.home, config);
    before = await fs.readFile(file, 'utf8');
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { selectProject } = await import('../selectProject');
    const trace = request('GET', `/api/v1/projects/${preview}`);
    server.replies.push({
        ...trace,
        results: { projectUuid: preview, type: 'DEFAULT' },
    });
    const write = vi
        .spyOn(fs, 'writeFile')
        .mockRejectedValue(new Error('Disk full'));
    await expect(
        selectProject(await configModule.getConfig()),
    ).resolves.toEqual({ projectUuid: preview, isPreview: true });
    expect(write).toHaveBeenCalledOnce();
    expect(server.requests).toEqual([trace]);
    server.expectComplete();
    expect(get.mock.calls).toEqual([[], []]);
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});
