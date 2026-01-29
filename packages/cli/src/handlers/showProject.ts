import { AuthorizationError } from '@lightdash/common';
import { getConfig, setProject } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion } from './dbt/apiClient';
import { getProject } from './dbt/refresh';

type ShowProjectHandlerOptions = {
    verbose: boolean;
};

export const showProjectHandler = async (
    options: ShowProjectHandlerOptions,
) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const config = await getConfig();

    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const { project: projectUuid, serverUrl } = config.context;

    if (!projectUuid) {
        console.error(styles.warning('No active project configured.'));
        console.error('');
        console.error('To set an active project, run:');
        console.error(`  ${styles.bold('lightdash config set-project')}`);
        console.error('');
        return;
    }

    try {
        // Fetch project details from the API to get the most up-to-date information
        const project = await getProject(projectUuid);

        console.error(styles.bold('Active Project:'));
        console.error('');
        console.error(`  Name: ${styles.success(project.name)}`);
        console.error(`  UUID: ${styles.secondary(projectUuid)}`);
        console.error(`  Type: ${styles.secondary(project.type)}`);
        console.error(
            `  URL:  ${styles.bold(`${serverUrl}/projects/${projectUuid}/home`)}`,
        );
        console.error('');

        // update project name in config
        await setProject(projectUuid, project.name);
    } catch (error) {
        // If API call fails, show what we have from config
        console.error(styles.bold('Active Project (from config):'));
        console.error('');
        console.error(`  UUID: ${styles.secondary(projectUuid)}`);
        console.error(
            `  URL:  ${styles.bold(`${serverUrl}/projects/${projectUuid}/home`)}`,
        );
        console.error('');

        if (error instanceof Error) {
            console.error(
                styles.warning(
                    `Warning: Unable to fetch current project details: ${error.message}`,
                ),
            );
        } else {
            console.error(
                styles.warning(
                    'Warning: Unable to fetch current project details from server',
                ),
            );
        }
        console.error('');
    }
};
