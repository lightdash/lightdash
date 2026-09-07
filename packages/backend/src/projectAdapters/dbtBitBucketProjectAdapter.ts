import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { CachedWarehouse } from '../types';
import { DEFAULT_BITBUCKET_HOST_DOMAIN } from '../utils/credentialDestination';
import {
    DbtGitCacheContext,
    DbtGitProjectAdapter,
} from './dbtGitProjectAdapter';
import { DbtGitCacheIdentity } from './dbtGitProjectCache';

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
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    cacheIdentity?: DbtGitCacheIdentity;
    cacheContext?: DbtGitCacheContext;
};

export class DbtBitBucketProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        analytics,
        cacheIdentity,
        cacheContext,
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
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
    }: Args) {
        const remoteRepositoryUrl = `https://${encodeURIComponent(
            username,
        )}:${encodeURIComponent(personalAccessToken)}@${
            hostDomain || DEFAULT_BITBUCKET_HOST_DOMAIN
        }/${repository}.git`;
        super({
            analytics,
            cacheIdentity,
            cacheContext,
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            repository,
            projectDirectorySubPath,
            warehouseCredentials,
            targetName,
            environment,
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            credential: { token: personalAccessToken },
        });
    }
}
