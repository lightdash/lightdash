import { Option, type Command } from 'commander';

export const registerAgentConnectionConnect = (
    command: Command,
    legacyHandler: (options: {
        verbose: boolean;
        project?: string;
        oauthPort?: number;
        timeout?: number;
    }) => Promise<void>,
): void => {
    command
        .addOption(
            new Option(
                '--name <slot>',
                'Name the agent connection slot',
            ).hideHelp(),
        )
        .addOption(
            new Option(
                '--capabilities <keys>',
                'Request these agent actions',
            ).hideHelp(),
        )
        .addOption(
            new Option(
                '--expires-in <duration>',
                'Request this connection lifetime',
            ).hideHelp(),
        )
        .addOption(
            new Option(
                '--connection',
                'Request an agent connection credential',
            ).hideHelp(),
        );
    command.on('option:project', (value: string) => {
        const previous: unknown = command.getOptionValue('connectionProjects');
        const projects = Array.isArray(previous)
            ? previous.filter(
                  (item): item is string => typeof item === 'string',
              )
            : [];
        command.setOptionValue('connectionProjects', [...projects, value]);
    });
    command.on('option:oauth-port', (value: string) =>
        command.setOptionValue('connectionOauthPort', value),
    );
    command.action(
        async (options: {
            verbose: boolean;
            project?: string;
            oauthPort?: number;
            timeout?: number;
            name?: string;
            capabilities?: string;
            expiresIn?: string;
            connection?: boolean;
            connectionProjects?: string[];
            connectionOauthPort?: string;
        }) => {
            if (
                options.name !== undefined ||
                options.capabilities !== undefined ||
                options.expiresIn !== undefined ||
                options.connection
            ) {
                const { agentConnectionConnectHandler } =
                    await import('./handlers/agentConnectionConnect');
                await agentConnectionConnectHandler({
                    verbose: options.verbose,
                    name: options.name,
                    capabilities: options.capabilities,
                    expiresIn: options.expiresIn,
                    projects: options.connectionProjects,
                    oauthPort: options.connectionOauthPort,
                    timeout: options.timeout,
                });
            } else {
                await legacyHandler(options);
            }
        },
    );
};
