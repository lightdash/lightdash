/**
 * Dispatcher for git-backed projects. Lazily clones the repo, detects whether
 * it's a Lightdash YAML or dbt project, and delegates to the matching adapter:
 *
 *   - Lightdash YAML  -> LightdashYamlProjectAdapter (reuses this clone)
 *   - dbt             -> the dbt adapter built by `createDbtAdapter` (unchanged)
 *
 * Detection is lazy (per the chosen design): the format isn't known until the
 * repo is cloned. The dbt branch currently re-clones inside its own adapter —
 * the throwaway detection clone here is a prototype wart; productionisation
 * should share a single GitRepository clone across both branches.
 */
import {
    DbtPackages,
    Explore,
    ExploreError,
    type LightdashProjectConfig,
    type ProjectContextEntry,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import { ProjectAdapter, type TrackingParams } from '../types';
import { GitRepository } from './gitRepository';
import { findLightdashModelFiles } from './lightdashYamlLoader';
import { LightdashYamlProjectAdapter } from './lightdashYamlProjectAdapter';

type GitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    branch: string;
    projectDirectorySubPath: string;
    createDbtAdapter: () => ProjectAdapter;
};

export class GitProjectAdapter implements ProjectAdapter {
    private readonly args: GitProjectAdapterArgs;

    private resolved: ProjectAdapter | undefined;

    private yamlRepository: GitRepository | undefined;

    constructor(args: GitProjectAdapterArgs) {
        this.args = args;
    }

    private async resolveAdapter(): Promise<ProjectAdapter> {
        if (this.resolved) {
            return this.resolved;
        }
        const repository = new GitRepository(
            this.args.remoteRepositoryUrl,
            this.args.branch,
            this.args.projectDirectorySubPath,
        );
        const projectDir = await repository.clone();
        const lightdashModelFiles = await findLightdashModelFiles(projectDir);

        if (lightdashModelFiles.length > 0) {
            Logger.info(
                `Detected Lightdash YAML project (${lightdashModelFiles.length} model file(s))`,
            );
            this.yamlRepository = repository;
            this.resolved = new LightdashYamlProjectAdapter({
                projectDir,
                warehouseClient: this.args.warehouseClient,
            });
        } else {
            Logger.info('Detected dbt project, delegating to dbt adapter');
            await repository.destroy();
            this.resolved = this.args.createDbtAdapter();
        }
        return this.resolved;
    }

    public async compileAllExplores(
        trackingParams?: TrackingParams,
        loadSources?: boolean,
        allowPartialCompilation?: boolean,
    ): Promise<(Explore | ExploreError)[]> {
        const adapter = await this.resolveAdapter();
        return adapter.compileAllExplores(
            trackingParams,
            loadSources,
            allowPartialCompilation,
        );
    }

    public async getDbtPackages(): Promise<DbtPackages | undefined> {
        return (await this.resolveAdapter()).getDbtPackages();
    }

    public async test(): Promise<void> {
        await (await this.resolveAdapter()).test();
    }

    public async getLightdashProjectConfig(
        trackingParams?: TrackingParams,
    ): Promise<LightdashProjectConfig> {
        return (await this.resolveAdapter()).getLightdashProjectConfig(
            trackingParams,
        );
    }

    public async getProjectContext(): Promise<ProjectContextEntry[]> {
        return (await this.resolveAdapter()).getProjectContext();
    }

    public async destroy(): Promise<void> {
        await this.resolved?.destroy();
        await this.yamlRepository?.destroy();
    }
}
