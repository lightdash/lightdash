import { Option, type Command } from 'commander';
import {
    getAgentConnectionSelection,
    refuseAgentConnection,
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
            if (command.name() === 'status') options = ['name', 'json'];
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
        if (
            command.name() === 'login' ||
            (command.parent?.name() === 'agent' && command.name() === 'connect')
        )
            refuseAgentConnection(true);
        if (
            [
                'connect-snowflake',
                'export-chart-image',
                'download',
                'upload',
                'rename',
                'slug-update',
                'diagnostics',
                'preview',
                'start-preview',
                'stop-preview',
            ].includes(command.name()) ||
            (command.parent?.name() === 'apps' &&
                ['preview', 'create'].includes(command.name()))
        )
            refuseAgentConnection();
    });
};
