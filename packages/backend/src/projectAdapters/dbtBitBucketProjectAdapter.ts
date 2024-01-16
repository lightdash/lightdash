import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { CachedWarehouse } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const DEFAULT_HOST_DOMAIN = 'bitbucket.org';

type Args = {
    warehouseClient: WarehouseClient;
    username: string;
    personalAccessToken: string;
    repository: string;
    branch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    hostDomain?: string;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
};

export class DbtBitBucketProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        username,
        branch,
        personalAccessToken,
        repository,
        projectDirectorySubPath,
        warehouseCredentials,
        hostDomain,
        targetName,
        environment,
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
    }: Args) {
        const remoteRepositoryUrl = `https://${username}:${personalAccessToken}@${
            hostDomain || DEFAULT_HOST_DOMAIN
        }/${repository}.git`;
        super({
            warehouseClient,
            gitBranch: branch,
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
