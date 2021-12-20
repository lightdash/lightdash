import { CreateWarehouseCredentials } from 'common';
import { WarehouseClient } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type DbtGithubProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    githubPersonalAccessToken: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        githubBranch,
        githubPersonalAccessToken,
        githubRepository,
        projectDirectorySubPath,
        warehouseCredentials,
    }: DbtGithubProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://:${githubPersonalAccessToken}@github.com/${githubRepository}.git`;
        super({
            warehouseClient,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
        });
    }
}
