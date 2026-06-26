/**
 * Project adapter for Lightdash YAML (dbt-less) projects.
 *
 * Pairs a materialised project directory (local, or a cloned git repo) with the
 * Lightdash YAML compiler. It implements ProjectAdapter directly and shares NO
 * code with the dbt adapter chain — a Lightdash YAML project is not a dbt
 * project. The heavy lifting (model→explore) reuses the same translator the dbt
 * path uses, via convertLightdashModelsToDbtModels + convertExplores in common.
 */
import {
    convertExplores,
    convertLightdashModelsToDbtModels,
    DbtPackages,
    DEFAULT_SPOTLIGHT_CONFIG,
    Explore,
    ExploreError,
    loadLightdashProjectConfig,
    loadProjectContextFile,
    NotFoundError,
    type LightdashProjectConfig,
    type ProjectContextEntry,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import fs from 'fs/promises';
import path from 'path';
import { preAggregatePostProcessor } from '../ee/preAggregates/postProcessor';
import Logger from '../logging/logger';
import { ProjectAdapter, type TrackingParams } from '../types';
import { loadLightdashModels } from './lightdashYamlLoader';

const postProcessors = [preAggregatePostProcessor];

export class LightdashYamlProjectAdapter implements ProjectAdapter {
    private readonly projectDir: string;

    private readonly warehouseClient: WarehouseClient;

    constructor({
        projectDir,
        warehouseClient,
    }: {
        projectDir: string;
        warehouseClient: WarehouseClient;
    }) {
        this.projectDir = projectDir;
        this.warehouseClient = warehouseClient;
    }

    public async compileAllExplores(
        trackingParams?: TrackingParams,
        loadSources: boolean = false,
        allowPartialCompilation: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        Logger.info('Compiling Lightdash YAML models (dbt-less project)');
        const lightdashModels = await loadLightdashModels(this.projectDir);
        if (lightdashModels.length === 0) {
            throw new NotFoundError('No Lightdash YAML models found');
        }

        // Types are declared in the YAML, so the warehouse catalog is not
        // fetched (mirrors the CLI deploy path).
        const dbtModels = convertLightdashModelsToDbtModels(lightdashModels);
        const adapterType = this.warehouseClient.getAdapterType();
        const lightdashProjectConfig = await this.getLightdashProjectConfig();
        const disableTimestampConversion =
            this.warehouseClient.credentials.type === 'snowflake' &&
            this.warehouseClient.credentials.disableTimestampConversion ===
                true;

        const explores = await convertExplores(
            dbtModels,
            loadSources,
            adapterType,
            [],
            this.warehouseClient,
            lightdashProjectConfig,
            {
                disableTimestampConversion,
                allowPartialCompilation,
                postProcessors,
            },
        );
        Logger.info(
            `Finished compiling ${explores.length} Lightdash YAML explore(s)`,
        );
        return explores;
    }

    // eslint-disable-next-line class-methods-use-this
    public async getDbtPackages(): Promise<DbtPackages | undefined> {
        return undefined;
    }

    public async test(): Promise<void> {
        await this.warehouseClient.test();
    }

    // eslint-disable-next-line class-methods-use-this
    public async destroy(): Promise<void> {
        Logger.debug('Destroy Lightdash YAML project adapter');
    }

    public async getLightdashProjectConfig(): Promise<LightdashProjectConfig> {
        const configPath = path.join(this.projectDir, 'lightdash.config.yml');
        try {
            const fileContents = await fs.readFile(configPath, 'utf8');
            return await loadLightdashProjectConfig(fileContents);
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return { spotlight: DEFAULT_SPOTLIGHT_CONFIG };
            }
            throw e;
        }
    }

    public async getProjectContext(): Promise<ProjectContextEntry[]> {
        const contextPath = path.join(
            this.projectDir,
            'lightdash.project_context.yml',
        );
        try {
            const fileContents = await fs.readFile(contextPath, 'utf8');
            return loadProjectContextFile(fileContents);
        } catch (e) {
            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return [];
            }
            throw e;
        }
    }
}
