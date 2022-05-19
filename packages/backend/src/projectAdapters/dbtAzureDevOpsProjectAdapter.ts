import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
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
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
};

export class DbtAzureDevOpsProjectAdapter extends DbtGitProjectAdapter {
    constructor({
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
        cachedWarehouse,
    }: Args) {
        const remoteRepositoryUrl = `https://${personalAccessToken}@dev.azure.com/${organization}/${project}/_git/${repository}`;
        super({
            warehouseClient,
            gitBranch: branch,
            remoteRepositoryUrl,
            projectDirectorySubPath,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
        });
    }
}
