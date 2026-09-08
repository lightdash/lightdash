import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    isExploreError,
    loadLightdashProjectConfig,
    loadProjectContextFile,
    ParameterError,
    ParseError,
    validateGithubToken,
    type Explore,
    type LightdashProjectConfig,
    type ProjectContextEntry,
    type WarehouseClient,
} from '@lightdash/common';
import { loadLightdashModels } from '@lightdash/common/lightdash/loader';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import simpleGit from 'simple-git';
import {
    createGithubGitCredentialFiles,
    type GitCredentialFiles,
} from '../dbt/gitCredentials';
import { preAggregatePostProcessor } from '../ee/preAggregates/postProcessor';
import { type ProjectAdapter, type TrackingParams } from '../types';
import { DEFAULT_GITHUB_HOST_DOMAIN } from '../utils/credentialDestination';
import { GitRepository } from './gitRepository';

export class NativeGithubProjectAdapter implements ProjectAdapter {
    readonly dbtProjectDir: string;

    private readonly localRepositoryDir: string;

    private readonly credentials: GitCredentialFiles;

    private readonly checkout: GitRepository;

    private readonly warehouseClient: WarehouseClient;

    constructor({
        warehouseClient,
        token,
        repository,
        branch,
        projectSubPath,
        hostDomain,
    }: {
        warehouseClient: WarehouseClient;
        token: string;
        repository: string;
        branch: string;
        projectSubPath: string;
        hostDomain?: string;
    }) {
        const [valid, error] = validateGithubToken(token);
        if (!valid) throw new ParameterError(error);
        const subPath = projectSubPath.replace(/^\/+/, '');
        if (subPath.split('/').includes('..') || subPath.includes('\\')) {
            throw new ParameterError(
                'Project subdirectory must stay within the Git repository',
            );
        }
        const host = hostDomain || DEFAULT_GITHUB_HOST_DOMAIN;
        this.credentials = createGithubGitCredentialFiles({ host, token });
        this.localRepositoryDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'native_git_'),
        );
        this.dbtProjectDir = path.join(this.localRepositoryDir, subPath);
        this.warehouseClient = warehouseClient;
        this.checkout = new GitRepository(
            simpleGit({ unsafe: { allowUnsafeConfigPaths: true } }).env(
                'GIT_CONFIG_GLOBAL',
                this.credentials.configPath,
            ),
            this.localRepositoryDir,
            `https://${host}/${repository}.git`,
            repository,
            branch,
        );
    }

    private async assertWithinCheckout(filePath: string): Promise<void> {
        const relativePath = path.relative(
            await fsp.realpath(this.localRepositoryDir),
            await fsp.realpath(filePath),
        );
        if (
            relativePath === '..' ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw new ParameterError(
                'Native project files must stay within the Git repository',
            );
        }
    }

    private async readConfigFile(name: string): Promise<string | null> {
        const filePath = path.join(this.dbtProjectDir, name);
        try {
            await this.assertWithinCheckout(filePath);
            return await fsp.readFile(filePath, 'utf8');
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === 'ENOENT'
            )
                return null;
            throw error;
        }
    }

    async getLightdashProjectConfig(): Promise<LightdashProjectConfig> {
        const contents = await this.readConfigFile('lightdash.config.yml');
        return contents === null
            ? { spotlight: DEFAULT_SPOTLIGHT_CONFIG }
            : loadLightdashProjectConfig(contents);
    }

    async getProjectContext(): Promise<ProjectContextEntry[]> {
        const contents = await this.readConfigFile(
            'lightdash.project_context.yml',
        );
        return contents === null ? [] : loadProjectContextFile(contents);
    }

    async compileAllExplores(
        _trackingParams?: TrackingParams,
        loadSources = false,
    ): Promise<Explore[]> {
        await this.checkout.refresh();
        await this.assertWithinCheckout(this.dbtProjectDir);
        const models = await loadLightdashModels(this.dbtProjectDir);
        if (models.length === 0) {
            throw new ParseError(
                'No native Lightdash models found. Add model YAML files under models/ or lightdash/models/ in the configured project subdirectory.',
            );
        }
        const explores = await compileLightdashModels({
            models,
            warehouseSqlBuilder: this.warehouseClient,
            lightdashProjectConfig: await this.getLightdashProjectConfig(),
            loadSources,
            allowPartialCompilation: false,
            disableTimestampConversion:
                this.warehouseClient.credentials.type === 'snowflake' &&
                this.warehouseClient.credentials.disableTimestampConversion ===
                    true,
            postProcessors: [preAggregatePostProcessor],
        });
        const failures = explores.filter(isExploreError);
        if (failures.length > 0) {
            throw new ParseError(
                `Native YAML compilation failed: ${failures.map((explore) => `${explore.name}: ${explore.errors.map((error) => error.message).join('; ')}`).join('\n')}`,
            );
        }
        return explores.filter(
            (explore): explore is Explore => !isExploreError(explore),
        );
    }

    async prepareExploreStream(
        trackingParams?: TrackingParams,
        loadSources = false,
    ): Promise<AsyncIterable<Explore>> {
        const explores = await this.compileAllExplores(
            trackingParams,
            loadSources,
        );
        return (async function* stream() {
            yield* explores;
        })();
    }

    async test(): Promise<void> {
        await this.compileAllExplores();
        await this.warehouseClient.test();
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtPackages(): Promise<undefined> {
        return undefined;
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtManifest(): Promise<never> {
        throw new ParameterError(
            'Native YAML projects cannot be combined with additional dbt sources.',
        );
    }

    async destroy(): Promise<void> {
        try {
            await fsp.rm(this.localRepositoryDir, {
                recursive: true,
                force: true,
            });
        } finally {
            await fsp.rm(this.credentials.directory, {
                recursive: true,
                force: true,
            });
        }
    }
}
