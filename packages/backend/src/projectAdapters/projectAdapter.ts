import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    DbtVersionOption,
    DbtVersionOptionLatest,
    getLatestSupportDbtVersion,
    ParameterError,
    SupportedDbtVersions,
    validateGithubToken,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { getInstallationToken } from '../clients/github/Github';
import Logger from '../logging/logger';
import { CachedWarehouse, ProjectAdapter } from '../types';
import { DbtCloudIdeProjectAdapter } from './dbtCloudIdeProjectAdapter';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { DbtManifestProjectAdapter } from './dbtManifestProjectAdapter';
import { DbtNoneCredentialsProjectAdapter } from './dbtNoneCredentialsProjectAdapter';
import {
    azureDevOpsUrlBuilder,
    bitbucketUrlBuilder,
    githubUrlBuilder,
    gitlabUrlBuilder,
} from './gitUrlBuilders';

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
            return new DbtLocalProjectAdapter({
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

        case DbtProjectType.MANIFEST:
            return new DbtManifestProjectAdapter({
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
                manifest: config.manifest,
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
        case DbtProjectType.GITHUB: {
            const githubToken =
                config.installation_id &&
                config.authorization_method === 'installation_id'
                    ? await getInstallationToken(config.installation_id)
                    : config.personal_access_token;
            if (githubToken === undefined) {
                throw new ParameterError(
                    `Missing github token for authorization method: ${
                        config.authorization_method || 'personal access token'
                    }`,
                );
            }
            if (!config.repository) {
                throw new ParameterError(
                    `Missing repository for GitHub project`,
                );
            }
            const [isValid, error] = validateGithubToken(githubToken);
            if (!isValid) {
                throw new Error(error);
            }
            const githubRemoteUrl = githubUrlBuilder({
                token: githubToken,
                repository: config.repository,
                hostDomain: config.host_domain,
            });
            return new DbtGitProjectAdapter({
                analytics,
                warehouseClient,
                remoteRepositoryUrl: githubRemoteUrl,
                repository: config.repository,
                gitBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        }
        case DbtProjectType.GITLAB: {
            const gitlabRemoteUrl = gitlabUrlBuilder({
                token: config.personal_access_token,
                repository: config.repository,
                hostDomain: config.host_domain,
            });
            return new DbtGitProjectAdapter({
                analytics,
                warehouseClient,
                remoteRepositoryUrl: gitlabRemoteUrl,
                repository: config.repository,
                gitBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        }
        case DbtProjectType.BITBUCKET: {
            const bitbucketRemoteUrl = bitbucketUrlBuilder({
                username: config.username,
                token: config.personal_access_token,
                repository: config.repository,
                hostDomain: config.host_domain,
            });
            return new DbtGitProjectAdapter({
                analytics,
                warehouseClient,
                remoteRepositoryUrl: bitbucketRemoteUrl,
                repository: config.repository,
                gitBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        }
        case DbtProjectType.AZURE_DEVOPS: {
            const azureRemoteUrl = azureDevOpsUrlBuilder({
                token: config.personal_access_token,
                organization: config.organization,
                project: config.project,
                repository: config.repository,
            });
            return new DbtGitProjectAdapter({
                analytics,
                warehouseClient,
                remoteRepositoryUrl: azureRemoteUrl,
                repository: config.repository,
                gitBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                cachedWarehouse,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });
        }
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
