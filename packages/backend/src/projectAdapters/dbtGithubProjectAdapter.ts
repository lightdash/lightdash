import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
    validateGithubToken,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { getInstallationToken } from '../clients/github/Github';
import { CachedWarehouse } from '../types';
import { DEFAULT_GITHUB_HOST_DOMAIN } from '../utils/credentialDestination';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type DbtGithubProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    githubPersonalAccessToken: string;
    githubInstallationId?: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    hostDomain?: string;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    dbtSourceName?: string;
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        githubBranch,
        githubPersonalAccessToken,
        githubInstallationId,
        githubRepository,
        projectDirectorySubPath,
        warehouseCredentials,
        hostDomain,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        analytics,
        dbtSourceName,
    }: DbtGithubProjectAdapterArgs) {
        if (githubPersonalAccessToken) {
            const [isValid, error] = validateGithubToken(
                githubPersonalAccessToken,
            );
            if (!isValid) {
                throw new Error(error);
            }
        }

        const remoteRepositoryUrl = `https://lightdash:${githubPersonalAccessToken}@${
            hostDomain || DEFAULT_GITHUB_HOST_DOMAIN
        }/${githubRepository}.git`;
        let gitPackageTokenProvider: (() => Promise<string>) | undefined;
        if (githubInstallationId) {
            gitPackageTokenProvider = () =>
                getInstallationToken(githubInstallationId);
        } else if (githubPersonalAccessToken) {
            gitPackageTokenProvider = async () => githubPersonalAccessToken;
        }
        super({
            warehouseClient,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            repository: githubRepository,
            gitBranch: githubBranch,
            targetName,
            environment,
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            analytics,
            gitPackageHost: hostDomain || DEFAULT_GITHUB_HOST_DOMAIN,
            gitPackageTokenProvider,
            dbtSourceName,
        });
    }
}
