import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import {
    OrdinaryServer,
    personalConfig,
    runOrdinaryCli,
    saveConfig,
} from './harness.mocks';

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

it.each(['saved', 'unset', 'missing-identity'])(
    'pins ordinary get-project %s including verbose secrets and persistence',
    async (mode) => {
        if (mode === 'unset') delete config.context!.project;
        if (mode === 'missing-identity') delete config.user!.anonymousUuid;
        await saveConfig(location.home, config);
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { getProjectHandler } = await import('../getProject');
        await expect(
            getProjectHandler({ verbose: true }),
        ).resolves.toBeUndefined();
        const expected = {
            ...config,
            user: {
                ...config.user,
                anonymousUuid:
                    mode === 'missing-identity'
                        ? '33333333-3333-4333-8333-333333333333'
                        : 'fixed',
            },
        };
        const lines = [
            `> Config: ${JSON.stringify(expected)}`,
            ...(mode === 'unset'
                ? [
                      'No project set. Use `lightdash config set-project` to select a project.',
                  ]
                : [
                      '\nCurrent project:\n',
                      '  Name: Main',
                      `  UUID: ${config.context!.project}`,
                      '',
                  ]),
        ];
        expect(vi.mocked(console.error).mock.calls).toEqual(
            lines.map((line) => [line]),
        );
        expect(get.mock.calls).toEqual([[]]);
        expect(
            await runOrdinaryCli(location.home, [
                'config',
                'get-project',
                '--verbose',
            ]),
        ).toEqual({
            code: 0,
            stdout: '',
            stderr: `${lines.join('\n')}\nDone 🕶\n`,
        });
        expect(server.requests).toEqual([]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(yaml.dump(expected));
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
    30_000,
);
