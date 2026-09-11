import {
    CreateWarehouseCredentials,
    DbtManifestProjectConfig,
    DbtProjectConfig,
    DbtProjectType,
    DbtVersionOption,
    ParameterError,
    resolveDbtVersion,
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
import { DbtGitCacheContext } from './dbtGitProjectAdapter';
import { DbtGitCacheIdentity } from './dbtGitProjectCache';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import {
    DbtManifestProjectAdapter,
    ManifestInput,
} from './dbtManifestProjectAdapter';
import { DbtNoneCredentialsProjectAdapter } from './dbtNoneCredentialsProjectAdapter';
import { NativeGitProjectAdapter } from './nativeGitProjectAdapter';

export const projectAdapterFromConfig = async (
    config:
        | Exclude<DbtProjectConfig, DbtManifestProjectConfig>
        | (Omit<DbtManifestProjectConfig, 'manifest'> & ManifestInput),
    warehouseCredentials: CreateWarehouseCredentials,
    cachedWarehouse: CachedWarehouse,
    dbtVersionOption: DbtVersionOption,
    environmentVariableAllowlist: string[],
    analytics?: LightdashAnalytics,
    // MANIFEST-only: project dir for Lightdash config and selected model ids.
    // Ignored by every other adapter type.
    manifestOptions?: { projectDir?: string; selectedModelIds?: string[] },
    cacheIdentity?: DbtGitCacheIdentity,
    cacheContext?: DbtGitCacheContext,
): Promise<ProjectAdapter> => {
    Logger.debug(
        `Initialize warehouse client of type ${warehouseCredentials.type}`,
    );
    const warehouseClient =
        warehouseClientFromCredentials(warehouseCredentials);
    const configType = config.type;
    Logger.debug(`Initialize project adaptor of type ${configType}`);

    const dbtVersion = resolveDbtVersion(dbtVersionOption);

    switch (config.type) {
        case DbtProjectType.DBT:
            return new DbtLocalCredentialsProjectAdapter({
                analytics,
                warehouseClient,
                projectDir: config.project_dir || '/usr/app/dbt',
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                environmentVariableAllowlist,
                cachedWarehouse,
                dbtVersion,

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
                ...(config.parsedManifest !== undefined
                    ? { parsedManifest: config.parsedManifest }
                    : { manifest: config.manifest }),
                dbtProjectDir: manifestOptions?.projectDir,
                selectedModelIds: manifestOptions?.selectedModelIds,
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
            if (config.semanticLayer === 'lightdash') {
                return new NativeGitProjectAdapter({
                    provider: DbtProjectType.GITHUB,
                    warehouseClient,
                    token: githubToken,
                    repository: config.repository,
                    branch: config.branch,
                    projectSubPath: config.project_sub_path,
                    hostDomain: config.host_domain,
                });
            }
            return new DbtGithubProjectAdapter({
                analytics,
                warehouseClient,
                githubPersonalAccessToken: githubToken,
                githubInstallationId:
                    config.authorization_method === 'installation_id'
                        ? config.installation_id
                        : undefined,
                githubRepository: config.repository,
                githubBranch: config.branch,
                projectDirectorySubPath: config.project_sub_path,
                hostDomain: config.host_domain,
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
                environmentVariableAllowlist,
                cachedWarehouse,
                dbtVersion,

                selector: config.selector,
                cacheIdentity,
                cacheContext,
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
                environmentVariableAllowlist,
                cachedWarehouse,
                dbtVersion,

                selector: config.selector,
                cacheIdentity,
                cacheContext,
            });
        case DbtProjectType.BITBUCKET:
            if (config.semanticLayer === 'lightdash') {
                return new NativeGitProjectAdapter({
                    provider: DbtProjectType.BITBUCKET,
                    warehouseClient,
                    token: config.personal_access_token,
                    username: config.username,
                    repository: config.repository,
                    branch: config.branch,
                    projectSubPath: config.project_sub_path,
                    hostDomain: config.host_domain,
                });
            }
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
                environmentVariableAllowlist,
                cachedWarehouse,
                dbtVersion,

                selector: config.selector,
                cacheIdentity,
                cacheContext,
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
                environmentVariableAllowlist,
                cachedWarehouse,
                dbtVersion,

                selector: config.selector,
                cacheIdentity,
                cacheContext,
            });
        default:
            const never: never = config;
            throw new Error(`Adapter not implemented for type: ${configType}`);
    }
};
