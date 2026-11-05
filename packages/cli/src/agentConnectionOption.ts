import { Option, type Command } from 'commander';
import {
    agentCommandPath,
    assertAgentCommandAllowed,
} from './agentConnections/commandPolicy';
import {
    getAgentConnectionSelection,
    runWithParsedAgentConnectionSelection,
} from './credentials';

export const registerAgentConnectionOption = (
    program: Command,
    resetInvocation: () => void = () => {},
): void => {
    program.addOption(
        new Option(
            '--agent-connection <slot>',
            'Use an agent connection slot',
        ).hideHelp(),
    );
    const { parseAsync } = program;
    const parseWithContext: Command['parseAsync'] = function parseWithSelection(
        this: Command,
        ...args
    ) {
        this.setOptionValueWithSource('agentConnection', undefined, 'default');
        const agent = this.commands.find(
            (command) => command.name() === 'agent',
        );
        for (const command of agent?.commands ?? []) {
            let options: string[] = [];
            if (command.name() === 'connect')
                options = [
                    'name',
                    'capabilities',
                    'expiresIn',
                    'connection',
                    'connectionProjects',
                    'connectionOauthPort',
                ];
            else if (command.name() === 'status') options = ['name', 'json'];
            else if (command.name() === 'revoke')
                options = ['name', 'json', 'human'];
            for (const option of options)
                command.setOptionValueWithSource(option, undefined, 'default');
        }
        resetInvocation();
        const environmentSelection =
            process.env.LIGHTDASH_AGENT_CONNECTION ?? null;
        return runWithParsedAgentConnectionSelection(
            () => {
                const selection: unknown = this.opts().agentConnection;
                if (selection !== undefined && typeof selection !== 'string')
                    throw new Error('Invalid agent connection selection.');
                return selection ?? environmentSelection;
            },
            environmentSelection !== null ||
                (args[0] ?? process.argv).some((argument) =>
                    argument.startsWith('--agent-connection'),
                ),
            () => parseAsync.apply(this, args),
        );
    };
    Object.assign(program, { parseAsync: parseWithContext });
    program.hook('preAction', (_root, command) => {
        if (getAgentConnectionSelection() === null) return;
        assertAgentCommandAllowed(agentCommandPath(command), command.opts());
    });
};
