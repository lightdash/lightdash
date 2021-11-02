import { CreateWarehouseCredentials } from 'common';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { WarehouseClient } from '../types';

type DbtGithubProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    githubPersonalAccessToken: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    port: number;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        githubBranch,
        githubPersonalAccessToken,
        githubRepository,
        projectDirectorySubPath,
        port,
        warehouseCredentials,
    }: DbtGithubProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://${githubPersonalAccessToken}@github.com/${githubRepository}.git`;
        super({
            warehouseClient,
            remoteRepositoryUrl,
            port,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
        });
    }
}
