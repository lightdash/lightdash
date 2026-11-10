import {
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import type { DbtTargetResult } from '../services/WarehouseClientFactory/CredentialResolver';
import { CachedWarehouse } from '../types';
import { DEFAULT_GITLAB_HOST_DOMAIN } from '../utils/credentialDestination';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

type DbtGitlabProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    gitlabPersonalAccessToken: string;
    gitlabRepository: string;
    gitlabBranch: string;
    projectDirectorySubPath: string;
    dbtTarget: DbtTargetResult;
    explicitCredentials: boolean;
    hostDomain?: string;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    partialParseBaselinePath: string | null;
};

export class DbtGitlabProjectAdapter extends DbtGitProjectAdapter {
    constructor({
        warehouseClient,
        gitlabBranch,
        gitlabPersonalAccessToken,
        gitlabRepository,
        projectDirectorySubPath,
        dbtTarget,
        explicitCredentials,
        hostDomain,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        analytics,
        partialParseBaselinePath,
    }: DbtGitlabProjectAdapterArgs) {
        const remoteRepositoryUrl = `https://lightdash:${gitlabPersonalAccessToken}@${
            hostDomain || DEFAULT_GITLAB_HOST_DOMAIN
        }/${gitlabRepository}.git`;
        super({
            warehouseClient,
            gitBranch: gitlabBranch,
            remoteRepositoryUrl,
            repository: gitlabRepository,
            projectDirectorySubPath,
            dbtTarget,
            explicitCredentials,
            targetName,
            environment,
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            analytics,
            partialParseBaselinePath,
        });
    }
}
