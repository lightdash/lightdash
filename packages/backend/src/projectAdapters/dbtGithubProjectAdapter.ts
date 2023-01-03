import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    validateGithubToken,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { CachedWarehouse } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const DEFAULT_GITHUB_HOST_DOMAIN = 'github.com';

type DbtGithubProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    githubPersonalAccessToken: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    hostDomain?: string;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
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
        cachedWarehouse,
    }: DbtGithubProjectAdapterArgs) {
        const [isValid, error] = validateGithubToken(githubPersonalAccessToken);
        if (!isValid) {
            throw new Error(error);
        }
        const remoteRepositoryUrl = `https://lightdash:${githubPersonalAccessToken}@${
            hostDomain || DEFAULT_GITHUB_HOST_DOMAIN
        }/${githubRepository}.git`;
        super({
            warehouseClient,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
            targetName,
            environment,
            cachedWarehouse,
        });
    }
}
