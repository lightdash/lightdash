import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import type { DownloadHandlerOptions } from '../download';
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
let config: ReturnType<typeof personalConfig>;
let file: string;
let output: string;
let stderr: string;
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
    vi.stubEnv('TERM', 'dumb');
    chalk.level = 0;
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-download-'));
    output = path.join(location.home, 'output');
    server = new OrdinaryServer();
    await server.start();
    config = personalConfig(server.url);
    file = await saveConfig(location.home, config);
    stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
    });
    vi.spyOn(console, 'error').mockImplementation((text) => {
        stderr += `${String(text)}\n`;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Unexpected exit');
    });
    process.exitCode = undefined;
});
afterEach(async () => {
    await server.close();
    await fs.rm(location.home, { recursive: true, force: true });
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});
const makeDownloadHandlerOptions = (
    overrides: Partial<DownloadHandlerOptions> = {},
): DownloadHandlerOptions => ({
    verbose: false,
    charts: [],
    dashboards: [],
    alerts: [],
    agents: [],
    googleSheets: [],
    scheduledDeliveries: [],
    virtualViews: [],
    externalConnections: [],
    apps: [],
    includeAgents: false,
    includeApps: false,
    force: false,
    languageMap: false,
    skipSpaceCreate: false,
    public: false,
    includeCharts: false,
    nested: false,
    rootSpaces: false,
    skipSpaces: true,
    skipCharts: true,
    skipDashboards: true,
    skipAlerts: false,
    skipAgents: false,
    skipGoogleSheets: false,
    skipScheduledDeliveries: false,
    skipVirtualViews: false,
    skipExternalConnections: false,
    includeAlerts: false,
    includeGoogleSheets: false,
    includeScheduledDeliveries: false,
    includeVirtualViews: false,
    includeExternalConnections: false,
    includeAll: false,
    stripPivotSeries: false,
    concurrency: 1,
    organization: false,
    ...overrides,
});

it.each([undefined, false, true])(
    'pins notice persistence for previous answer %s',
    async (shown) => {
        config.answers!.metadataFileGitignoreNoticeShown = shown;
        await saveConfig(location.home, config);
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const write = vi.spyOn(fs, 'writeFile');
        const { CLI_VERSION } = await import('../../env');
        const { downloadHandler } = await import('../download');
        const project = config.context!.project!;
        const trace = [
            request('GET', '/api/v1/health?skipMigrationCheck=true'),
            request('GET', `/api/v1/projects/${project}`),
        ];
        const notice = `\nNote: .lightdash-metadata.json was written to ${output}. Consider adding it to your .gitignore.\n`;
        await [0, 1].reduce(async (previous, run) => {
            await previous;
            stderr = '';
            server.replies.push(
                {
                    method: 'GET',
                    path: trace[0].path,
                    results: { version: CLI_VERSION },
                },
                {
                    method: 'GET',
                    path: trace[1].path,
                    results: { name: 'Main' },
                },
            );
            await expect(
                downloadHandler(makeDownloadHandlerOptions({ path: output })),
            ).resolves.toBeUndefined();
            expect(server.requests).toEqual(
                Array.from({ length: run + 1 }, () => trace).flat(),
            );
            server.expectComplete();
            expect(get.mock.calls).toEqual(
                Array.from({ length: (run + 1) * 3 }, () => []),
            );
            expect(await fs.readFile(file, 'utf8')).toBe(
                yaml.dump({
                    ...config,
                    answers: {
                        ...config.answers,
                        metadataFileGitignoreNoticeShown: true,
                    },
                }),
            );
            expect(await fs.readdir(path.dirname(file))).toEqual([
                'config.yaml',
            ]);
            expect(await fs.readdir(output)).toEqual([
                '.lightdash-metadata.json',
            ]);
            expect(
                await fs.readFile(
                    path.join(output, '.lightdash-metadata.json'),
                    'utf8',
                ),
            ).toBe(
                '{\n  "version": 1,\n  "charts": {},\n  "dashboards": {}\n}',
            );
            expect(stderr.replace(/\(\d+ms\)/g, '(TIMEms)')).toBe(
                `\nDownloading from project: "Main"\n\n- Downloading metadata\n${!shown && run === 0 ? notice : ''}✔ Metadata       timestamps written (TIMEms)\nDownloaded content saved to ${output}\n`,
            );
            expect(console.log).not.toHaveBeenCalled();
            expect(process.exit).not.toHaveBeenCalled();
            expect(process.exitCode).toBeUndefined();
        }, Promise.resolve());
        expect(
            write.mock.calls.filter(([destination]) => destination === file),
        ).toHaveLength(shown ? 0 : 1);
    },
);
it.each(['apiKey', 'serverUrl'] as const)(
    'retains the missing %s login precondition without writes',
    async (key) => {
        delete config.context![key];
        await saveConfig(location.home, config);
        const before = await fs.readFile(file, 'utf8');
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { downloadHandler } = await import('../download');
        await expect(
            downloadHandler(makeDownloadHandlerOptions({ path: output })),
        ).rejects.toThrow("Not logged in. Run 'lightdash login --help'");
        expect(get.mock.calls).toEqual([[], []]);
        expect(server.requests).toEqual([]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(stderr).toBe('');
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
