import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    SupportedDbtVersions,
    UnexpectedServerError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import fs from 'fs';
import * as fspromises from 'fs-extra';
import * as path from 'path';
import simpleGit, { SimpleGit, SimpleGitProgressEvent } from 'simple-git';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import Logger from '../logging/logger';
import {
    CachedWarehouse,
    ProjectAdapter,
    type ExploreCompileOptions,
    type TrackingParams,
} from '../types';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import { GitRepository } from './gitRepository';

export type DbtGitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    repository: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    gitConfigGlobalPath?: string;
    dbtDepsErrorHint?: string;
};

export class DbtGitProjectAdapter
    extends DbtLocalCredentialsProjectAdapter
    implements ProjectAdapter
{
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    repository: string;

    projectDirectorySubPath: string;

    branch: string;

    git: SimpleGit;

    constructor({
        warehouseClient,
        repository,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        analytics,
        gitConfigGlobalPath,
        dbtDepsErrorHint,
    }: DbtGitProjectAdapterArgs) {
        const localRepositoryDir = fs.mkdtempSync('/tmp/git_');
        const projectDir = path.join(
            localRepositoryDir,
            projectDirectorySubPath,
        );
        super({
            warehouseClient,
            projectDir,
            warehouseCredentials,
            targetName,
            environment,
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            analytics,
            gitConfigGlobalPath,
            dbtDepsErrorHint,
        });
        this.projectDirectorySubPath = projectDirectorySubPath;
        this.localRepositoryDir = localRepositoryDir;
        this.remoteRepositoryUrl = remoteRepositoryUrl;
        this.branch = gitBranch;
        this.repository = repository;
        this.git = simpleGit({
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        });
    }

    async destroy(): Promise<void> {
        Logger.debug(`Destroy git project adapter`);
        await this._destroyLocal();
        await super.destroy();
    }

    private async _destroyLocal() {
        try {
            Logger.debug(`Destroy ${this.localRepositoryDir}`);
            await fspromises.rm(this.localRepositoryDir, {
                recursive: true,
                force: true,
            });
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while removing local git directory: ${e}`,
            );
        }
    }

    private async _refreshRepo() {
        await new GitRepository(
            this.git,
            this.localRepositoryDir,
            this.remoteRepositoryUrl,
            this.repository,
            this.branch,
        ).refresh();
    }

    public async prepareExploreStream(
        trackingParams?: TrackingParams,
        loadSources?: boolean,
        allowPartialCompilation?: boolean,
        compileOptions?: ExploreCompileOptions,
    ) {
        await this._refreshRepo();
        return super.prepareExploreStream(
            trackingParams,
            loadSources,
            allowPartialCompilation,
            compileOptions,
        );
    }

    public async test() {
        await this._refreshRepo();
        await super.test();
    }

    public async getDbtManifest() {
        await this._refreshRepo();
        return super.getDbtManifest();
    }
}
