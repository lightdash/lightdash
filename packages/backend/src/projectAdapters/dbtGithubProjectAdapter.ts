import { CreateWarehouseCredentials } from 'common';
import { WarehouseClient } from '../types';
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
    }: DbtGithubProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://${githubPersonalAccessToken}@${
            hostDomain || DEFAULT_GITHUB_HOST_DOMAIN
        }/${githubRepository}.git`;
        super({
            warehouseClient,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
        });
    }
}
