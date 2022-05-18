import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    ProjectType,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import Logger from '../logger';
import { CachedWarehouse, ProjectAdapter } from '../types';
import { DbtAzureDevOpsProjectAdapter } from './dbtAzureDevOpsProjectAdapter';
import { DbtBitBucketProjectAdapter } from './dbtBitBucketProjectAdapter';
import { DbtCloudIdeProjectAdapter } from './dbtCloudIdeProjectAdapter';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { DbtGitlabProjectAdapter } from './dbtGitlabProjectAdapter';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

export const projectAdapterFromConfig = async (
    config: DbtProjectConfig,
    warehouseCredentials: CreateWarehouseCredentials,
    cachedWarehouse: CachedWarehouse,
): Promise<ProjectAdapter> => {
    Logger.debug(
        `Initialize warehouse client of type ${warehouseCredentials.type}`,
    );
    const warehouseClient =
        warehouseClientFromCredentials(warehouseCredentials);
    const configType = config.type;
    Logger.debug(`Initialize project adaptor of type ${configType}`);
    switch (config.type) {
        case ProjectType.DBT:
            return new DbtLocalCredentialsProjectAdapter({
                warehouseClient,
                projectDir: config.project_dir || '/usr/app/dbt',
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
            });
        case ProjectType.DBT_CLOUD_IDE:
            return new DbtCloudIdeProjectAdapter({
                warehouseClient,
                accountId: `${config.account_id}`,
                environmentId: `${config.environment_id}`,
                projectId: `${config.project_id}`,
                apiKey: config.api_key,
                cachedWarehouse,
            });
        case ProjectType.GITHUB:
            return new DbtGithubProjectAdapter({
                warehouseClient,
                githubPersonalAccessToken: config.personal_access_token,
                githubRepository: config.repository,
                githubBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                hostDomain: config.host_domain,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
            });
        case ProjectType.GITLAB:
            return new DbtGitlabProjectAdapter({
                warehouseClient,
                gitlabPersonalAccessToken: config.personal_access_token,
                gitlabRepository: config.repository,
                gitlabBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                hostDomain: config.host_domain,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
            });
        case ProjectType.BITBUCKET:
            return new DbtBitBucketProjectAdapter({
                warehouseClient,
                username: config.username,
                personalAccessToken: config.personal_access_token,
                repository: config.repository,
                branch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                hostDomain: config.host_domain,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
            });
        case ProjectType.AZURE_DEVOPS:
            return new DbtAzureDevOpsProjectAdapter({
                warehouseClient,
                personalAccessToken: config.personal_access_token,
                organization: config.organization,
                project: config.project,
                repository: config.repository,
                branch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
            });
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
