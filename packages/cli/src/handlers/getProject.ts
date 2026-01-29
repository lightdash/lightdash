import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';

type GetProjectOptions = {
    verbose: boolean;
};

export const getProjectHandler = async (options: GetProjectOptions) => {
    GlobalState.setVerbose(options.verbose);

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
        return;
    }

    console.error(styles.bold('\nCurrent project:\n'));
    console.error(`  Name: ${projectName || '(unknown)'}`);
    console.error(`  UUID: ${projectUuid}`);
    console.error('');
};
