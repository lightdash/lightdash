import {
    AuthorizationError,
    LightdashError,
    type DataAppCode,
} from '@lightdash/common';
import * as path from 'path';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { lightdashApi } from '../dbt/apiClient';
import { selectProject } from '../selectProject';
import { writeBundleToDir } from './appCodeFiles';

export type AppsDownloadHandlerOptions = {
    verbose: boolean;
    path?: string;
    project?: string;
    appVersion?: string;
};

export const appsDownloadHandler = async (
    appUuid: string,
    options: AppsDownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectSelection = await selectProject(config, options.project);
    if (!projectSelection) {
        throw new LightdashError({
            message: 'No project selected. Run lightdash config set-project',
            name: 'Not Found',
            statusCode: 404,
            data: {},
        });
    }
    const { projectUuid } = projectSelection;

    const targetDir = options.path ?? path.join(process.cwd(), appUuid);

    const spinner = GlobalState.startSpinner(`Downloading app ${appUuid}`);

    try {
        const versionQuery = options.appVersion
            ? `?version=${options.appVersion}`
            : '';

        const code = await lightdashApi<DataAppCode>({
            method: 'GET',
            url: `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/code${versionQuery}`,
            body: undefined,
        });

        await writeBundleToDir(targetDir, code);

        spinner.succeed(
            `App downloaded to ${targetDir} (version ${code.manifest.version})`,
        );
    } catch (err) {
        spinner.fail(`Failed to download app`);
        if (err instanceof LightdashError && err.statusCode === 404) {
            GlobalState.log(
                styles.error(
                    `App not found or data apps are not enabled on this instance.`,
                ),
            );
        }
        throw err;
    }
};
