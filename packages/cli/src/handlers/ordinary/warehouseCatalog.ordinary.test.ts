import chalk from 'chalk';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
    OrdinaryServer,
    personalConfig,
    request,
    runOrdinaryCli,
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

it.each([false, true])(
    'pins catalogue refresh=%s with fields and CLI output',
    async (refresh) => {
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { warehouseCatalogHandler } = await import('../warehouseCatalog');
        const base = `/api/v1/projects/${config.context!.project}/sqlRunner`;
        const trace = [
            ...(refresh ? [request('POST', `${base}/refresh-catalog`)] : []),
            request('GET', `${base}/tables`),
            request(
                'GET',
                `${base}/fields?databaseName=db&schemaName=public&tableName=orders`,
            ),
        ];
        const replies = [
            ...(refresh ? [{ ...trace[0], results: null }] : []),
            {
                ...trace[refresh ? 1 : 0],
                results: { db: { public: { orders: {} } } },
            },
            { ...trace[refresh ? 2 : 1], results: { id: 'number' } },
        ];
        server.replies.push(...replies);
        const write = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        await expect(
            warehouseCatalogHandler({
                refresh,
                json: true,
                includeFields: true,
                database: 'db',
                schema: 'public',
                table: 'orders',
                verbose: false,
            }),
        ).resolves.toBeUndefined();
        const stdout = `${JSON.stringify({ tables: [{ database: 'db', schema: 'public', table: 'orders', fields: [{ name: 'id', type: 'number' }] }] }, null, 2)}\n`;
        expect(write.mock.calls).toEqual([[stdout]]);
        write.mockRestore();
        expect(get.mock.calls).toEqual(
            Array.from({ length: trace.length + 1 }, () => []),
        );
        server.replies.push(...replies);
        expect(
            await runOrdinaryCli(location.home, [
                'warehouse-catalog',
                '--json',
                '--include-fields',
                '--database',
                'db',
                '--schema',
                'public',
                '--table',
                'orders',
                ...(refresh ? ['--refresh'] : []),
            ]),
        ).toEqual({ code: 0, stdout, stderr: 'Done 🕶\n' });
        expect(server.requests).toEqual([...trace, ...trace]);
        server.expectComplete();
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
    30_000,
);
