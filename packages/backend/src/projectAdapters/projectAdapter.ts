import { DbtProjectConfig, ProjectType } from '../config/parseConfig';
import { ProjectAdapter } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { DbtRemoteProjectAdapter } from './dbtRemoteProjectAdapter';
import { DbtCloudIdeProjectAdapter } from './dbtCloudIdeProjectAdapter';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { DbtGitlabProjectAdapter } from './dbtGitlabProjectAdapter';

export const projectAdapterFromConfig = (
    config: DbtProjectConfig,
): ProjectAdapter => {
    const configType = config.type;
    switch (config.type) {
        case ProjectType.DBT:
            return new DbtLocalProjectAdapter(
                config.project_dir,
                config.profiles_dir,
                config.rpc_server_port,
                config.target,
            );
        case ProjectType.DBT_REMOTE_SERVER:
            return new DbtRemoteProjectAdapter(
                config.rpc_server_host,
                config.rpc_server_port,
            );
        case ProjectType.DBT_CLOUD_IDE:
            return new DbtCloudIdeProjectAdapter(
                `${config.account_id}`,
                `${config.environment_id}`,
                `${config.project_id}`,
                config.api_key,
            );
        case ProjectType.GITHUB:
            return new DbtGithubProjectAdapter(
                config.personal_access_token,
                config.repository,
                config.branch,
                config.project_sub_path,
                config.profiles_sub_path,
                config.rpc_server_port,
                config.target,
            );
        case ProjectType.GITLAB:
            return new DbtGitlabProjectAdapter(
                config.personal_access_token,
                config.repository,
                config.branch,
                config.project_sub_path,
                config.profiles_sub_path,
                config.rpc_server_port,
                config.target,
            );
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
