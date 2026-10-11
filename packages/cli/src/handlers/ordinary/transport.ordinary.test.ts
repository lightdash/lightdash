import {
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
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
    'pins unrestricted future routes and missing identity=%s',
    async (missing) => {
        vi.stubEnv('CI', undefined);
        if (missing) delete config.user!.anonymousUuid;
        await saveConfig(location.home, config);
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { CLI_VERSION } = await import('../../env');
        const { lightdashRawApi } = await import('../dbt/apiClient');
        const trace = [
            request('GET', '/api/v9/future?projectUuids[]=other'),
            request('POST', '/api/v9/future', '{"sentinel":true}'),
        ];
        server.replies.push(
            ...trace.map((entry) => ({ ...entry, results: { okay: true } })),
        );
        await trace.reduce(async (previous, entry) => {
            await previous;
            await expect(
                lightdashRawApi({
                    method: entry.method as 'GET' | 'POST',
                    url: entry.path,
                    body: entry.body || undefined,
                }),
            ).resolves.toHaveProperty('status', 200);
        }, Promise.resolve());
        expect(server.requests).toEqual(trace);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[], []]);
        expect(
            server.headers.map((headers) => ({
                authorization: headers.authorization,
                contentType: headers['content-type'],
                requestMethod:
                    headers[LightdashRequestMethodHeader.toLowerCase()],
                version: headers[LightdashCliVersionHeader.toLowerCase()],
            })),
        ).toEqual(
            trace.map(() => ({
                authorization: 'ApiKey ldpat_pin',
                contentType: 'application/json',
                requestMethod: RequestMethod.CLI,
                version: CLI_VERSION,
            })),
        );
        expect(await fs.readFile(file, 'utf8')).toBe(
            yaml.dump({
                ...config,
                user: {
                    ...config.user,
                    anonymousUuid: missing
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
it.each([false, true])(
    'keeps original transport errors, nonJSON=%s',
    async (nonJSON) => {
        const configModule = await import('../../config');
        const get = vi.spyOn(configModule, 'getConfig');
        const { lightdashRawApi } = await import('../dbt/apiClient');
        const trace = request('GET', '/api/v9/future');
        server.replies.push({
            ...trace,
            status: 500,
            ...(nonJSON ? { raw: 'plain failure' } : { error: 'JSON failure' }),
        });
        await expect(
            lightdashRawApi({
                method: 'GET',
                url: trace.path,
                body: undefined,
            }),
        ).rejects.toThrow(
            nonJSON
                ? 'Received non-JSON response from server (status 500): plain failure'
                : 'JSON failure',
        );
        expect(server.requests).toEqual([trace]);
        server.expectComplete();
        expect(get.mock.calls).toEqual([[]]);
        expect(await fs.readFile(file, 'utf8')).toBe(before);
        expect(await fs.readdir(path.dirname(file))).toEqual(['config.yaml']);
        expect(console.error).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(process.exit).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    },
);
