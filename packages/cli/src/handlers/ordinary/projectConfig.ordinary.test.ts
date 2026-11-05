import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { OrdinaryServer, personalConfig, saveConfig } from './harness.mocks';

const location = vi.hoisted(() => ({ home: '' }));
vi.mock('uuid', async (original) => ({
    ...(await original<typeof import('uuid')>()),
    v4: () => '33333333-3333-4333-8333-333333333333',
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

it.each(['valid', 'missing', 'invalid', 'missing-identity'])(
    'pins real project config load: %s',
    async (mode) => {
        const projectFile = path.join(location.home, 'lightdash.config.yml');
        if (mode === 'missing') await fs.unlink(projectFile);
        else if (mode === 'invalid')
            await fs.writeFile(
                projectFile,
                'spotlight:\n  default_visibility: invalid_value\n',
            );
        if (mode === 'missing-identity') {
            delete config.user!.anonymousUuid;
            await saveConfig(location.home, config);
        }
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { readAndLoadLightdashProjectConfig } =
            await import('../../lightdash-config');
        const read = vi.spyOn(fs, 'readFile');
        const execute = readAndLoadLightdashProjectConfig(
            location.home,
            config.context!.project,
        );
        if (mode === 'invalid')
            await expect(execute).rejects.toThrow(
                'Invalid lightdash.config.yml with errors:',
            );
        else
            await expect(execute).resolves.toEqual({
                spotlight: { default_visibility: 'show' },
            });
        expect(read.mock.calls).toEqual([
            ...(mode === 'missing-identity'
                ? [
                      [file, 'utf8'],
                      [file, 'utf8'],
                  ]
                : [[file, 'utf8']]),
            [projectFile, 'utf8'],
        ]);
        expect(get.mock.calls).toEqual([[]]);
        expect(get.mock.invocationCallOrder[0]).toBeLessThan(
            read.mock.invocationCallOrder[0],
        );
        expect(server.requests).toEqual([]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(
            yaml.dump({
                ...config,
                user: {
                    ...config.user,
                    anonymousUuid:
                        mode === 'missing-identity'
                            ? '33333333-3333-4333-8333-333333333333'
                            : 'fixed',
                },
            }),
        );
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
