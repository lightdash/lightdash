import { Command } from 'commander';
import { registerAgentConnectionOption } from './agentConnectionOption';
import {
    getAgentConnectionSelection,
    resetCredentialContext,
} from './credentials';

afterEach(() => {
    resetCredentialContext();
    vi.unstubAllEnvs();
});
it.each([
    ['--agent-connection', 'flag', 'read'],
    ['read', '--agent-connection', 'flag'],
])('selects the global flag before the handler: %j', async (...args) => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'env');
    const command = new Command();
    registerAgentConnectionOption(command);
    let selected: string | null = null;
    command.command('read').action(() => {
        selected = getAgentConnectionSelection();
    });
    await command.parseAsync(args, { from: 'user' });
    expect(selected).toBe('flag');
});
it.each([['login'], ['agent', 'connect']])(
    'refuses personal-only commands before their handlers: %j',
    async (...route) => {
        vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', 'default');
        const command = new Command();
        registerAgentConnectionOption(command);
        const handler = vi.fn();
        if (route.length === 1) command.command('login').action(handler);
        else command.command('agent').command('connect').action(handler);
        await expect(
            command.parseAsync(route, { from: 'user' }),
        ).rejects.toThrow('This command requires your personal CLI login.');
        expect(handler).not.toHaveBeenCalled();
    },
);
it('rejects an empty selection before the handler', async () => {
    const command = new Command();
    registerAgentConnectionOption(command);
    const handler = vi.fn();
    command.command('read').action(handler);
    await expect(
        command.parseAsync(['read', '--agent-connection', ''], {
            from: 'user',
        }),
    ).rejects.toThrow('agent connection');
    expect(handler).not.toHaveBeenCalled();
});

it.each([
    ['apps', 'preview'],
    ['apps', 'create'],
    ['connect-snowflake'],
    ['export-chart-image'],
    ['download'],
    ['upload'],
    ['rename'],
    ['slug-update'],
    ['diagnostics'],
])('refuses unreviewed command %j before its action', async (...route) => {
    const command = new Command();
    registerAgentConnectionOption(command);
    const handler = vi.fn();
    const parent = route.length === 2 ? command.command(route[0]) : command;
    parent.command(route[route.length - 1]).action(handler);
    await expect(
        command.parseAsync(['--agent-connection', 'selected', ...route], {
            from: 'user',
        }),
    ).rejects.toThrow(
        'This command is not available with an agent connection yet.',
    );
    expect(handler).not.toHaveBeenCalled();
});

it.each([
    ['login'],
    ['agent', 'connect'],
    ['apps', 'preview'],
    ['apps', 'create'],
    ['connect-snowflake'],
    ['export-chart-image'],
    ['download'],
    ['upload'],
    ['rename'],
    ['slug-update'],
    ['diagnostics'],
])('keeps ordinary %j registration unchanged', async (...route) => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    const command = new Command();
    registerAgentConnectionOption(command);
    const handler = vi.fn();
    const parent = route.length === 2 ? command.command(route[0]) : command;
    parent.command(route[route.length - 1]).action(handler);
    await command.parseAsync(route, { from: 'user' });
    expect(handler).toHaveBeenCalledOnce();
    expect(getAgentConnectionSelection()).toBeNull();
});
