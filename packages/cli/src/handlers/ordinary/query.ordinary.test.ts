import { QueryHistoryStatus } from '@lightdash/common';
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
vi.mock('../../analytics/analytics', async (original) => ({
    ...(await original<typeof import('../../analytics/analytics')>()),
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

it.each(['sql', 'chart', 'chart-no-output', 'sql-error', 'chart-error'])(
    'pins ordinary %s request, result and output',
    async (mode) => {
        const isSql = mode.startsWith('sql');
        const failed = mode.endsWith('error');
        const noOutput = mode === 'chart-no-output';
        const output = path.join(location.home, 'rows.csv');
        const chart = path.join(location.home, 'chart.yml');
        await fs.writeFile(
            chart,
            'name: Orders\ntableName: orders\nmetricQuery:\n  limit: 10\n',
        );
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { sqlHandler } = await import('../sql');
        const { runChartHandler } = await import('../runChart');
        const base = `/api/v2/projects/${config.context!.project}/query`;
        const trace = [
            request(
                'POST',
                `${base}/${isSql ? 'sql' : 'metric-query'}`,
                JSON.stringify(
                    isSql
                        ? { sql: 'select 1', limit: 50000, context: 'cli' }
                        : {
                              query: { exploreName: 'orders', limit: 10 },
                              context: 'cli',
                          },
                ),
            ),
            request('GET', `${base}/q${noOutput ? '' : '?pageSize=500'}`),
        ];
        server.replies.push(
            { ...trace[0], results: { queryUuid: 'q' } },
            {
                ...trace[1],
                results: {
                    status: failed
                        ? QueryHistoryStatus.ERROR
                        : QueryHistoryStatus.READY,
                    error: failed ? 'fixture failed' : null,
                    columns: { n: {} },
                    rows: [{ n: { value: { raw: 1 } } }],
                    metadata: { performance: { initialQueryExecutionMs: 0 } },
                },
            },
        );
        let stderr = '';
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            stderr += String(chunk);
            return true;
        });
        const execution = isSql
            ? sqlHandler('select 1', { output })
            : runChartHandler({
                  path: chart,
                  output: noOutput ? undefined : output,
              });
        if (failed) await expect(execution).rejects.toThrow('fixture failed');
        else await expect(execution).resolves.toBeUndefined();
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[], [], []]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        if (failed || noOutput)
            await expect(fs.stat(output)).rejects.toMatchObject({
                code: 'ENOENT',
            });
        else expect(await fs.readFile(output, 'utf8')).toBe('n\n1');
        expect(stderr).toBe(
            `${isSql ? '- Submitting SQL query...\n' : "- Executing query for 'Orders'...\n"}${(() => {
                if (failed) {
                    return isSql
                        ? '✖ Query failed\n'
                        : "✖ Query failed for 'Orders'\n Make sure all semantic layer fields referenced in the metric query (dimensions, metrics, custom dimensions, etc.) are deployed to the Lightdash project.\n";
                }
                if (noOutput) {
                    return "✔ Success! 'Orders' query succeeded\n";
                }
                return `✔ Success! Wrote 1 rows to ${output}\n`;
            })()}`,
        );
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
