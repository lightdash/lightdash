import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { CLI_VERSION } from '../env';
import { loginFixture } from '../personalLogin/fixtures';

const mocks = vi.hoisted(() => ({
    home: '',
    fetch: vi.fn(),
    openBrowser: vi.fn(),
}));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => mocks.home,
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('./login/oauth', () => ({ openBrowser: mocks.openBrowser }));
vi.mock('./dbt/apiClient', () => ({ checkLightdashVersion: vi.fn() }));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn(), identify: vi.fn() },
}));
vi.mock('./setProject', () => ({
    setFirstProject: vi.fn(),
    setProjectCommand: vi.fn(),
}));
let configPath: string;
const instance = 'https://example.com';
beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_API_KEY', undefined);
    vi.stubEnv('LIGHTDASH_CLI_EMAIL', undefined);
    vi.stubEnv('LIGHTDASH_CLI_PASSWORD', undefined);
    mocks.home = await fs.mkdtemp(path.join(tmpdir(), 'oauth-login-'));
    configPath = path.join(mocks.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: { anonymousUuid: 'existing' },
            context: { serverUrl: instance, apiKey: 'old-pat' },
        }),
    );
    mocks.openBrowser
        .mockReset()
        .mockImplementation(async (authUrl: string) => {
            const params = new URL(authUrl).searchParams;
            expect(params.has('resource')).toBe(false);
            const callback = new URL(params.get('redirect_uri')!);
            callback.searchParams.set('code', 'auth-code');
            callback.searchParams.set('state', params.get('state')!);
            await fetch(callback);
            return true;
        });
    mocks.fetch.mockReset().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () =>
            url.endsWith('/oauth/token')
                ? {
                      access_token: 'oauth-access',
                      refresh_token: 'oauth-refresh',
                      token_type: 'Bearer',
                      expires_in: 3600,
                      scope: 'read write',
                      session_expires_in: 300,
                  }
                : {
                      results: {
                          userUuid: loginFixture().personUuid,
                          organizationUuid: loginFixture().organizationUuid,
                      },
                  },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
});
it('exchanges a token without a resource parameter with a user agent and saves OAuth tokens without minting a PAT', async () => {
    const { loginWithOauth } = await import('./oauthLogin');
    const startedAt = Date.now();
    const result = await loginWithOauth(instance);
    expect(result).toEqual({
        userUuid: loginFixture().personUuid,
        organizationUuid: loginFixture().organizationUuid,
        credential: 'personal_oauth',
    });
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
        `${instance}/api/v1/oauth/token`,
        `${instance}/api/v1/user`,
    ]);
    const exchange = mocks.fetch.mock.calls[0][1];
    expect(exchange.headers['User-Agent']).toBe(`lightdash-cli/${CLI_VERSION}`);
    expect(Object.fromEntries(exchange.body)).toEqual(
        expect.objectContaining({
            client_id: 'lightdash-cli',
            grant_type: 'authorization_code',
            code: 'auth-code',
        }),
    );
    expect(exchange.body.has('resource')).toBe(false);
    expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe(
        'Bearer oauth-access',
    );
    const { PersonalLoginStore } = await import('../personalLogin/store');
    const saved = await new PersonalLoginStore().read(instance);
    expect(saved?.tokens.accessToken).toBe('oauth-access');
    expect(saved?.tokens.refreshToken).toBe('oauth-refresh');
    expect(saved?.tokens.accessTokenExpiresAt).toBe(saved?.sessionExpiresAt);
    expect(Date.parse(saved!.sessionExpiresAt)).toBeGreaterThanOrEqual(
        startedAt + 300_000,
    );
});
it('removes the saved API key from context on browser login while preserving the env override warning', async () => {
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-wins');
    const { login } = await import('./login');
    await login(instance, { verbose: false, project: 'project' });
    const stored = yaml.load(await fs.readFile(configPath, 'utf8')) as {
        context: { apiKey?: string; serverUrl: string };
    };
    expect(stored.context).toEqual({ serverUrl: instance });
    expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('LIGHTDASH_API_KEY is still set'),
    );
    const { getConfig } = await import('../config');
    expect((await getConfig()).context?.apiKey).toBe('env-wins');
});
it.each([instance, 'http://internal.example:8080'])(
    'replaces the OAuth record with an explicit token at %s',
    async (targetInstance) => {
        const { PersonalLoginStore } = await import('../personalLogin/store');
        const store = new PersonalLoginStore();
        await store.save(targetInstance, loginFixture());
        const { login } = await import('./login');
        await login(targetInstance, {
            verbose: false,
            token: 'explicit-pat',
            project: 'project',
        });
        expect(await store.read(targetInstance)).toBeNull();
        const stored = yaml.load(await fs.readFile(configPath, 'utf8')) as {
            context: { apiKey: string };
        };
        expect(stored.context.apiKey).toBe('explicit-pat');
    },
);
it.each([instance, 'http://internal.example:8080'])(
    'replaces the OAuth record with a cookie-backed PAT at %s',
    async (targetInstance) => {
        vi.stubEnv('LIGHTDASH_CLI_PASSWORD', 'password');
        const { PersonalLoginStore } = await import('../personalLogin/store');
        const store = new PersonalLoginStore();
        await store.save(targetInstance, loginFixture());
        mocks.fetch.mockImplementation(async (url: string) => ({
            ok: true,
            status: 200,
            headers: { get: () => 'session=cookie' },
            json: async () =>
                url.endsWith('/personal-access-tokens')
                    ? { results: { token: 'email-pat' } }
                    : {
                          results: {
                              userUuid: loginFixture().personUuid,
                              organizationUuid: loginFixture().organizationUuid,
                          },
                      },
        }));
        const { login } = await import('./login');
        await login(targetInstance, {
            verbose: false,
            email: 'person@example.com',
            project: 'project',
        });
        const pat = mocks.fetch.mock.calls.find(([url]) =>
            url.endsWith('/personal-access-tokens'),
        )!;
        expect(pat[1].headers).toEqual(
            expect.objectContaining({
                Cookie: 'session=cookie',
                'User-Agent': `lightdash-cli/${CLI_VERSION}`,
            }),
        );
        expect(await store.read(targetInstance)).toBeNull();
    },
);

it('exchanges browser login tokens over HTTP on an internal host', async () => {
    const targetInstance = 'http://internal.example:8080';
    const { loginWithOauth } = await import('./oauthLogin');
    await loginWithOauth(targetInstance);
    expect(mocks.openBrowser).toHaveBeenCalledWith(
        expect.stringContaining(`${targetInstance}/api/v1/oauth/authorize?`),
    );
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
        `${targetInstance}/api/v1/oauth/token`,
        `${targetInstance}/api/v1/user`,
    ]);
    const { PersonalLoginStore } = await import('../personalLogin/store');
    expect(await new PersonalLoginStore().read(targetInstance)).not.toBeNull();
});

it.each(['token', 'user'])(
    'uses a fixed error for malformed %s JSON without exposing the response',
    async (endpoint) => {
        const validResponse = mocks.fetch.getMockImplementation()!;
        mocks.fetch.mockImplementation(async (url: string) => {
            if (url.endsWith(endpoint === 'token' ? '/oauth/token' : '/user'))
                return {
                    ok: true,
                    headers: { get: () => null },
                    json: async () => {
                        throw new Error('private response content');
                    },
                };
            return validResponse(url);
        });
        const { loginWithOauth } = await import('./oauthLogin');
        await expect(loginWithOauth(instance)).rejects.toThrow(
            endpoint === 'token'
                ? 'The server returned an invalid token response. No login was saved.'
                : 'The server returned invalid user information. No login was saved.',
        );
        const { PersonalLoginStore } = await import('../personalLogin/store');
        expect(await new PersonalLoginStore().read(instance)).toBeNull();
        expect(console.error).not.toHaveBeenCalledWith(
            expect.stringContaining('private response content'),
        );
    },
);
