import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { CachedWarehouse } from '../types';
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
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
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
        dbtVersion,
        useDbtLs,
    }: DbtGitlabProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://lightdash:${gitlabPersonalAccessToken}@${
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
            dbtVersion,
            useDbtLs,
        });
    }
}
