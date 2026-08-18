import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
    validateGithubToken,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import * as fs from 'fs/promises';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import {
    createGithubGitCredentialFiles,
    GitCredentialFiles,
} from '../dbt/gitCredentials';
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
    private readonly gitCredentialFiles: GitCredentialFiles;

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
    }: DbtGithubProjectAdapterArgs) {
        const [isValid, error] = validateGithubToken(githubPersonalAccessToken);
        if (!isValid) {
            throw new Error(error);
        }

        const githubHost = hostDomain || DEFAULT_GITHUB_HOST_DOMAIN;
        const gitCredentialFiles = createGithubGitCredentialFiles({
            host: githubHost,
            token: githubPersonalAccessToken,
        });
        const remoteRepositoryUrl = `https://lightdash:${githubPersonalAccessToken}@${githubHost}/${githubRepository}.git`;
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
            gitConfigGlobalPath: gitCredentialFiles.configPath,
            dbtDepsErrorHint: githubInstallationId
                ? 'If a dependency is a private GitHub repository, ensure it is included in the same GitHub App installation as this project.'
                : undefined,
        });
        this.gitCredentialFiles = gitCredentialFiles;
    }

    async destroy(): Promise<void> {
        try {
            await super.destroy();
        } finally {
            await fs.rm(this.gitCredentialFiles.directory, {
                recursive: true,
                force: true,
            });
        }
    }
}
