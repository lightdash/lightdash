import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    DbtVersionOption,
    DbtVersionOptionLatest,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { getInstallationToken } from '../clients/github/Github';
import Logger from '../logging/logger';
import { CachedWarehouse, ProjectAdapter } from '../types';
import { DbtAzureDevOpsProjectAdapter } from './dbtAzureDevOpsProjectAdapter';
import { DbtBitBucketProjectAdapter } from './dbtBitBucketProjectAdapter';
import { DbtCloudIdeProjectAdapter } from './dbtCloudIdeProjectAdapter';
import { DbtGithubProjectAdapter } from './dbtGithubProjectAdapter';
import { DbtGitlabProjectAdapter } from './dbtGitlabProjectAdapter';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import { DbtNoneCredentialsProjectAdapter } from './dbtNoneCredentialsProjectAdapter';

export const projectAdapterFromConfig = async (
    config: DbtProjectConfig,
    warehouseCredentials: CreateWarehouseCredentials,
    cachedWarehouse: CachedWarehouse,
    dbtVersionOption: DbtVersionOption,
    useDbtLs: boolean = true,
    analytics?: LightdashAnalytics,
): Promise<ProjectAdapter> => {
    Logger.debug(
        `Initialize warehouse client of type ${warehouseCredentials.type}`,
    );
    const warehouseClient =
        warehouseClientFromCredentials(warehouseCredentials);
    const configType = config.type;
    Logger.debug(`Initialize project adaptor of type ${configType}`);

    const dbtVersion: SupportedDbtVersions =
        dbtVersionOption === DbtVersionOptionLatest.LATEST
            ? getLatestSupportDbtVersion()
            : dbtVersionOption;

    switch (config.type) {
        case DbtProjectType.DBT:
            return new DbtLocalCredentialsProjectAdapter({
                analytics,
                warehouseClient,
                projectDir: config.project_dir || '/usr/app/dbt',
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        case DbtProjectType.NONE:
            return new DbtNoneCredentialsProjectAdapter({
                warehouseClient,
            });

        case DbtProjectType.DBT_CLOUD_IDE:
            return new DbtCloudIdeProjectAdapter({
                analytics,
                warehouseClient,
                environmentId: `${config.environment_id}`,
                discoveryApiEndpoint: config.discovery_api_endpoint,
                apiKey: config.api_key,
                tags: config.tags,
                cachedWarehouse,
                dbtVersion,
                // TODO add selector to dbt cloud
            });
        case DbtProjectType.GITHUB:
            const githubToken =
                config.installation_id &&
                config.authorization_method === 'installation_id'
                    ? await getInstallationToken(config.installation_id)
                    : config.personal_access_token;
            return new DbtGithubProjectAdapter({
                analytics,
                warehouseClient,
                githubPersonalAccessToken: githubToken!,
                githubRepository: config.repository,
                githubBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                hostDomain: config.host_domain,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        case DbtProjectType.GITLAB:
            return new DbtGitlabProjectAdapter({
                analytics,
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
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        case DbtProjectType.BITBUCKET:
            return new DbtBitBucketProjectAdapter({
                analytics,
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
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        case DbtProjectType.AZURE_DEVOPS:
            return new DbtAzureDevOpsProjectAdapter({
                analytics,
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
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
