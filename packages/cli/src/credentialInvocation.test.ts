import { Command } from 'commander';
import { registerAgentConnectionOption } from './agentConnectionOption';
import { slotFixture } from './agentConnections/fixtures';
import {
    getAgentConnectionSelection,
    runWithAgentConnectionSelection,
} from './credentials';
import { lightdashRawApi } from './handlers/dbt/apiClient';

const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    fetch: vi.fn(),
    token: vi.fn(),
}));
vi.mock('./config', () => ({ getConfig: mocks.config }));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('./agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
const slot = slotFixture();
const config = {
    context: { serverUrl: slot.instanceUrl, apiKey: 'ordinary-key' },
    user: {
        userUuid: slot.personUuid,
        organizationUuid: slot.organizationUuid,
    },
};
const request = () =>
    lightdashRawApi({ method: 'GET', url: '/api/v1/user', body: undefined });
const program = () => {
    const command = new Command();
    registerAgentConnectionOption(command);
    command.command('read').action(async () => {
        await request();
    });
    return command;
};
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    mocks.config.mockReset().mockResolvedValue(config);
    mocks.token.mockReset().mockResolvedValue(slot);
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => vi.unstubAllEnvs());
it('does not leak a selected action into a later direct handler call', async () => {
    await program().parseAsync(['read', '--agent-connection', slot.name], {
        from: 'user',
    });
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
    expect(getAgentConnectionSelection()).toBeNull();
});
it('clears the retained selection on a reused Commander program', async () => {
    const command = program();
    await command.parseAsync(['read', '--agent-connection', slot.name], {
        from: 'user',
    });
    await command.parseAsync(['read'], { from: 'user' });
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
});
it('keeps a selected invocation bound while an ordinary invocation completes during its await', async () => {
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
        resume = resolve;
    });
    mocks.config.mockImplementationOnce(async () => {
        await paused;
        return config;
    });
    const selected = program().parseAsync(
        ['read', '--agent-connection', slot.name],
        { from: 'user' },
    );
    await program().parseAsync(['read'], { from: 'user' });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
        'ApiKey ordinary-key',
    );
    resume();
    await selected;
    expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe(
        'Bearer private-access',
    );
});

it('does not leak between sequential direct handler invocations', async () => {
    await runWithAgentConnectionSelection(slot.name, request);
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
});
it('releases a failed invocation without leaking its selection', async () => {
    mocks.token.mockRejectedValueOnce(new Error('Connection unavailable'));
    const command = program();
    await expect(
        command.parseAsync(['read', '--agent-connection', slot.name], {
            from: 'user',
        }),
    ).rejects.toThrow('Connection unavailable');
    await request();
    await command.parseAsync(['read'], { from: 'user' });
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key', 'ApiKey ordinary-key']);
});
