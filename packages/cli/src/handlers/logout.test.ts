import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { CLI_VERSION } from '../env';
import { loginFixture } from '../personalLogin/fixtures';

const mocks = vi.hoisted(() => ({ home: '', fetch: vi.fn() }));
vi.mock('os', async (original) => ({
    ...(await original<typeof import('os')>()),
    homedir: () => mocks.home,
}));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
let configPath: string;
const instance = 'https://example.com';
beforeEach(async () => {
    vi.resetModules();
    mocks.home = await fs.mkdtemp(path.join(tmpdir(), 'logout-'));
    configPath = path.join(mocks.home, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: { anonymousUuid: 'existing' },
            context: { serverUrl: instance },
        }),
    );
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_API_KEY', undefined);
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
});
it('revokes the refresh token before the access token and deletes the record and journal under lock', async () => {
    const { PersonalLoginStore } = await import('../personalLogin/store');
    const store = new PersonalLoginStore();
    await store.save(instance, loginFixture());
    await store.withLock(async (locked) => {
        await locked.writeJournal(instance, {
            generation: 1,
            attemptUuid: '33333333-3333-4333-8333-333333333333',
        });
    });
    mocks.fetch.mockImplementation(async () => {
        expect(
            (await fs.readdir(path.dirname(configPath))).some((file) =>
                file.endsWith('.lock'),
            ),
        ).toBe(true);
        expect(await store.read(instance)).not.toBeNull();
        return { ok: true, status: 200 };
    });
    const { logout } = await import('./logout');
    await logout();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => Object.fromEntries(init.body)),
    ).toEqual([
        {
            token: 'personal-refresh',
            token_type_hint: 'refresh_token',
            client_id: 'lightdash-cli',
        },
        {
            token: 'personal-access',
            token_type_hint: 'access_token',
            client_id: 'lightdash-cli',
        },
    ]);
    expect(
        mocks.fetch.mock.calls.every(
            ([url, init]) =>
                url === `${instance}/api/v1/oauth/revoke` &&
                init.headers['User-Agent'] === `lightdash-cli/${CLI_VERSION}`,
        ),
    ).toBe(true);
    expect(await store.read(instance)).toBeNull();
    expect(await fs.readdir(path.dirname(configPath))).toEqual([
        'config.yaml',
        'personal-logins.yaml',
    ]);
    expect(console.error).toHaveBeenCalledWith(`Logged out of ${instance}`);
});
it('still deletes local credentials after a definite 4xx rejection', async () => {
    const { PersonalLoginStore } = await import('../personalLogin/store');
    const store = new PersonalLoginStore();
    await store.save(instance, loginFixture());
    mocks.fetch.mockResolvedValue({ ok: false, status: 400 });
    const { logout } = await import('./logout');
    await logout();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(await store.read(instance)).toBeNull();
});
it.each(['network', '5xx'])(
    'keeps the login for retry after %s',
    async (failure) => {
        const { PersonalLoginStore } = await import('../personalLogin/store');
        const store = new PersonalLoginStore();
        const login = loginFixture();
        await store.save(instance, login);
        if (failure === 'network')
            mocks.fetch.mockRejectedValue(new Error('offline'));
        else mocks.fetch.mockResolvedValue({ ok: false, status: 503 });
        const { logout, logoutUnreachable } = await import('./logout');
        await expect(logout()).rejects.toThrow(logoutUnreachable);
        expect(await store.read(instance)).toEqual(login);
    },
);
it('removes only the saved API key and explains that its PAT remains valid', async () => {
    await fs.writeFile(
        configPath,
        yaml.dump({
            user: { anonymousUuid: 'existing' },
            context: { serverUrl: instance, apiKey: 'pat', project: 'project' },
        }),
    );
    const { logout } = await import('./logout');
    await logout();
    const config = yaml.load(await fs.readFile(configPath, 'utf8')) as {
        context: object;
    };
    expect(config.context).toEqual({ serverUrl: instance, project: 'project' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('personal access token is not revoked'),
    );
});
it('refuses a selected agent connection before touching the login', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'selected');
    const { logout } = await import('./logout');
    await expect(logout()).rejects.toThrow('requires your personal CLI login');
    expect(mocks.fetch).not.toHaveBeenCalled();
});

it('keeps the login when access revocation fails after refresh revocation succeeds', async () => {
    const { PersonalLoginStore } = await import('../personalLogin/store');
    const store = new PersonalLoginStore();
    const login = loginFixture();
    await store.save(instance, login);
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { logout, logoutUnreachable } = await import('./logout');
    await expect(logout()).rejects.toThrow(logoutUnreachable);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(await store.read(instance)).toEqual(login);
});
it.each([null, 'saved-key', 'environment-key'])(
    'reports the environment key stays active when the saved key is %s',
    async (savedKey) => {
        vi.stubEnv('LIGHTDASH_API_KEY', 'environment-key');
        await fs.writeFile(
            configPath,
            yaml.dump({
                user: { anonymousUuid: 'existing' },
                context: {
                    serverUrl: instance,
                    ...(savedKey === null ? {} : { apiKey: savedKey }),
                },
            }),
        );
        const { logout } = await import('./logout');
        await logout();
        const { getRawConfig } = await import('../config');
        expect((await getRawConfig()).context?.apiKey).toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(
            'LIGHTDASH_API_KEY is set in the environment and stays active until unset.',
        );
        expect(console.error).not.toHaveBeenCalledWith(
            `Logged out of ${instance}`,
        );
        if (savedKey === null)
            expect(console.error).not.toHaveBeenCalledWith(
                expect.stringContaining('saved API key was removed'),
            );
        expect(
            vi.mocked(console.error).mock.calls.flat().join(' '),
        ).not.toContain('environment-key');
    },
);
