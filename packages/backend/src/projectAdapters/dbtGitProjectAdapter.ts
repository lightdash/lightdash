import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import Logger from '../logging/logger';
import { CachedWarehouse, ProjectAdapter, type TrackingParams } from '../types';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { createGitRepoManager, GitRepoManager } from './gitRepoManager';

export type DbtGitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    repository: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
    selector?: string;
    analytics?: LightdashAnalytics;
};

export class DbtGitProjectAdapter
    extends DbtLocalProjectAdapter
    implements ProjectAdapter
{
    private repoManager: GitRepoManager;

    constructor({
        warehouseClient,
        repository,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
        targetName,
        environment,
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
        selector,
        analytics,
    }: DbtGitProjectAdapterArgs) {
        const repoManager = createGitRepoManager({
            remoteUrl: remoteRepositoryUrl,
            branch: gitBranch,
            repository,
        });

        const projectDir = path.join(
            repoManager.localDir,
            projectDirectorySubPath,
        );

        super({
            warehouseClient,
            projectDir,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
            dbtVersion,
            useDbtLs,
            selector,
            analytics,
        });

        this.repoManager = repoManager;
    }

    async destroy(): Promise<void> {
        Logger.debug(`Destroy git project adapter`);
        await this.repoManager.cleanup();
        await super.destroy();
    }

    public async compileAllExplores(
        trackingParams?: TrackingParams,
        loadSources?: boolean,
        allowPartialCompilation?: boolean,
    ) {
        await this.repoManager.refresh();
        return super.compileAllExplores(
            trackingParams,
            loadSources,
            allowPartialCompilation,
        );
    }

    public async test() {
        await this.repoManager.refresh();
        await super.test();
    }
}
