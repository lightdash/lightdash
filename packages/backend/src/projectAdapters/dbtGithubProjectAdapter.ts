import { CreateWarehouseCredentials } from 'common';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type DbtGithubProjectAdapterArgs = {
    githubPersonalAccessToken: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    port: number;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        githubBranch,
        githubPersonalAccessToken,
        githubRepository,
        projectDirectorySubPath,
        port,
        warehouseCredentials,
    }: DbtGithubProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://${githubPersonalAccessToken}@github.com/${githubRepository}.git`;
        super({
            remoteRepositoryUrl,
            port,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
        });
    }
}
