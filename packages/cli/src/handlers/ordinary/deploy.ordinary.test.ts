import { SupportedDbtAdapter, type Explore } from '@lightdash/common';
import chalk from 'chalk';
import { promises as fs } from 'fs';
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
    file = await saveConfig(location.home, personalConfig(server.url));
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
const compiledExplore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    tables: {},
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const deployOptions = {
    projectDir: '/tmp/project',
    profilesDir: '',
    target: undefined,
    profile: undefined,
    vars: undefined,
    verbose: false,
    ignoreErrors: false,
    validateWarehouseColumns: false,
    projectUuid: 'project-uuid',
    skipWarehouseCatalog: true,
    skipDbtCompile: true,
    useDbtList: false,
    select: undefined,
    models: undefined,
    threads: undefined,
    noVersionCheck: false,
    exclude: undefined,
    selector: undefined,
    state: undefined,
    fullRefresh: false,
    defer: false,
    targetPath: undefined,
    favorState: false,
    combineManifest: undefined,
};

const prefix = [
    request('PUT', '/api/v1/projects/project-uuid/tags/yaml', '[]'),
    request('PUT', '/api/v2/projects/project-uuid/parameters', '{}'),
];
const start = request('POST', '/api/v2/projects/project-uuid/deploy', '{}');
const batch = request(
    'POST',
    '/api/v2/projects/project-uuid/deploy/S/batch',
    JSON.stringify({
        explores: [compiledExplore],
        batchNumber: 0,
        complete: false,
    }),
);
const finalize = request(
    'POST',
    '/api/v2/projects/project-uuid/deploy/S/finalize',
    '{}',
);
const legacy = request(
    'PUT',
    '/api/v1/projects/project-uuid/explores?complete=false',
    JSON.stringify([compiledExplore]),
);
const prepare = async () => {
    const module = await import('../../config');
    const get = vi.spyOn(module, 'getConfig');
    const { deploy } = await import('../deploy');
    server.replies.push(
        ...prefix.map((entry) => ({ ...entry, results: null })),
    );
    return {
        get,
        deploy,
        options: { ...deployOptions, projectDir: location.home },
    };
};
const verify = async (
    get: ReturnType<typeof vi.spyOn>,
    expected: ReturnType<typeof request>[],
    output: string[],
) => {
    server.expectComplete();
    expect(server.requests).toEqual(expected);
    expect(get.mock.calls).toEqual(
        Array.from({ length: expected.length + 1 }, () => []),
    );
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
    expect(vi.mocked(console.error).mock.calls).toEqual(
        output.map((line) => [line]),
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
};
const opening = [
    'Deploying 1 explores using batched deploy (batch size: 50, parallel: 1)',
    'Starting deploy session...',
];
const uploading = [
    ...opening,
    'Deploy session created: S',
    'Uploading 1 batches...',
    '  Uploading batch 1/1 (1 explores)...',
];
it.each([false, true])(
    'pins batch backoff and exhaustion=%s',
    async (exhausted) => {
        const { get, deploy, options } = await prepare();
        server.replies.push(
            { ...start, results: { deploySessionUuid: 'S' } },
            ...[500, 429, 503, exhausted ? 500 : 200].map((status, index) => ({
                ...batch,
                status,
                disconnect: index === 2,
                error: status === 200 ? undefined : `failure-${index}`,
                results: { exploreCount: 1 },
            })),
            ...(exhausted
                ? []
                : [{ ...finalize, results: { exploreCount: 1 } }]),
        );
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const backoffs = [500, 1000, 2000].map((delay) => {
            let scheduled!: () => void;
            const ready = new Promise<void>((resolve) => {
                scheduled = resolve;
            });
            return { delay, ready, scheduled };
        });
        const fakeSetTimeout = global.setTimeout;
        vi.spyOn(global, 'setTimeout').mockImplementation(
            (callback, delay, ...args) => {
                const timer = fakeSetTimeout(callback, delay, ...args);
                backoffs
                    .find((backoff) => backoff.delay === delay)
                    ?.scheduled();
                return timer;
            },
        );
        const began = Date.now();
        const result = deploy([compiledExplore], options).then(
            () => null,
            (error: Error) => error,
        );
        await [500, 1000, 2000].reduce(async (previous, delay, index) => {
            await previous;
            await server.waitForRequest(4 + index);
            await backoffs[index].ready;
            expect(vi.getTimerCount()).toBe(1);
            expect(Date.now() - began).toBe([0, 500, 1500][index]);
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(server.requests.length).toBe(4 + index);
            await vi.advanceTimersByTimeAsync(1);
        }, Promise.resolve());
        const error = await result;
        expect(Date.now() - began).toBe(3500);
        if (exhausted) expect(error?.message).toBe('failure-3');
        else expect(error).toBeNull();
        await verify(
            get,
            [
                ...prefix,
                start,
                batch,
                batch,
                batch,
                batch,
                ...(exhausted ? [] : [finalize]),
            ],
            [
                ...uploading,
                ...[500, 1000, 2000].map(
                    (delay, index) =>
                        `  ⚠ Batch 1 failed (attempt ${index + 1}/4), retrying in ${delay}ms: ${index === 2 ? `request to ${server.url}${batch.path} failed, reason: socket hang up` : `failure-${index}`}`,
                ),
                ...(exhausted
                    ? []
                    : [
                          '  ✓ Batch 1 uploaded (1 explores)',
                          'Finalizing deploy...',
                          'Deploy completed! 1 explores deployed.',
                      ]),
            ],
        );
    },
    30_000,
);
it.each([400, 403])('never retries batch status %s', async (status) => {
    const { get, deploy, options } = await prepare();
    server.replies.push(
        { ...start, results: { deploySessionUuid: 'S' } },
        { ...batch, status, error: 'denied' },
    );
    await expect(deploy([compiledExplore], options)).rejects.toThrow('denied');
    await verify(get, [...prefix, start, batch], uploading);
});
it.each([404, 403])(
    'pins session status %s fallback policy',
    async (status) => {
        const { get, deploy, options } = await prepare();
        server.replies.push(
            { ...start, status, error: 'session unavailable' },
            ...(status === 404
                ? [{ ...legacy, results: { exploreCount: 1 } }]
                : []),
        );
        const result = deploy([compiledExplore], options);
        if (status === 404) await expect(result).resolves.toBeUndefined();
        else await expect(result).rejects.toThrow('session unavailable');
        await verify(
            get,
            [...prefix, start, ...(status === 404 ? [legacy] : [])],
            [
                ...opening,
                ...(status === 404
                    ? [
                          'Batched deploy is not supported by this server; falling back to legacy deploy',
                      ]
                    : []),
            ],
        );
    },
);
it.each([404, 403])(
    'pins model inventory status %s fallback policy',
    async (status) => {
        const { get, deploy, options } = await prepare();
        const inventory = request(
            'PUT',
            start.path,
            JSON.stringify({
                explores: [compiledExplore],
                dbtModelNames: ['orders'],
                complete: false,
            }),
        );
        server.replies.push(
            { ...inventory, status, error: 'inventory unavailable' },
            ...(status === 404
                ? [{ ...legacy, results: { exploreCount: 1 } }]
                : []),
        );
        const result = deploy([compiledExplore], {
            ...options,
            batchedDeploy: false,
            dbtModelNames: ['orders'],
        });
        if (status === 404) await expect(result).resolves.toBeUndefined();
        else await expect(result).rejects.toThrow('inventory unavailable');
        await verify(
            get,
            [...prefix, inventory, ...(status === 404 ? [legacy] : [])],
            status === 404
                ? [
                      'This server does not support deleted dbt model cleanup; deploying without cleanup. Upgrade the server to enable it.',
                  ]
                : [],
        );
    },
);
