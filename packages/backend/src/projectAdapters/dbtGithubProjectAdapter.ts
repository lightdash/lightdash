import { CreateWarehouseCredentials } from 'common';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { QueryRunner } from '../types';

type DbtGithubProjectAdapterArgs = {
    queryRunner: QueryRunner | undefined;
    githubPersonalAccessToken: string;
    githubRepository: string;
    githubBranch: string;
    projectDirectorySubPath: string;
    port: number;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGithubProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        queryRunner,
        githubBranch,
        githubPersonalAccessToken,
        githubRepository,
        projectDirectorySubPath,
        port,
        warehouseCredentials,
    }: DbtGithubProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://${githubPersonalAccessToken}@github.com/${githubRepository}.git`;
        super({
            queryRunner,
            remoteRepositoryUrl,
            port,
            projectDirectorySubPath,
            warehouseCredentials,
            gitBranch: githubBranch,
        });
    }
}
