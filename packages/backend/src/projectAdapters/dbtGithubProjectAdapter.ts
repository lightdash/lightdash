import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
    validateGithubToken,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
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
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        githubBranch,
        githubPersonalAccessToken,
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
    }: DbtGithubProjectAdapterArgs) {
        const [isValid, error] = validateGithubToken(githubPersonalAccessToken);
        if (!isValid) {
            throw new Error(error);
        }

        const githubHostDomain = hostDomain || DEFAULT_GITHUB_HOST_DOMAIN;
        const remoteRepositoryUrl = githubPersonalAccessToken
            ? `https://lightdash:${githubPersonalAccessToken}@${githubHostDomain}/${githubRepository}.git`
            : `https://${githubHostDomain}/${githubRepository}.git`;
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
        });
    }
}
