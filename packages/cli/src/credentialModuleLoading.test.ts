import { promises as fs } from 'fs';

const mocks = vi.hoisted(() => ({
    providerLoaded: vi.fn(),
    schemaLoaded: vi.fn(),
}));
vi.mock('./agentConnections/agentTokenProvider', () => {
    mocks.providerLoaded();
    throw new Error('Provider loaded on the ordinary path');
});
vi.mock('./agentConnections/schema', () => {
    mocks.schemaLoaded();
    throw new Error('Schema loaded on the ordinary path');
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});
it('loads ordinary header and transport helpers without the agent provider, schema or filesystem work', async () => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    const read = vi.spyOn(fs, 'readFile');
    const open = vi.spyOn(fs, 'open');
    const { getAuthHeader } = await import('./handlers/utils');
    await import('./handlers/dbt/apiClient');
    expect(getAuthHeader('ordinary-key')).toBe('ApiKey ordinary-key');
    expect(mocks.providerLoaded).not.toHaveBeenCalled();
    expect(mocks.schemaLoaded).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
});
