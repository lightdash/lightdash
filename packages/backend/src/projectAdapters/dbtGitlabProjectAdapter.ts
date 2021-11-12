import { CreateWarehouseCredentials } from 'common';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { WarehouseClient } from '../types';

type DbtGitlabProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    gitlabPersonalAccessToken: string;
    gitlabRepository: string;
    gitlabBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGitlabProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        gitlabBranch,
        gitlabPersonalAccessToken,
        gitlabRepository,
        projectDirectorySubPath,
        warehouseCredentials,
    }: DbtGitlabProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://:${gitlabPersonalAccessToken}@gitlab.com/${gitlabRepository}.git`;
        super({
            warehouseClient,
            gitBranch: gitlabBranch,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
        });
    }
}
