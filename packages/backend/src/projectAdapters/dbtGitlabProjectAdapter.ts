import { CreateWarehouseCredentials } from 'common';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type DbtGitlabProjectAdapterArgs = {
    gitlabPersonalAccessToken: string;
    gitlabRepository: string;
    gitlabBranch: string;
    projectDirectorySubPath: string;
    port: number;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGitlabProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        gitlabBranch,
        gitlabPersonalAccessToken,
        gitlabRepository,
        projectDirectorySubPath,
        port,
        warehouseCredentials,
    }: DbtGitlabProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://:${gitlabPersonalAccessToken}@gitlab.com/${gitlabRepository}.git`;
        super({
            gitBranch: gitlabBranch,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            port,
            warehouseCredentials,
        });
    }
}
