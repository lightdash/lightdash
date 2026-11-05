import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import { getAgentConnectionSelection, resolveCredential } from '../credentials';
import GlobalState from '../globalState';
import * as styles from '../styles';

type GetProjectOptions = {
    verbose: boolean;
};

export const getProjectHandler = async (options: GetProjectOptions) => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);

    try {
        const config = await (getAgentConnectionSelection() === null
            ? getConfig()
            : getConfig({ readOnly: true }));

        if (getAgentConnectionSelection() !== null) {
            const credential = await resolveCredential(config);
            if (credential.kind !== 'agent_connection')
                throw new Error('An agent connection credential is required.');
            const { publicConnectionReport } =
                await import('../agentConnections/statusResponse');
            const { approvedProjects } = publicConnectionReport(
                credential.slot,
                [config.context?.apiKey, config.context?.proxyAuthorization],
            );
            GlobalState.debug(
                `> Agent connection: ${JSON.stringify({ name: credential.slot.name, approvedProjects })}`,
            );
            if (approvedProjects.length === 1) {
                const project = approvedProjects[0];
                console.error(styles.bold('\nCurrent project:\n'));
                console.error(`  Name: ${project.name ?? 'Name unavailable'}`);
                console.error(`  UUID: ${project.projectUuid}`);
                console.error('');
            } else {
                console.error(
                    `This connection is approved for ${approvedProjects.length} projects. Pass --project on the command.`,
                );
                for (const project of approvedProjects)
                    console.error(
                        `  ${project.name ?? 'Name unavailable'} (${project.projectUuid})`,
                    );
            }
            return;
        }
        const displayContext = config.context && {
            ...config.context,
            apiKey: config.context.apiKey
                ? '[redacted]'
                : config.context.apiKey,
            proxyAuthorization: config.context.proxyAuthorization
                ? '[redacted]'
                : config.context.proxyAuthorization,
        };
        GlobalState.debug(
            `> Config: ${JSON.stringify({ ...config, context: displayContext })}`,
        );

        const projectUuid = config.context?.project;
        const projectName = config.context?.projectName;

        if (!projectUuid) {
            console.error(
                styles.warning(
                    'No project set. Use `lightdash config set-project` to select a project.',
                ),
            );
        } else {
            console.error(styles.bold('\nCurrent project:\n'));
            console.error(`  Name: ${projectName || '(unknown)'}`);
            console.error(`  UUID: ${projectUuid}`);
            console.error('');
        }
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'get-project',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
