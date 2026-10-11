import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { AgentTokenProvider } from './agentTokenProvider';
import { slotFixture } from './fixtures';
import { type AgentConnectionSlot } from './schema';
import { AgentConnectionStore } from './store';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));
let directory: string;
let store: AgentConnectionStore;
let slot: AgentConnectionSlot;
const response = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
});
const expiredAccess = () => {
    slot.tokens.accessTokenExpiresAt = new Date(
        Date.now() - 1000,
    ).toISOString();
};
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-token-'));
    store = new AgentConnectionStore(
        path.join(directory, 'agent-connections.yaml'),
    );
    slot = slotFixture();
    fetchMock.mockReset().mockImplementation(async (url: string) => {
        if (url.endsWith('/oauth/token'))
            return response({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                token_type: 'Bearer',
                expires_in: 3600,
                scope: 'read write',
            });
        if (url.endsWith('/user'))
            return response({
                status: 'ok',
                results: {
                    userUuid: slot.personUuid,
                    organizationUuid: slot.organizationUuid,
                },
            });
        return response({
            status: 'ok',
            results: {
                grantUuid: slot.grantUuid,
                name: slot.name,
                clientId: slot.clientId,
                approvedAt: slot.approvedAt,
                expiresAt: slot.grantExpiresAt,
                ...slot.lastReported,
            },
        });
    });
});
afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
});
it('two providers refresh once and use the committed generation', async () => {
    expiredAccess();
    await store.saveSlot(slot);
    const results = await Promise.all([
        new AgentTokenProvider(store).getToken(slot),
        new AgentTokenProvider(store).getToken(slot),
    ]);
    expect(results.map((s) => s.tokens.accessToken)).toEqual([
        'new-access',
        'new-access',
    ]);
    const requests = fetchMock.mock.calls.filter(([url]) =>
        url.endsWith('/oauth/token'),
    );
    expect(requests).toHaveLength(1);
    const form = new URLSearchParams(requests[0][1].body);
    expect(Object.fromEntries(form)).toEqual({
        grant_type: 'refresh_token',
        client_id: 'lightdash-cli',
        refresh_token: 'private-refresh',
        resource: slot.resource,
        scope: 'read write',
    });
    const saved = await store.readSlot(slot);
    expect(saved?.tokens).toMatchObject({
        generation: 2,
        refreshToken: 'new-refresh',
        refreshTokenExpiresAt: null,
    });
    expect(await fs.readdir(directory)).toEqual(['agent-connections.yaml']);
});
it('persists private intent and token-free journal before the request', async () => {
    expiredAccess();
    await store.saveSlot(slot);
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (...args) => {
        if (args[0].endsWith('/oauth/token')) {
            expect((await store.readSlot(slot))?.refreshState.kind).toBe(
                'in_progress',
            );
            const files = await fs.readdir(directory);
            const journal = files.find((file) => file.endsWith('.journal'))!;
            const contents = await fs.readFile(
                path.join(directory, journal),
                'utf8',
            );
            expect(contents).not.toContain('private-');
            expect(
                (await fs.stat(path.join(directory, journal))).mode % 0o1000,
            ).toBe(0o600);
        }
        return implementation(...args);
    });
    await new AgentTokenProvider(store).getToken(slot);
});
it.each(['lost', 'malformed', 'scope', 'identity', 'save'])(
    'never resends after a %s response or save failure and redacts errors',
    async (failure) => {
        expiredAccess();
        await store.saveSlot(slot);
        const implementation = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation(async (...args) => {
            if (args[0].endsWith('/oauth/token')) {
                if (failure === 'lost')
                    throw new Error('private-refresh private-access');
                if (failure === 'malformed')
                    return response({ access_token: 'private-access' });
                if (failure === 'scope')
                    return response({
                        access_token: 'new-access',
                        refresh_token: 'new-refresh',
                        token_type: 'Bearer',
                        expires_in: 3600,
                        scope: 'read write admin',
                    });
                if (failure === 'save')
                    vi.spyOn(fs, 'rename').mockRejectedValue(
                        new Error('private-refresh'),
                    );
            }
            if (failure === 'identity' && args[0].endsWith('/user'))
                return response({
                    status: 'ok',
                    results: {
                        userUuid: 'wrong',
                        organizationUuid: slot.organizationUuid,
                    },
                });
            return implementation(...args);
        });
        const error = await new AgentTokenProvider(store)
            .getToken(slot)
            .catch((e: Error) => e);
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).not.toMatch(/private-|new-access|new-refresh/);
        vi.restoreAllMocks();
        await expect(
            new AgentTokenProvider(store).getToken(slot),
        ).rejects.toThrow('Reconnect');
        expect(
            fetchMock.mock.calls.filter(([url]) =>
                url.endsWith('/oauth/token'),
            ),
        ).toHaveLength(1);
        expect((await store.readSlot(slot))?.refreshState.kind).toBe(
            'reconnect_required',
        );
    },
);
it('does not refresh an expired grant', async () => {
    slot.grantExpiresAt = new Date(Date.now() - 500).toISOString();
    expiredAccess();
    await store.saveSlot(slot);
    await expect(new AgentTokenProvider(store).getToken(slot)).rejects.toThrow(
        'expired',
    );
    expect(fetchMock).not.toHaveBeenCalled();
});
it('blocks an unfinished journal even when the state was overwritten', async () => {
    await store.saveSlot(slot);
    await store.withLock(async (locked) =>
        locked.writeJournal(slot, {
            grantUuid: slot.grantUuid,
            attemptUuid: '44444444-4444-4444-8444-444444444444',
            generation: 1,
        }),
    );
    await expect(new AgentTokenProvider(store).getToken(slot)).rejects.toThrow(
        'Reconnect',
    );
    expect(fetchMock).not.toHaveBeenCalled();
});
it('clears a completed journal only when both attempt and generation match', async () => {
    slot.tokens.generation = 2;
    slot.tokens.lastRefreshAttemptUuid = '44444444-4444-4444-8444-444444444444';
    await store.saveSlot(slot);
    await store.withLock(async (locked) =>
        locked.writeJournal(slot, {
            grantUuid: slot.grantUuid,
            attemptUuid: slot.tokens.lastRefreshAttemptUuid!,
            generation: 1,
        }),
    );
    expect(
        (await new AgentTokenProvider(store).getToken(slot)).tokens.generation,
    ).toBe(2);
    expect(
        fetchMock.mock.calls.filter(([url]) => url.endsWith('/oauth/token')),
    ).toHaveLength(0);
});
it('clips a short token lifetime and uses a conservative response clock', async () => {
    expiredAccess();
    await store.saveSlot(slot);
    const implementation = fetchMock.getMockImplementation()!;
    const before = Date.now();
    fetchMock.mockImplementation(async (...args) =>
        args[0].endsWith('/oauth/token')
            ? {
                  ...response({
                      access_token: 'new-access',
                      refresh_token: 'new-refresh',
                      token_type: 'Bearer',
                      expires_in: 10,
                      scope: 'write read',
                  }),
                  headers: {
                      get: () => new Date(before + 3_600_000).toUTCString(),
                  },
              }
            : implementation(...args),
    );
    const provider = new AgentTokenProvider(store);
    const result = await provider.getToken(slot);
    expect(Date.parse(result.tokens.accessTokenExpiresAt)).toBeLessThanOrEqual(
        Date.now() + 10_000,
    );
    await provider.getToken(slot);
    expect(
        fetchMock.mock.calls.filter(([url]) => url.endsWith('/oauth/token')),
    ).toHaveLength(1);
});
it('uses a newer generation after a 401 instead of refreshing again', async () => {
    slot.tokens.generation = 2;
    await store.saveSlot(slot);
    expect(
        (await new AgentTokenProvider(store).getToken(slot, 1)).tokens
            .generation,
    ).toBe(2);
    expect(
        fetchMock.mock.calls.filter(([url]) => url.endsWith('/oauth/token')),
    ).toHaveLength(0);
});

it.each(['personUuid', 'organizationUuid'] as const)(
    'does not share cached proof across %s',
    async (field) => {
        const provider = new AgentTokenProvider(store);
        await store.saveSlot(slot);
        await provider.getToken(slot);
        fetchMock.mockClear();
        slot = { ...slot, [field]: '44444444-4444-4444-8444-444444444444' };
        await store.saveSlot(slot);
        await provider.getToken(slot);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    },
);
it('uses the instance sub-path for refresh and both proofs', async () => {
    slot.instanceUrl = 'https://example.com/lightdash';
    slot.resource = slot.instanceUrl;
    expiredAccess();
    await store.saveSlot(slot);
    await new AgentTokenProvider(store).getToken(slot);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        'https://example.com/lightdash/api/v1/oauth/token',
        'https://example.com/lightdash/api/v1/user',
        `https://example.com/lightdash/api/v2/user/agent-connections/${slot.grantUuid}/status`,
    ]);
});

it.each(['selected', 'status', 'revoke'] as const)(
    'removes a different-grant journal under lock for %s',
    async (kind) => {
        await store.saveSlot(slot);
        await store.withLock((locked) =>
            locked.writeJournal(slot, {
                grantUuid: '55555555-5555-4555-8555-555555555555',
                attemptUuid: 'attempt',
                generation: 1,
            }),
        );
        const provider = new AgentTokenProvider(store);
        const result =
            kind === 'selected'
                ? await provider.getToken(slot)
                : await provider.getLifecycleToken(
                      slot,
                      {
                          kind,
                          grantUuid: slot.grantUuid,
                          generation: slot.tokens.generation,
                      },
                      null,
                      null,
                  );
        expect(result.grantUuid).toBe(slot.grantUuid);
        expect(
            (await fs.readdir(directory)).some((file) =>
                file.endsWith('.journal'),
            ),
        ).toBe(false);
        expect((await store.readSlot(slot))?.refreshState.kind).toBe('idle');
    },
);
it('keeps a journal without a grant UUID conservative', async () => {
    await store.saveSlot(slot);
    await store.withLock((locked) =>
        locked.writeJournal(slot, {
            grantUuid: slot.grantUuid,
            attemptUuid: 'attempt',
            generation: 1,
        }),
    );
    const journal = (await fs.readdir(directory)).find((file) =>
        file.endsWith('.journal'),
    )!;
    await fs.writeFile(
        path.join(directory, journal),
        JSON.stringify({ attemptUuid: 'attempt', generation: 1 }),
    );
    await expect(new AgentTokenProvider(store).getToken(slot)).rejects.toThrow(
        'Reconnect',
    );
    expect(fetchMock).not.toHaveBeenCalled();
});

it('retains reconnect behaviour when a same-grant journal cannot be read', async () => {
    await store.saveSlot(slot);
    await store.withLock((locked) =>
        locked.writeJournal(slot, {
            grantUuid: slot.grantUuid,
            attemptUuid: 'attempt',
            generation: 1,
        }),
    );
    const { chmod } = fs;
    vi.spyOn(fs, 'chmod').mockImplementation(async (...args) => {
        if (String(args[0]).endsWith('.journal'))
            throw new Error('unreadable journal');
        return chmod(...args);
    });
    await expect(new AgentTokenProvider(store).getToken(slot)).rejects.toThrow(
        'Reconnect',
    );
    expect((await store.readSlot(slot))?.refreshState.kind).toBe(
        'reconnect_required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
});
