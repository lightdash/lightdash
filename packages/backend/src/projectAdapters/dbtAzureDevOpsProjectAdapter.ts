import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { CachedWarehouse } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { DbtGitCacheIdentity } from './dbtGitProjectCache';

type Args = {
    warehouseClient: WarehouseClient;
    personalAccessToken: string;
    organization: string;
    project: string;
    repository: string;
    branch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    cacheIdentity?: DbtGitCacheIdentity;
};

export class DbtAzureDevOpsProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        analytics,
        warehouseClient,
        personalAccessToken,
        organization,
        project,
        repository,
        branch,
        projectDirectorySubPath,
        warehouseCredentials,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        cacheIdentity,
    }: Args) {
        const remoteRepositoryUrl = `https://${encodeURIComponent(
            personalAccessToken,
        )}@dev.azure.com/${organization}/${project}/_git/${repository}`;
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
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            cacheIdentity,
            credential: { token: personalAccessToken },
        });
    }
}
