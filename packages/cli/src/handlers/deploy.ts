import { AuthorizationError } from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/analytics';
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
export const deploy = async (options: DeployArgs): Promise<void> => {
    const explores = await compile(options);
    await lightdashApi<undefined>({
        method: 'PUT',
        url: `/api/v1/projects/${options.projectUuid}/explores`,
        body: JSON.stringify(explores),
    });
    LightdashAnalytics.track({
        event: 'deploy.triggered',
        properties: {
            projectId: options.projectUuid,
        },
    });
};

export const deployHandler = async (options: DeployHandlerOptions) => {
    const config = await getConfig();
    if (!(config.context?.project && config.context.serverUrl)) {
        throw new AuthorizationError(
            `No active Lightdash project. Run 'lightdash login --help'`,
        );
    }
    await deploy({ ...options, projectUuid: config.context.project });
    console.error(`${styles.bold('Successfully deployed project:')}`);
    console.error('');
    console.error(
        `      ${styles.bold(
            `⚡️ ${config.context.serverUrl}/projects/${config.context.project}/tables`,
        )}`,
    );
    console.error('');
};
