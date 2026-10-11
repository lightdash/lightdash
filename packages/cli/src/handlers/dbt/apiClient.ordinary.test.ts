import {
    AuthTokenPrefix,
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { CLI_VERSION } from '../../env';

const mocks = vi.hoisted(() => ({ home: '', fetch: vi.fn() }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => mocks.home,
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));

let configPath: string;
beforeEach(async () => {
    vi.resetModules();
    mocks.home = await fs.mkdtemp(path.join(tmpdir(), 'cli-ordinary-'));
    configPath = path.join(mocks.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    for (const name of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
        'CI',
    ])
        vi.stubEnv(name, undefined);
    mocks.fetch.mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', results: {} }),
    });
});
afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
});

it.each([
    ['ldpat_person', 'ApiKey'],
    ['legacy-person', 'ApiKey'],
    [`${AuthTokenPrefix.SERVICE_ACCOUNT}service`, 'Bearer'],
])(
    'preserves exact transport and config behaviour for %s',
    async (token, scheme) => {
        const contents = yaml.dump({
            user: { anonymousUuid: 'existing-anonymous' },
            context: {
                apiKey: token,
                serverUrl: 'https://example.com',
                proxyAuthorization: 'stored-proxy-ignored',
            },
        });
        await fs.writeFile(configPath, contents);
        const read = vi.spyOn(fs, 'readFile');
        const write = vi.spyOn(fs, 'writeFile');
        const { lightdashApi, lightdashRawApi } = await import('./apiClient');
        await lightdashApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        });
        await lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        });
        expect(mocks.fetch.mock.calls).toEqual(
            [0, 1].map(() => [
                'https://example.com/api/v1/user',
                {
                    method: 'GET',
                    body: undefined,
                    signal: undefined,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `${scheme} ${token}`,
                        [LightdashRequestMethodHeader]: RequestMethod.CLI,
                        [LightdashCliVersionHeader]: CLI_VERSION,
                    },
                },
            ]),
        );
        expect(read.mock.calls.map(([file]) => file)).toEqual([
            configPath,
            configPath,
        ]);
        expect(write).not.toHaveBeenCalled();
        expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
        expect(await fs.readdir(path.dirname(configPath))).toEqual([
            'config.yaml',
        ]);
    },
);

it('retains environment precedence and raw caller header precedence', async () => {
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: { anonymousUuid: 'existing' },
            context: {
                apiKey: 'stored-person',
                serverUrl: 'https://example.com',
            },
        }),
    );
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-person');
    vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', 'env-proxy');
    const { lightdashApi, lightdashRawApi } = await import('./apiClient');
    await lightdashApi({ method: 'GET', url: '/api/v1/user', body: undefined });
    await lightdashRawApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
        headers: { Authorization: 'caller-auth', Cookie: 'caller-cookie' },
    });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
        'ApiKey env-person',
    );
    expect(mocks.fetch.mock.calls[0][1].headers['Proxy-Authorization']).toBe(
        'env-proxy',
    );
    expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe(
        'caller-auth',
    );
    expect(mocks.fetch.mock.calls[1][1].headers.Cookie).toBe('caller-cookie');
});
