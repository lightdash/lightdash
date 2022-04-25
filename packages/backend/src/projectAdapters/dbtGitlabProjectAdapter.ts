import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
} from 'common';
import { CachedWarehouse, WarehouseClient } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';

type DbtGitlabProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    gitlabPersonalAccessToken: string;
    gitlabRepository: string;
    gitlabBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    hostDomain?: string;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
};

export class DbtGitlabProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        gitlabBranch,
        gitlabPersonalAccessToken,
        gitlabRepository,
        projectDirectorySubPath,
        warehouseCredentials,
        hostDomain,
        targetName,
        environment,
        cachedWarehouse,
    }: DbtGitlabProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://:${gitlabPersonalAccessToken}@${
            hostDomain || DEFAULT_GITLAB_HOST_DOMAIN
        }/${gitlabRepository}.git`;
        super({
            warehouseClient,
            gitBranch: gitlabBranch,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
        });
    }
}
