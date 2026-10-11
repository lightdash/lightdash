import { slotFixture } from '../agentConnections/fixtures';
import { runWithAgentConnectionSelection } from '../credentials';
import GlobalState from '../globalState';
import { getProjectHandler } from './getProject';

const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    token: vi.fn(),
    track: vi.fn(),
}));
vi.mock('../config', () => ({ getConfig: mocks.config }));
vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: mocks.track },
}));
vi.mock('../agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
const slot = slotFixture();
const config = {
    context: {
        serverUrl: slot.instanceUrl,
        apiKey: 'person-secret',
        proxyAuthorization: 'proxy-secret',
        project: 'project',
        projectName: 'Demo',
    },
    user: {
        userUuid: slot.personUuid,
        organizationUuid: slot.organizationUuid,
    },
};
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    mocks.config.mockReset().mockResolvedValue(config);
    mocks.token.mockReset().mockResolvedValue(slot);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(GlobalState, 'debug');
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    GlobalState.setVerbose(false);
});
it('pins ordinary verbose config output without credential resolution', async () => {
    await getProjectHandler({ verbose: true });
    expect(GlobalState.debug).toHaveBeenCalledExactlyOnceWith(
        `> Config: ${JSON.stringify(config)}`,
    );
    expect(mocks.token).not.toHaveBeenCalled();
});
it('redacts human and proxy credentials only for the selected output without mutating config', async () => {
    await runWithAgentConnectionSelection(slot.name, () =>
        getProjectHandler({ verbose: true }),
    );
    expect(mocks.token).toHaveBeenCalledOnce();
    expect(GlobalState.debug).toHaveBeenCalledExactlyOnceWith(
        `> Agent connection: ${JSON.stringify({ name: slot.name, approvedProjects: slot.lastReported.approvedProjects })}`,
    );
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const value of [
        'person-secret',
        'proxy-secret',
        slot.tokens.accessToken,
        slot.tokens.refreshToken,
        'Bearer ',
        'ApiKey ',
    ])
        expect(output).not.toContain(value);
    expect(config.context.apiKey).toBe('person-secret');
    expect(config.context.proxyAuthorization).toBe('proxy-secret');
});
it('rejects a missing selection before verbose config output', async () => {
    mocks.token.mockRejectedValue(new Error('No agent connection credential.'));
    await expect(
        runWithAgentConnectionSelection('missing', () =>
            getProjectHandler({ verbose: true }),
        ),
    ).rejects.toThrow('No agent connection credential');
    expect(GlobalState.debug).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
});
