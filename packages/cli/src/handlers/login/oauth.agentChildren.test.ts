import { slotFixture } from '../../agentConnections/fixtures';
import { runWithAgentConnectionSelection } from '../../credentials';
import { openBrowser } from './oauth';

const mocks = vi.hoisted(() => ({
    exec: vi.fn(),
    token: vi.fn(),
    config: vi.fn(),
}));
vi.mock('child_process', () => ({
    exec: (...args: unknown[]) => {
        const callback = args.pop() as (error: Error | null) => void;
        mocks.exec(...args);
        callback(null);
    },
}));
vi.mock('../../config', () => ({ getConfig: mocks.config }));
vi.mock('../../agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
const slot = slotFixture();
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.stubEnv('LIGHTDASH_API_KEY', 'human');
    mocks.exec.mockReset();
    mocks.token.mockReset().mockResolvedValue(slot);
    mocks.config.mockReset().mockResolvedValue({
        context: { serverUrl: slot.instanceUrl },
        user: {
            userUuid: slot.personUuid,
            organizationUuid: slot.organizationUuid,
        },
    });
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
it.each([
    ['darwin', 'open'],
    ['win32', 'start'],
    ['linux', 'xdg-open'],
])(
    'preserves ordinary %s args and filters selected children',
    async (platform, command) => {
        vi.stubGlobal('process', { ...process, platform });
        await openBrowser('https://example.com');
        expect(mocks.exec.mock.calls).toEqual([
            [`${command} "https://example.com"`],
        ]);
        expect(mocks.token).not.toHaveBeenCalled();
        mocks.exec.mockClear();
        mocks.exec.mockImplementation(() =>
            expect(mocks.token).toHaveBeenCalledOnce(),
        );
        await runWithAgentConnectionSelection(slot.name, () =>
            openBrowser('https://example.com'),
        );
        const { LIGHTDASH_API_KEY: _human, ...rest } = process.env;
        expect(mocks.exec.mock.calls).toEqual([
            [
                `${command} "https://example.com"`,
                { env: { ...rest, LIGHTDASH_AGENT_CONNECTION: slot.name } },
            ],
        ]);
    },
);
it('does not launch a browser with a missing connection', async () => {
    mocks.token.mockRejectedValue(new Error('No agent connection credential.'));
    await expect(
        runWithAgentConnectionSelection('missing', () =>
            openBrowser('https://example.com'),
        ),
    ).rejects.toThrow('No agent connection credential');
    expect(mocks.exec).not.toHaveBeenCalled();
});
