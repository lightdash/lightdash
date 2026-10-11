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

const sources = [
    { name: 'primary', projectDbtSourceUuid: 'primary-source' },
    { name: 'finance', projectDbtSourceUuid: 'finance-source' },
];
const prepare = async () => {
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const handlers = await import('../sourceSelection');
    return { get, ...handlers };
};
const expectFile = async (expected = before) => {
    server.expectComplete();
    expect(await fs.readFile(file, 'utf8')).toBe(expected);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
};
it.each([true, false])(
    'resolves a saved source only for its project (match=%s)',
    async (matches) => {
        const { get, resolveProjectSourceUuid } = await prepare();
        const project = matches ? config.context!.project! : 'another-project';
        const trace = request('GET', `/api/v1/projects/${project}/dbt-sources`);
        if (matches) server.replies.push({ ...trace, results: sources });
        await expect(
            resolveProjectSourceUuid(project, undefined),
        ).resolves.toBe(matches ? 'finance-source' : undefined);
        expect(server.requests).toEqual(matches ? [trace] : []);
        expect(get.mock.calls).toEqual(matches ? [[], []] : [[]]);
        expect(console.error).not.toHaveBeenCalled();
        await expectFile();
    },
);
it.each(['finance', 'missing'])(
    'sets source %s with exact persistence and output',
    async (name) => {
        config.context!.source = 'primary';
        await saveConfig(location.home, config);
        before = await fs.readFile(file, 'utf8');
        const { get, setSourceHandler } = await prepare();
        const trace = request(
            'GET',
            `/api/v1/projects/${config.context!.project}/dbt-sources`,
        );
        server.replies.push({ ...trace, results: sources });
        const result = setSourceHandler(name, { verbose: false });
        if (name === 'finance') await expect(result).resolves.toBeUndefined();
        else
            await expect(result).rejects.toThrow(
                'The dbt source "missing" does not belong to this project.\n\nAvailable sources:\n  - primary\n  - finance',
            );
        expect(server.requests).toEqual([trace]);
        expect(get.mock.calls).toEqual([[], []]);
        expect(vi.mocked(console.error).mock.calls).toEqual(
            name === 'finance'
                ? [['\n  ✅️ Selected dbt source: finance\n']]
                : [],
        );
        await expectFile(
            name === 'finance'
                ? yaml.dump({
                      ...config,
                      context: { ...config.context, source: 'finance' },
                  })
                : before,
        );
    },
);
it('refuses a source setter without a project before fetching or writing', async () => {
    delete config.context!.project;
    await saveConfig(location.home, config);
    before = await fs.readFile(file, 'utf8');
    const { get, setSourceHandler } = await prepare();
    await expect(
        setSourceHandler('finance', { verbose: false }),
    ).rejects.toThrow(
        "No project selected. Run 'lightdash config set-project' first.",
    );
    expect(server.requests).toEqual([]);
    expect(get.mock.calls).toEqual([[]]);
    expect(console.error).not.toHaveBeenCalled();
    await expectFile();
});

it.each([true, false])(
    'pins an explicit source override for the saved project=%s',
    async (sameProject) => {
        expect(before).toBe(yaml.dump(config));
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        const { get, resolveProjectSourceUuid } = await prepare();
        const project = sameProject
            ? config.context!.project!
            : 'another-project';
        const trace = request('GET', `/api/v1/projects/${project}/dbt-sources`);
        server.replies.push({ ...trace, results: sources });
        await expect(
            resolveProjectSourceUuid(project, 'primary'),
        ).resolves.toBe('primary-source');
        expect(server.requests).toEqual([trace]);
        expect(get.mock.calls).toEqual([[], []]);
        expect(console.error).not.toHaveBeenCalled();
        await expectFile();
    },
);
