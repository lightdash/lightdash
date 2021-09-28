import getPort from 'get-port';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    ProjectType,
} from 'common';
import { ProjectAdapter } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { DbtRemoteProjectAdapter } from './dbtRemoteProjectAdapter';
import { DbtCloudIdeProjectAdapter } from './dbtCloudIdeProjectAdapter';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { DbtGitlabProjectAdapter } from './dbtGitlabProjectAdapter';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import { UnexpectedServerError } from '../errors';

export const projectAdapterFromConfig = async (
    config: DbtProjectConfig,
    warehouseCredentials?: CreateWarehouseCredentials,
): Promise<ProjectAdapter> => {
    const configType = config.type;
    switch (config.type) {
        case ProjectType.DBT:
            if (warehouseCredentials !== undefined) {
                return new DbtLocalCredentialsProjectAdapter({
                    projectDir: config.project_dir,
                    warehouseCredentials,
                    port: await getPort({ port: config.rpc_server_port }),
                });
            }
            if (config.profiles_dir !== undefined) {
                return new DbtLocalProjectAdapter({
                    projectDir: config.project_dir,
                    profilesDir: config.profiles_dir,
                    port: await getPort({ port: config.rpc_server_port }),
                    target: config.target,
                });
            }
            throw new UnexpectedServerError(
                'Could not find valid warehouse credentials. No profiles directory or warehouse credentials specified for project.',
            );
        case ProjectType.DBT_REMOTE_SERVER:
            return new DbtRemoteProjectAdapter({
                host: config.rpc_server_host,
                port: config.rpc_server_port,
            });
        case ProjectType.DBT_CLOUD_IDE:
            return new DbtCloudIdeProjectAdapter({
                accountId: `${config.account_id}`,
                environmentId: `${config.environment_id}`,
                projectId: `${config.project_id}`,
                apiKey: config.api_key,
            });
        case ProjectType.GITHUB:
            if (warehouseCredentials === undefined) {
                throw new UnexpectedServerError(
                    'Warehouse credentials must be provided to connect to your dbt project on github',
                );
            }
            return new DbtGithubProjectAdapter({
                githubPersonalAccessToken: config.personal_access_token,
                githubRepository: config.repository,
                githubBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                port: await getPort({ port: config.rpc_server_port }),
            });
        case ProjectType.GITLAB:
            if (warehouseCredentials === undefined) {
                throw new UnexpectedServerError(
                    'Warehouse credentials must be provided to connect to your dbt project on gitlab',
                );
            }
            return new DbtGitlabProjectAdapter({
                gitlabPersonalAccessToken: config.personal_access_token,
                gitlabRepository: config.repository,
                gitlabBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                port: await getPort({ port: config.rpc_server_port }),
            });
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
