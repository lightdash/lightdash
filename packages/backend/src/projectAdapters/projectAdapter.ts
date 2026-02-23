import {
    assertUnreachable,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    DbtVersionOption,
    DbtVersionOptionLatest,
    getLatestSupportDbtVersion,
    ParameterError,
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
import { DbtManifestProjectAdapter } from './dbtManifestProjectAdapter';
import { DbtNoneCredentialsProjectAdapter } from './dbtNoneCredentialsProjectAdapter';
import { ExploreCompiler } from './ExploreCompiler';
import {
    azureDevOpsUrlBuilder,
    bitbucketUrlBuilder,
    githubUrlBuilder,
    gitlabUrlBuilder,
} from './gitUrlBuilders';
import {
    DbtCliManifestProvider,
    DbtCloudManifestProvider,
    StaticManifestProvider,
} from './manifestProviders';
import { WarehouseProfileGenerator } from './ProfileGenerator';
import { GitSourceAccessor, LocalSourceAccessor } from './sourceAccessors';

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

/**
 * V2 factory function using composition-based architecture.
 * Creates a ProjectAdapter using the new ExploreCompiler with
 * ManifestProvider, SourceAccessor, and ProfileGenerator components.
 *
 * This replaces the inheritance-based adapter chain with a more flexible
 * composition approach that makes it easier to add new providers and features.
 */
export const projectAdapterFromConfigV2 = async (
    config: DbtProjectConfig,
    warehouseCredentials: CreateWarehouseCredentials,
    cachedWarehouse: CachedWarehouse,
    dbtVersionOption: DbtVersionOption,
    useDbtLs: boolean = true,
    analytics?: LightdashAnalytics,
): Promise<ProjectAdapter> => {
    Logger.debug(
        `Initialize warehouse client of type ${warehouseCredentials.type} (V2)`,
    );
    const warehouseClient =
        warehouseClientFromCredentials(warehouseCredentials);
    const configType = config.type;
    Logger.debug(`Initialize project adaptor of type ${configType} (V2)`);

    const dbtVersion: SupportedDbtVersions =
        dbtVersionOption === DbtVersionOptionLatest.LATEST
            ? getLatestSupportDbtVersion()
            : dbtVersionOption;

    switch (config.type) {
        case DbtProjectType.DBT: {
            // Local dbt project with credentials
            const sourceAccessor = new LocalSourceAccessor({
                projectDir: config.project_dir || '/usr/app/dbt',
            });

            const profileGenerator = new WarehouseProfileGenerator({
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
            });

            const profileResult = profileGenerator.generate();

            const manifestProvider = new DbtCliManifestProvider({
                projectDir: sourceAccessor.getProjectDirectory(),
                profilesDir: profileResult.profilesDir,
                profileName: profileResult.profileName,
                target: profileResult.targetName,
                environment: profileResult.environment,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });

            return new ExploreCompiler({
                manifestProvider,
                sourceAccessor,
                profileGenerator,
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.NONE:
            // No dbt connection - just warehouse client
            // Use the existing simple adapter since it doesn't need composition
            return new DbtNoneCredentialsProjectAdapter({
                warehouseClient,
            });

        case DbtProjectType.MANIFEST: {
            // Pre-provided manifest JSON
            const manifestProvider = new StaticManifestProvider({
                manifest: config.manifest,
            });

            return new ExploreCompiler({
                manifestProvider,
                // No source accessor needed - manifest is provided
                // No profile generator needed - no dbt CLI calls
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.DBT_CLOUD_IDE: {
            // dbt Cloud IDE - fetch manifest from Metadata API
            const manifestProvider = new DbtCloudManifestProvider({
                environmentId: config.environment_id,
                bearerToken: config.api_key,
                discoveryApiEndpoint: config.discovery_api_endpoint,
                tags: config.tags,
            });

            return new ExploreCompiler({
                manifestProvider,
                // No source accessor needed - dbt Cloud handles source
                // No profile generator needed - no dbt CLI calls
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.GITHUB: {
            // GitHub repository
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

            const sourceAccessor = new GitSourceAccessor({
                urlBuilder: githubUrlBuilder,
                urlParams: {
                    token: githubToken,
                    repository: config.repository,
                    host: config.host_domain,
                },
                branch: config.branch,
                projectSubPath: config.project_sub_path,
            });

            // Refresh source to ensure we have the repo cloned
            await sourceAccessor.refresh();

            const profileGenerator = new WarehouseProfileGenerator({
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
            });

            const profileResult = profileGenerator.generate();

            const manifestProvider = new DbtCliManifestProvider({
                projectDir: sourceAccessor.getProjectDirectory(),
                profilesDir: profileResult.profilesDir,
                profileName: profileResult.profileName,
                target: profileResult.targetName,
                environment: profileResult.environment,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });

            return new ExploreCompiler({
                manifestProvider,
                sourceAccessor,
                profileGenerator,
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.GITLAB: {
            // GitLab repository
            const sourceAccessor = new GitSourceAccessor({
                urlBuilder: gitlabUrlBuilder,
                urlParams: {
                    token: config.personal_access_token,
                    repository: config.repository,
                    host: config.host_domain,
                },
                branch: config.branch,
                projectSubPath: config.project_sub_path,
            });

            // Refresh source to ensure we have the repo cloned
            await sourceAccessor.refresh();

            const profileGenerator = new WarehouseProfileGenerator({
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
            });

            const profileResult = profileGenerator.generate();

            const manifestProvider = new DbtCliManifestProvider({
                projectDir: sourceAccessor.getProjectDirectory(),
                profilesDir: profileResult.profilesDir,
                profileName: profileResult.profileName,
                target: profileResult.targetName,
                environment: profileResult.environment,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });

            return new ExploreCompiler({
                manifestProvider,
                sourceAccessor,
                profileGenerator,
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.BITBUCKET: {
            // Bitbucket repository
            const sourceAccessor = new GitSourceAccessor({
                urlBuilder: bitbucketUrlBuilder,
                urlParams: {
                    token: config.personal_access_token,
                    repository: config.repository,
                    host: config.host_domain,
                    username: config.username,
                },
                branch: config.branch,
                projectSubPath: config.project_sub_path,
            });

            // Refresh source to ensure we have the repo cloned
            await sourceAccessor.refresh();

            const profileGenerator = new WarehouseProfileGenerator({
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
            });

            const profileResult = profileGenerator.generate();

            const manifestProvider = new DbtCliManifestProvider({
                projectDir: sourceAccessor.getProjectDirectory(),
                profilesDir: profileResult.profilesDir,
                profileName: profileResult.profileName,
                target: profileResult.targetName,
                environment: profileResult.environment,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });

            return new ExploreCompiler({
                manifestProvider,
                sourceAccessor,
                profileGenerator,
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        case DbtProjectType.AZURE_DEVOPS: {
            // Azure DevOps repository
            const sourceAccessor = new GitSourceAccessor({
                urlBuilder: azureDevOpsUrlBuilder,
                urlParams: {
                    token: config.personal_access_token,
                    repository: config.repository,
                    organization: config.organization,
                    project: config.project,
                },
                branch: config.branch,
                projectSubPath: config.project_sub_path,
            });

            // Refresh source to ensure we have the repo cloned
            await sourceAccessor.refresh();

            const profileGenerator = new WarehouseProfileGenerator({
                warehouseCredentials,
                targetName: config.target,
                environment: config.environment,
            });

            const profileResult = profileGenerator.generate();

            const manifestProvider = new DbtCliManifestProvider({
                projectDir: sourceAccessor.getProjectDirectory(),
                profilesDir: profileResult.profilesDir,
                profileName: profileResult.profileName,
                target: profileResult.targetName,
                environment: profileResult.environment,
                dbtVersion,
                useDbtLs,
                selector: config.selector,
            });

            return new ExploreCompiler({
                manifestProvider,
                sourceAccessor,
                profileGenerator,
                warehouseClient,
                cachedWarehouse,
                dbtVersion,
                analytics,
            });
        }

        default:
            return assertUnreachable(
                config,
                `Adapter not implemented for type: ${configType}`,
            );
    }
};
