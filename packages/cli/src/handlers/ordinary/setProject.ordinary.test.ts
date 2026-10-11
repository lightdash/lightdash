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

it.each(['same', 'different', 'first', 'unset', 'unknown', 'preview'])(
    'pins project setter %s',
    async (mode) => {
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { setProjectCommand, setFirstProject, unsetProjectHandler } =
            await import('../setProject');
        const project =
            mode === 'same'
                ? config.context!.project!
                : '22222222-2222-4222-8222-222222222222';
        const projects = [
            { projectUuid: project, name: 'Server name', type: 'DEFAULT' },
            { projectUuid: 'preview', name: 'Preview', type: 'PREVIEW' },
        ];
        const trace = request('GET', '/api/v1/org/projects');
        if (mode !== 'unset')
            server.replies.push({ ...trace, results: projects });
        const result = (() => {
            if (mode === 'first') {
                return setFirstProject();
            }
            if (mode === 'unset') {
                return unsetProjectHandler({ verbose: false });
            }
            return setProjectCommand(
                undefined,
                (() => {
                    if (mode === 'unknown') {
                        return 'missing';
                    }
                    if (mode === 'preview') {
                        return 'preview';
                    }
                    return project;
                })(),
            );
        })();
        if (mode === 'unknown')
            await expect(result).rejects.toThrow('Project not found.');
        else if (mode === 'preview')
            await expect(result).rejects.toThrow(
                'Project "Preview" is a preview project and cannot be set as the default project. Use `lightdash start-preview` to work with preview projects.',
            );
        else
            await expect(result).resolves.toBe(
                mode === 'first' || mode === 'unset' ? undefined : 'selected',
            );
        const rejected = mode === 'unknown' || mode === 'preview';
        expect(server.requests).toEqual(mode === 'unset' ? [] : [trace]);
        server.expectComplete();
        expect(get.mock.calls).toEqual(
            (() => {
                if (mode === 'unset') {
                    return [];
                }
                if (rejected) {
                    return [[]];
                }
                return [[], []];
            })(),
        );
        const expectedConfig = rejected
            ? config
            : {
                  ...config,
                  context: {
                      ...config.context,
                      project: mode === 'unset' ? undefined : project,
                      projectName: mode === 'unset' ? undefined : 'Server name',
                      source: mode === 'same' ? 'finance' : undefined,
                  },
              };
        expect(await fs.readFile(file, 'utf8')).toBe(yaml.dump(expectedConfig));
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(vi.mocked(console.error).mock.calls).toEqual(
            rejected
                ? []
                : [
                      [
                          mode === 'unset'
                              ? '\n  Project unset.\n'
                              : `\n  ✅️ Connected to Lightdash project: ${server.url}/projects/${mode === 'first' ? 'Server%20name' : project}/home\n`,
                      ],
                  ],
        );
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
