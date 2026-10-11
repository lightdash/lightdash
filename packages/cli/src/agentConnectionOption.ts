import { Option, type Command } from 'commander';
import {
    getAgentConnectionSelection,
    refuseAgentConnection,
    resetCredentialContext,
    setAgentConnectionSelection,
} from './credentials';

export const registerAgentConnectionOption = (program: Command): void => {
    program.addOption(
        new Option(
            '--agent-connection <slot>',
            'Use an agent connection slot',
        ).hideHelp(),
    );
    program.hook('preAction', (root, command) => {
        resetCredentialContext();
        const selection: unknown = root.opts().agentConnection;
        if (selection !== undefined && typeof selection !== 'string')
            throw new Error('Invalid agent connection selection.');
        setAgentConnectionSelection(selection ?? null);
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
            ].includes(command.name()) ||
            (command.parent?.name() === 'apps' &&
                ['preview', 'create'].includes(command.name()))
        )
            refuseAgentConnection();
    });
};
