import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';

type GetProjectOptions = {
    verbose: boolean;
};

export const getProjectHandler = async (options: GetProjectOptions) => {
    const startTime = Date.now();
    GlobalState.setVerbose(options.verbose);

    try {
        const config = await getConfig();

        GlobalState.debug(`> Config: ${JSON.stringify(config)}`);

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
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'get-project',
                durationMs: Date.now() - startTime,
            },
        });
    }
};
