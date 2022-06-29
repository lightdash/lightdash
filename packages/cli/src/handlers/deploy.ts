import { AuthorizationError } from '@lightdash/common';
import { getConfig } from '../config';
import * as styles from '../styles';
import { compile } from './compile';
import { lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';

type DeployHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
};

type DeployArgs = DeployHandlerOptions & {
    projectUuid: string;
};
export const deploy = async (
    options: DeployArgs,
    command: any,
): Promise<void> => {
    const explores = await compile(options, command);
    await lightdashApi<undefined>({
        method: 'PUT',
        url: `/api/v1/projects/${options.projectUuid}/explores`,
        body: JSON.stringify(explores),
    });
};

export const deployHandler = async (
    options: DeployHandlerOptions,
    command: any,
) => {
    const config = await getConfig();
    if (!(config.context?.project && config.context.serverUrl)) {
        throw new AuthorizationError(
            `No active Lightdash project. Run 'lightdash login --help'`,
        );
    }
    await deploy({ ...options, projectUuid: config.context.project }, command);
    console.error(`${styles.bold('Successfully deployed project:')}`);
    console.error('');
    console.error(
        `      ${styles.bold(
            `⚡️ ${config.context.serverUrl}/projects/${config.context.project}/tables`,
        )}`,
    );
    console.error('');
};
