import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { CLI_VERSION } from '../env';
import { loginFixture } from './fixtures';
import { PersonalLoginStore } from './store';
import {
    freshLoginRequired,
    PersonalLoginTokenProvider,
    sessionExpired,
} from './tokenProvider';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));
const instance = 'https://example.com';
const reply = (
    body: unknown = {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
    },
) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
});
let directory: string;
let store: PersonalLoginStore;
let provider: PersonalLoginTokenProvider;
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'personal-provider-'));
    store = new PersonalLoginStore(
        path.join(directory, 'personal-logins.yaml'),
    );
    provider = new PersonalLoginTokenProvider(store);
    fetchMock.mockReset().mockResolvedValue(reply());
    vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', undefined);
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
});
const saveExpiring = async () => {
    const login = loginFixture();
    login.tokens.accessTokenIssuedAt = new Date(
        Date.now() - 3_550_000,
    ).toISOString();
    login.tokens.accessTokenExpiresAt = new Date(
        Date.now() + 50_000,
    ).toISOString();
    await store.save(instance, login);
};
it('fails without a saved login', async () => {
    await expect(provider.getToken(instance)).rejects.toThrow(
        "Not logged in. Run 'lightdash login --help'",
    );
    expect(fetchMock).not.toHaveBeenCalled();
});
it('reuses a token outside the early refresh window', async () => {
    const login = loginFixture();
    await store.save(instance, login);
    expect(await provider.getToken(instance)).toEqual(login);
    expect(fetchMock).not.toHaveBeenCalled();
});
it('uses a tenth of a short token lifetime as its early window', async () => {
    const login = loginFixture();
    login.tokens.accessTokenIssuedAt = new Date(
        Date.now() - 40_000,
    ).toISOString();
    login.tokens.accessTokenExpiresAt = new Date(
        Date.now() + 20_000,
    ).toISOString();
    await store.save(instance, login);
    await provider.getToken(instance);
    expect(fetchMock).not.toHaveBeenCalled();
});
it('refreshes inside the early window with a journal and public client request', async () => {
    await saveExpiring();
    fetchMock.mockImplementationOnce(async (_url, init) => {
        expect((await store.read(instance))?.refreshState.kind).toBe(
            'in_progress',
        );
        expect(
            (await fs.readdir(directory)).some((file) =>
                file.endsWith('.journal'),
            ),
        ).toBe(true);
        expect(Object.fromEntries(init.body)).toEqual({
            grant_type: 'refresh_token',
            client_id: 'lightdash-cli',
            refresh_token: 'personal-refresh',
            resource: instance,
            scope: 'read write',
        });
        expect(init.headers['User-Agent']).toBe(`lightdash-cli/${CLI_VERSION}`);
        return reply();
    });
    const login = await provider.getToken(instance);
    expect(login.tokens.generation).toBe(2);
    expect(login.tokens.refreshToken).toBe('new-refresh');
    expect(await fs.readdir(directory)).toEqual(['personal-logins.yaml']);
});
it('refreshes a rejected generation once and reuses a newer generation', async () => {
    await store.save(instance, loginFixture());
    await provider.getToken(instance, 1);
    await provider.getToken(instance, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('clips access and session expiry to the server date and remaining session', async () => {
    await saveExpiring();
    const started = Date.now();
    const date = new Date(started - 2000).toUTCString();
    fetchMock.mockResolvedValueOnce({
        ...reply({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'write read',
            session_expires_in: 120,
        }),
        headers: { get: () => date },
    });
    const login = await provider.getToken(instance);
    expect(login.sessionExpiresAt).toBe(
        new Date(Date.parse(date) + 120_000).toISOString(),
    );
    expect(login.tokens.accessTokenExpiresAt).toBe(login.sessionExpiresAt);
});
it.each([
    'timeout',
    'network',
    '500',
    'invalid body',
    'invalid_grant',
    'same refresh token',
])(
    'requires login after %s and never sends the old refresh token again',
    async (failure) => {
        await saveExpiring();
        if (failure === 'timeout' || failure === 'network')
            fetchMock.mockRejectedValueOnce(new Error(failure));
        else if (failure === '500' || failure === 'invalid_grant')
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: failure === '500' ? 500 : 400,
                json: async () => ({ error: 'invalid_grant' }),
            });
        else if (failure === 'same refresh token')
            fetchMock.mockResolvedValueOnce(
                reply({
                    access_token: 'new',
                    refresh_token: 'personal-refresh',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    scope: 'read write',
                }),
            );
        else fetchMock.mockResolvedValueOnce(reply({ access_token: 'new' }));
        await expect(provider.getToken(instance)).rejects.toThrow(
            freshLoginRequired,
        );
        expect((await store.read(instance))?.refreshState.kind).toBe(
            'login_required',
        );
        await expect(provider.getToken(instance)).rejects.toThrow(
            freshLoginRequired,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    },
);
it('refuses an expired session without a request', async () => {
    const login = loginFixture();
    login.sessionExpiresAt = new Date(Date.now() - 1000).toISOString();
    login.tokens.accessTokenExpiresAt = login.sessionExpiresAt;
    login.tokens.accessTokenIssuedAt = new Date(
        Date.now() - 3_600_000,
    ).toISOString();
    await store.save(instance, login);
    await expect(provider.getToken(instance)).rejects.toThrow(sessionExpired);
    expect(fetchMock).not.toHaveBeenCalled();
});
it('lets a concurrent caller wait for the lock and reuse the new token', async () => {
    await saveExpiring();
    let complete: (value: ReturnType<typeof reply>) => void = () => {};
    let enter = () => {};
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const response = new Promise<ReturnType<typeof reply>>((resolve) => {
        complete = resolve;
    });
    fetchMock.mockImplementationOnce(() => {
        enter();
        return response;
    });
    const first = provider.getToken(instance);
    await entered;
    const second = new PersonalLoginTokenProvider(
        new PersonalLoginStore(store.filePath),
    ).getToken(instance);
    complete(reply());
    const logins = await Promise.all([first, second]);
    expect(logins[0]).toEqual(logins[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(['pending', 'mismatched journal', 'corrupt journal'])(
    'refuses recovery from %s before sending a request',
    async (state) => {
        const login = loginFixture();
        if (state === 'pending')
            login.refreshState = {
                kind: 'in_progress',
                attemptUuid: randomUUID(),
                startedAt: new Date().toISOString(),
            };
        await store.save(instance, login);
        await store.withLock(async (locked) => {
            await locked.writeJournal(instance, {
                attemptUuid: randomUUID(),
                generation: 1,
            });
        });
        if (state === 'corrupt journal') {
            const journal = (await fs.readdir(directory)).find((name) =>
                name.endsWith('.journal'),
            )!;
            await fs.writeFile(path.join(directory, journal), '{');
        }
        await expect(provider.getToken(instance)).rejects.toThrow(
            freshLoginRequired,
        );
        expect((await store.read(instance))?.refreshState.kind).toBe(
            'login_required',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    },
);
it('clears a matching journal after a committed refresh', async () => {
    const login = loginFixture();
    login.tokens.generation = 2;
    login.tokens.lastRefreshAttemptUuid = randomUUID();
    await store.save(instance, login);
    await store.withLock(async (locked) => {
        await locked.writeJournal(instance, {
            attemptUuid: login.tokens.lastRefreshAttemptUuid!,
            generation: 1,
        });
    });
    await provider.getToken(instance);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual(['personal-logins.yaml']);
});
