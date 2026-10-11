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
    location.home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-upload-'));
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
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(location.home);
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
const makeUploadHandlerOptions = (
    overrides: Partial<DownloadHandlerOptions> = {},
): DownloadHandlerOptions => ({
    verbose: false,
    charts: ['orders'],
    dashboards: ['overview'],
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
    skipCharts: false,
    skipDashboards: false,
    skipAlerts: true,
    skipAgents: true,
    skipGoogleSheets: true,
    skipScheduledDeliveries: true,
    skipVirtualViews: true,
    skipExternalConnections: true,
    includeAlerts: false,
    includeGoogleSheets: false,
    includeScheduledDeliveries: false,
    includeVirtualViews: false,
    includeExternalConnections: false,
    includeAll: false,
    stripPivotSeries: false,
    concurrency: 1,
    organization: false,
    skipDocuments: true,
    skipHomepages: true,
    ...overrides,
});

const chart = {
    chartConfig: { config: {}, type: 'table' },
    contentType: 'chart',
    description: 'Order totals',
    metricQuery: {
        dimensions: [],
        exploreName: 'orders',
        filters: {},
        limit: 10,
        metrics: ['orders_total'],
        sorts: [],
        tableCalculations: [],
    },
    name: 'Orders',
    slug: 'orders',
    spaceSlug: 'shared',
    tableName: 'orders',
    version: 1,
};
const dashboard = {
    contentType: 'dashboard',
    description: 'Order overview',
    name: 'Overview',
    slug: 'overview',
    spaceSlug: 'shared',
    tabs: [],
    tiles: [
        {
            h: 6,
            properties: { chartSlug: 'orders', title: 'Orders' },
            type: 'saved_chart',
            w: 12,
            x: 0,
            y: 0,
        },
    ],
    version: 1,
};

it('pins an ordinary chart and dashboard upload through both resource upserts', async () => {
    const before = await fs.readFile(file, 'utf8');
    expect(before).toBe(yaml.dump(config));
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    await fs.mkdir(path.join(output, 'charts'), { recursive: true });
    await fs.mkdir(path.join(output, 'dashboards'));
    await fs.writeFile(
        path.join(output, 'charts/orders.yml'),
        yaml.dump(chart),
    );
    await fs.writeFile(
        path.join(output, 'dashboards/overview.yml'),
        yaml.dump(dashboard),
    );
    const configModule = await import('../../config');
    const get = vi.spyOn(configModule, 'getConfig');
    const { CLI_VERSION } = await import('../../env');
    const { uploadHandler } = await import('../download');
    const project = config.context!.project!;
    const trace = [
        request('GET', '/api/v1/health?skipMigrationCheck=true'),
        request('GET', `/api/v1/projects/${project}/code/upload-advisory`),
        request('GET', '/api/v1/user'),
        request('GET', `/api/v1/projects/${project}`),
        request(
            'POST',
            `/api/v1/projects/${project}/code/charts/orders`,
            JSON.stringify({
                ...chart,
                needsUpdating: true,
                filePath: 'output/charts/orders.yml',
                skipSpaceCreate: false,
                publicSpaceCreate: false,
                force: false,
            }),
        ),
        request(
            'POST',
            `/api/v1/projects/${project}/code/dashboards/overview`,
            JSON.stringify({
                ...dashboard,
                needsUpdating: true,
                filePath: 'output/dashboards/overview.yml',
                skipSpaceCreate: false,
                publicSpaceCreate: false,
                force: false,
            }),
        ),
    ];
    server.replies.push(
        { ...trace[0], results: { version: CLI_VERSION } },
        { ...trace[1], results: { openDraftCount: 0 } },
        {
            ...trace[2],
            results: {
                userUuid: 'person',
                abilityRules: [
                    { action: 'create', subject: 'ContentAsCode' },
                    { action: 'manage', subject: 'SavedChart' },
                    { action: 'manage', subject: 'Dashboard' },
                ],
            },
        },
        {
            ...trace[3],
            results: {
                projectUuid: project,
                organizationUuid: 'org',
                name: 'Main',
                type: 'DEFAULT',
            },
        },
        { ...trace[4], results: { charts: [{ action: 'create' }] } },
        { ...trace[5], results: { dashboards: [{ action: 'update' }] } },
    );
    server.onRequest = () => {
        if (
            server.requests.length === 3 &&
            server.requests[2].path === trace[3].path
        ) {
            [server.replies[0], server.replies[1]] = [
                server.replies[1],
                server.replies[0],
            ];
        }
    };
    await expect(
        uploadHandler(makeUploadHandlerOptions({ path: output })),
    ).resolves.toBeUndefined();
    const permissionRequests =
        server.requests[2]?.path === trace[3].path
            ? [trace[3], trace[2]]
            : [trace[2], trace[3]];
    expect(server.requests).toEqual([
        ...trace.slice(0, 2),
        ...permissionRequests,
        ...trace.slice(4),
    ]);
    server.expectComplete();
    expect(get.mock.calls).toEqual(Array.from({ length: 9 }, () => []));
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(stderr.replace(/\(\d+ms\)/g, '(TIMEms)')).toBe(
        `\nUploading to project: "Main"\n\n` +
            '- Uploading content files\n✔ Content files  0 discovered (TIMEms)\n' +
            `Reading dashboards from ${output}\n` +
            '- Uploading charts\n' +
            `Reading charts from ${output}\nFound 1 charts files\n` +
            'Filtered 1 charts with slugs: orders\n✔ Charts         1 created (TIMEms)\n' +
            '- Uploading dashboards\n' +
            `Reading dashboards from ${output}\nFound 1 dashboards files\n` +
            'Filtered 1 dashboards with slugs: overview\n✔ Dashboards     1 updated (TIMEms)\n' +
            'No skill filters provided, skipping\n' +
            `Uploaded content from ${output}\n`,
    );
    expect(vi.mocked(console.info).mock.calls).toEqual([
        ['Total charts created: 1 '],
        ['Total dashboards updated: 1 '],
    ]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
});

it.each(['apiKey', 'serverUrl'] as const)(
    'refuses upload without %s before any request or config write',
    async (key) => {
        delete config.context![key];
        await saveConfig(location.home, config);
        const before = await fs.readFile(file, 'utf8');
        expect(before).toBe(yaml.dump(config));
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { uploadHandler } = await import('../download');
        await expect(
            uploadHandler(makeUploadHandlerOptions({ path: output })),
        ).rejects.toThrow("Not logged in. Run 'lightdash login --help'");
        expect(get.mock.calls).toEqual([[], []]);
        expect(server.requests).toEqual([]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(stderr).toBe('');
        expect(console.info).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
