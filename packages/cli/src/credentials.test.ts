import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { AgentTokenProvider } from './agentConnections/agentTokenProvider';
import { slotFixture } from './agentConnections/fixtures';
import { AgentConnectionStore } from './agentConnections/store';
import {
    getAgentConnectionSelection,
    resolveCredential,
    runWithAgentConnectionSelection,
} from './credentials';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));
let directory: string;
let store: AgentConnectionStore;
let provider: AgentTokenProvider;
let slot: ReturnType<typeof slotFixture>;
beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-credentials-'));
    store = new AgentConnectionStore(
        path.join(directory, 'agent-connections.yaml'),
    );
    provider = new AgentTokenProvider(store);
    slot = slotFixture();
    fetchMock.mockReset().mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => ({
            status: 'ok',
            results: url.endsWith('/user')
                ? {
                      userUuid: slot.personUuid,
                      organizationUuid: slot.organizationUuid,
                  }
                : {
                      ...slot.lastReported,
                      grantUuid: slot.grantUuid,
                      clientId: slot.clientId,
                      approvedAt: slot.approvedAt,
                      expiresAt: slot.grantExpiresAt,
                  },
        }),
    }));
});
afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
});
const config = () => ({
    user: {
        userUuid: slot.personUuid,
        organizationUuid: slot.organizationUuid,
    },
    context: { serverUrl: slot.instanceUrl, apiKey: 'stored-person' },
});
it('uses flag over env only within the invocation', () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'env');
    runWithAgentConnectionSelection('flag', () => {
        expect(getAgentConnectionSelection()).toBe('flag');
    });
    expect(getAgentConnectionSelection()).toBe('env');
});
it.each(['', ' ', '../slot'])(
    'rejects invalid explicit selections %j',
    (name) => {
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', name);
        expect(() => getAgentConnectionSelection()).toThrow('agent connection');
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', name);
        expect(() => getAgentConnectionSelection()).toThrow('agent connection');
    },
);
it('ignores both personal keys and always returns an agent Bearer credential', async () => {
    await store.saveSlot(slot);
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'default');
    vi.stubEnv('LIGHTDASH_API_KEY', 'env-person');
    const credential = await resolveCredential(config(), provider);
    expect(credential.kind).toBe('agent_connection');
    expect(credential.token).toBe('private-access');
    expect(
        fetchMock.mock.calls.every(
            ([, init]) =>
                init.headers.Authorization === 'Bearer private-access',
        ),
    ).toBe(true);
});
it.each([
    'missing',
    'expired',
    'revoked',
    'malformed',
    'mismatched',
    'reconnect_required',
    'unconfirmed',
])('fails %s slots before any request', async (state) => {
    if (state === 'expired') {
        slot.grantExpiresAt = new Date(Date.now() - 1000).toISOString();
        slot.tokens.accessTokenExpiresAt = slot.grantExpiresAt;
    }
    await store.saveSlot(slot);
    if (state === 'revoked')
        await store.withLock(async (locked) =>
            locked.saveSlot({
                ...slot,
                lastReported: { ...slot.lastReported, status: 'revoked' },
            }),
        );
    if (state === 'reconnect_required')
        await store.setRefreshState(slot, {
            kind: 'reconnect_required',
            since: new Date().toISOString(),
        });
    if (state === 'unconfirmed')
        await store.setRevokeState(slot, {
            kind: 'unconfirmed',
            attemptedAt: new Date().toISOString(),
        });
    if (state === 'malformed')
        await fs.writeFile(store.filePath, 'version: 999');
    vi.stubEnv(
        'LIGHTDASH_AGENT_CONNECTION',
        state === 'missing' ? 'missing' : 'default',
    );
    const current = config();
    if (state === 'mismatched')
        current.user.userUuid = '44444444-4444-4444-8444-444444444444';
    await expect(resolveCredential(current, provider)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
});
