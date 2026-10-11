import { Command } from 'commander';
import { registerAgentConnectionConnect } from './agentConnectionConnectOption';
import { registerAgentConnectionOption } from './agentConnectionOption';
import { agentConnectionConnectHandler } from './handlers/agentConnectionConnect';

vi.mock('./handlers/agentConnectionConnect', () => ({
    agentConnectionConnectHandler: vi.fn(),
}));
const program = () => {
    const root = new Command().exitOverride();
    registerAgentConnectionOption(root);
    const connect = root
        .command('agent')
        .command('connect')
        .option('--project <project>')
        .option('--oauth-port <port>', '', (value) => parseInt(value, 10))
        .option('--timeout <seconds>', '', Number, 180)
        .option('--verbose', '', false);
    const legacy = vi.fn();
    registerAgentConnectionConnect(connect, legacy);
    return { root, connect, legacy };
};
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
it.each([
    ['--name', 'work'],
    ['--capabilities', 'query'],
    ['--expires-in', '1h'],
    ['--connection'],
])('opts in with %j', async (...flags) => {
    const { root, legacy } = program();
    await root.parseAsync(['agent', 'connect', ...flags], { from: 'user' });
    expect(agentConnectionConnectHandler).toHaveBeenCalledTimes(1);
    expect(legacy).not.toHaveBeenCalled();
});
it('keeps last-value parsing on the old path and repeated values on the new path', async () => {
    const { root, legacy } = program();
    await root.parseAsync(
        ['agent', 'connect', '--project', 'one', '--project', 'two'],
        { from: 'user' },
    );
    expect(legacy).toHaveBeenLastCalledWith(
        expect.objectContaining({ project: 'two' }),
    );
    await root.parseAsync(
        [
            'agent',
            'connect',
            '--connection',
            '--project',
            'three',
            '--project',
            'four',
        ],
        { from: 'user' },
    );
    expect(agentConnectionConnectHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ projects: ['three', 'four'] }),
    );
    await root.parseAsync(['agent', 'connect', '--connection'], {
        from: 'user',
    });
    expect(agentConnectionConnectHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ projects: undefined }),
    );
});
it('resets every new option before the next parse and retains old option values', async () => {
    const { root, legacy, connect } = program();
    await root.parseAsync(
        [
            'agent',
            'connect',
            '--name',
            'work',
            '--capabilities',
            'query',
            '--expires-in',
            '1h',
            '--connection',
            '--project',
            'one',
            '--oauth-port',
            '4321suffix',
            '--verbose',
        ],
        { from: 'user' },
    );
    expect(agentConnectionConnectHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ oauthPort: '4321suffix' }),
    );
    await root.parseAsync(['agent', 'connect'], { from: 'user' });
    expect(agentConnectionConnectHandler).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenLastCalledWith(
        expect.objectContaining({
            project: 'one',
            oauthPort: 4321,
            verbose: true,
        }),
    );
    for (const key of [
        'name',
        'capabilities',
        'expiresIn',
        'connection',
        'connectionProjects',
        'connectionOauthPort',
    ])
        expect(connect.getOptionValue(key)).toBeUndefined();
});
