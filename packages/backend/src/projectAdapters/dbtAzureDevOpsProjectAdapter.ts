import {
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import type { DbtPartialParseBaseline } from '../dbt/dbtPartialParseBaseline';
import type { DbtTargetResult } from '../services/WarehouseClientFactory/CredentialResolver';
import { CachedWarehouse } from '../types';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type Args = {
    warehouseClient: WarehouseClient;
    personalAccessToken: string;
    organization: string;
    project: string;
    repository: string;
    branch: string;
    projectDirectorySubPath: string;
    dbtTarget: DbtTargetResult;
    explicitCredentials: boolean;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    partialParseBaseline: DbtPartialParseBaseline | null;
};

export class DbtAzureDevOpsProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        partialParseBaseline,
        analytics,
        warehouseClient,
        personalAccessToken,
        organization,
        project,
        repository,
        branch,
        projectDirectorySubPath,
        dbtTarget,
        explicitCredentials,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
    }: Args) {
        const remoteRepositoryUrl = `https://${personalAccessToken}@dev.azure.com/${organization}/${project}/_git/${repository}`;
        super({
            analytics,
            partialParseBaseline,
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            repository,
            projectDirectorySubPath,
            dbtTarget,
            explicitCredentials,
            targetName,
            environment,
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
        });
    }
}
