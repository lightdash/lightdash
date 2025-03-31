import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
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
    selector?: string;
    analytics?: LightdashAnalytics;
};

export class DbtBitBucketProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        analytics,
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
        selector,
    }: Args) {
        const remoteRepositoryUrl = `https://${username}:${personalAccessToken}@${
            hostDomain || DEFAULT_HOST_DOMAIN
        }/${repository}.git`;
        super({
            analytics,
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            repository,
            projectDirectorySubPath,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
            dbtVersion,
            useDbtLs,
            selector,
        });
    }
}
