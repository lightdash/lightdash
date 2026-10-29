import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { Readable } from 'stream';
import { loginFixture } from '../../personalLogin/fixtures';

const mocks = vi.hoisted(() => ({ home: '', fetch: vi.fn() }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => mocks.home,
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
let configPath: string;
const instance = 'https://example.com';
const success = () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', results: {} }),
});
const rejected = () => ({
    ok: false,
    status: 401,
    body: new Readable({ read() {} }),
    headers: { get: () => 'application/json' },
    json: async () => ({
        error: {
            message: 'rejected',
            name: 'AuthorizationError',
            statusCode: 401,
            data: {},
        },
    }),
});
beforeEach(async () => {
    vi.resetModules();
    mocks.home = await fs.mkdtemp(path.join(tmpdir(), 'api-personal-'));
    configPath = path.join(mocks.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: { anonymousUuid: 'existing' },
            context: { serverUrl: instance },
        }),
    );
    for (const name of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'LIGHTDASH_API_TIMEOUT_MS',
    ])
        vi.stubEnv(name, undefined);
    mocks.fetch.mockReset().mockResolvedValue(success());
    const { PersonalLoginStore } = await import('../../personalLogin/store');
    await new PersonalLoginStore().save(instance, loginFixture());
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
});
it('sends a personal OAuth token as Bearer', async () => {
    const { lightdashRawApi } = await import('./apiClient');
    await lightdashRawApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
    });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
        'Bearer personal-access',
    );
});
it('destroys a rejected GET response, refreshes once and retries with the new token', async () => {
    const first = rejected();
    mocks.fetch
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                token_type: 'Bearer',
                expires_in: 3600,
                scope: 'read write',
            }),
        })
        .mockResolvedValueOnce(success());
    const { lightdashApi } = await import('./apiClient');
    await lightdashApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
        safeToRetry: true,
    });
    expect(first.body.destroyed).toBe(true);
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
        `${instance}/api/v1/user`,
        `${instance}/api/v1/oauth/token`,
        `${instance}/api/v1/user`,
    ]);
    expect(mocks.fetch.mock.calls[2][1].headers.Authorization).toBe(
        'Bearer new-access',
    );
});
it('does not retry a second rejected response', async () => {
    mocks.fetch
        .mockResolvedValueOnce(rejected())
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                token_type: 'Bearer',
                expires_in: 3600,
                scope: 'read write',
            }),
        })
        .mockResolvedValueOnce(rejected());
    const { lightdashRawApi } = await import('./apiClient');
    await expect(
        lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
            safeToRetry: true,
        }),
    ).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it.each([
    ['POST', true],
    ['GET', false],
] as const)(
    'does not retry %s with safeToRetry=%s',
    async (method, safeToRetry) => {
        mocks.fetch.mockResolvedValueOnce(rejected());
        const { lightdashRawApi } = await import('./apiClient');
        await expect(
            lightdashRawApi({
                method,
                url: '/api/v1/user',
                body: undefined,
                safeToRetry,
            }),
        ).rejects.toThrow();
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    },
);
it('keeps the environment API key above the saved OAuth login', async () => {
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-pat');
    const { lightdashRawApi } = await import('./apiClient');
    await lightdashRawApi({
        method: 'GET',
        url: '/api/v1/user',
        body: undefined,
    });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
        'ApiKey env-pat',
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
