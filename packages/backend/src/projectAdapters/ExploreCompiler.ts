import {
    AnyType,
    attachTypesToModels,
    convertExplores,
    DbtManifestVersion,
    DbtMetric,
    DbtModelNode,
    DbtPackages,
    DbtRawModelNode,
    DEFAULT_SPOTLIGHT_CONFIG,
    Explore,
    ExploreError,
    friendlyName,
    getCompiledModels,
    getDbtManifestVersion,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    InlineError,
    InlineErrorType,
    isSupportedDbtAdapter,
    LightdashProjectConfig,
    loadLightdashProjectConfig,
    ManifestValidator,
    MissingCatalogEntryError,
    normaliseModelDatabase,
    NotFoundError,
    ParseError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import Logger from '../logging/logger';
import { CachedWarehouse, ProjectAdapter, type TrackingParams } from '../types';
import { ManifestProvider, ProfileGenerator, SourceAccessor } from './types';

export type ExploreCompilerArgs = {
    /** Provides the dbt manifest */
    manifestProvider: ManifestProvider;
    /** Provides access to project source files (optional for cloud/manifest modes) */
    sourceAccessor?: SourceAccessor;
    /** Generates dbt profiles (optional for cloud/manifest modes) */
    profileGenerator?: ProfileGenerator;
    /** Warehouse client for catalog and query operations */
    warehouseClient: WarehouseClient;
    /** Cached warehouse catalog for lazy type attachment */
    cachedWarehouse: CachedWarehouse;
    /** dbt version being used */
    dbtVersion: SupportedDbtVersions;
    /** Analytics instance for tracking */
    analytics?: LightdashAnalytics;
};

/**
 * ExploreCompiler is a composed ProjectAdapter that uses separate components
 * for manifest retrieval, source access, and profile generation.
 *
 * This is the new architecture replacing the inheritance-based adapter chain.
 */
export class ExploreCompiler implements ProjectAdapter {
    private readonly manifestProvider: ManifestProvider;

    private readonly sourceAccessor: SourceAccessor | undefined;

    private readonly profileGenerator: ProfileGenerator | undefined;

    private readonly warehouseClient: WarehouseClient;

    private readonly cachedWarehouse: CachedWarehouse;

    private readonly dbtVersion: SupportedDbtVersions;

    private readonly analytics: LightdashAnalytics | undefined;

    constructor({
        manifestProvider,
        sourceAccessor,
        profileGenerator,
        warehouseClient,
        cachedWarehouse,
        dbtVersion,
        analytics,
    }: ExploreCompilerArgs) {
        this.manifestProvider = manifestProvider;
        this.sourceAccessor = sourceAccessor;
        this.profileGenerator = profileGenerator;
        this.warehouseClient = warehouseClient;
        this.cachedWarehouse = cachedWarehouse;
        this.dbtVersion = dbtVersion;
        this.analytics = analytics;
    }

    async destroy(): Promise<void> {
        Logger.debug('Destroy ExploreCompiler');
        await this.manifestProvider.destroy();
        await this.sourceAccessor?.destroy();
        await this.profileGenerator?.destroy();
    }

    async test(): Promise<void> {
        Logger.debug('Test ExploreCompiler');

        // Refresh source if we have a source accessor
        if (this.sourceAccessor) {
            await this.sourceAccessor.test();
        }

        // Test manifest provider
        await this.manifestProvider.test();

        // Test warehouse client
        await this.warehouseClient.test();
    }

    async getDbtPackages(): Promise<DbtPackages | undefined> {
        Logger.debug('Get dbt packages');
        if (this.manifestProvider.getDbtPackages) {
            return this.manifestProvider.getDbtPackages();
        }
        return undefined;
    }

    async getLightdashProjectConfig(
        trackingParams?: TrackingParams,
    ): Promise<LightdashProjectConfig> {
        const projectDir = this.sourceAccessor?.getProjectDirectory();

        if (!projectDir) {
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }

        const configPath = path.join(projectDir, 'lightdash.config.yml');

        try {
            const fileContents = await fs.readFile(configPath, 'utf8');
            const config = await loadLightdashProjectConfig(
                fileContents,
                async (lightdashConfig) => {
                    if (trackingParams) {
                        void this.analytics?.track({
                            event: 'lightdashconfig.loaded',
                            userId: trackingParams.userUuid,
                            properties: {
                                projectId: trackingParams.projectUuid,
                                userId: trackingParams.userUuid,
                                organizationId: trackingParams.organizationUuid,
                                categories_count: Number(
                                    Object.keys(
                                        lightdashConfig.spotlight.categories ??
                                            {},
                                    ).length,
                                ),
                                default_visibility:
                                    lightdashConfig.spotlight
                                        .default_visibility,
                            },
                        });
                    }
                },
            );
            return config;
        } catch (e) {
            Logger.debug(`No lightdash.config.yml found in ${configPath}`);

            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return {
                    spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                };
            }
            throw e;
        }
    }

    async compileAllExplores(
        trackingParams?: TrackingParams,
        loadSources: boolean = false,
        allowPartialCompilation: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        // Refresh source files if we have a source accessor
        if (this.sourceAccessor) {
            Logger.debug('Refresh source files');
            await this.sourceAccessor.refresh();
        }

        // Install dependencies if manifest provider supports it
        if (this.manifestProvider.installDeps) {
            Logger.debug('Install dependencies');
            await this.manifestProvider.installDeps();
        }

        // Get the manifest
        Logger.debug('Get dbt manifest');
        const { manifest } = await this.manifestProvider.getManifest();

        // Validate adapter type
        if (!isSupportedDbtAdapter(manifest.metadata)) {
            throw new ParseError(
                `Dbt project not supported. Lightdash does not support adapter ${manifest.metadata.adapter_type}`,
                {},
            );
        }

        // Get models from manifest
        let models: DbtRawModelNode[] = [];
        const selector = this.manifestProvider.getSelector();

        if (selector) {
            Logger.info(`Manifest generated with selector "${selector}"`);
            const manifestModels = getModelsFromManifest(manifest);
            Logger.info(`Manifest models ${manifestModels.length}`);
            const compiledModels = getCompiledModels(manifestModels, undefined);
            Logger.info(`Compiled models ${compiledModels.length}`);
            models = compiledModels.filter(
                (node: AnyType) => node.resource_type === 'model' && node.meta,
            ) as DbtRawModelNode[];
            Logger.info(`Filtered models ${models.length}`);
        } else {
            const nodes = Object.values(manifest.nodes);
            Logger.info(`Manifest models ${nodes.length}`);
            models = nodes.filter(
                (node: AnyType) => node.resource_type === 'model' && node.meta,
            ) as DbtRawModelNode[];
            Logger.info(`Filtered models ${models.length}`);
        }

        const adapterType = manifest.metadata.adapter_type;
        const manifestVersion = getDbtManifestVersion(manifest);

        Logger.info(
            `Validate ${models.length} models in manifest with version ${manifestVersion}`,
        );

        if (models.length === 0) {
            throw new NotFoundError('No models found');
        }

        // Validate models
        const [validModels, failedExplores] = ExploreCompiler.validateDbtModel(
            adapterType,
            models,
            manifestVersion,
        );

        // Validate metrics
        const metrics = ExploreCompiler.validateDbtMetrics(
            manifestVersion,
            [
                DbtManifestVersion.V10,
                DbtManifestVersion.V11,
                DbtManifestVersion.V12,
            ].includes(manifestVersion)
                ? []
                : Object.values(manifest.metrics),
        );

        // Load lightdash project config
        const lightdashProjectConfig =
            await this.getLightdashProjectConfig(trackingParams);

        // Try to attach types lazily first
        try {
            if (this.cachedWarehouse?.warehouseCatalog === undefined) {
                throw new MissingCatalogEntryError(
                    'Warehouse catalog is undefined',
                    {},
                );
            }

            Logger.info(`Attach types to ${validModels.length} models`);
            const lazyTypedModels = attachTypesToModels(
                validModels,
                this.cachedWarehouse.warehouseCatalog,
                true,
                adapterType !== 'snowflake',
            );

            Logger.info('Convert explores');
            const disableTimestampConversion =
                this.warehouseClient.credentials.type === 'snowflake' &&
                this.warehouseClient.credentials.disableTimestampConversion ===
                    true;

            const lazyExplores = await convertExplores(
                lazyTypedModels,
                loadSources,
                adapterType,
                metrics,
                this.warehouseClient,
                lightdashProjectConfig,
                disableTimestampConversion,
                allowPartialCompilation,
            );

            Logger.info('Finished compiling explores');
            return [...lazyExplores, ...failedExplores];
        } catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                Logger.info(
                    'Get warehouse catalog after missing catalog error',
                );
                const modelCatalog =
                    getSchemaStructureFromDbtModels(validModels);
                Logger.info(
                    `Fetching table metadata for ${modelCatalog.length} tables`,
                );

                const warehouseCatalog =
                    await this.warehouseClient.getCatalog(modelCatalog);
                await this.cachedWarehouse?.onWarehouseCatalogChange(
                    warehouseCatalog,
                );

                Logger.info(
                    'Attach types to models after missing catalog error',
                );
                const typedModels = attachTypesToModels(
                    validModels,
                    warehouseCatalog,
                    false,
                    adapterType !== 'snowflake',
                );

                Logger.info('Convert explores after missing catalog error');
                const disableTimestampConversion =
                    this.warehouseClient.credentials.type === 'snowflake' &&
                    this.warehouseClient.credentials
                        .disableTimestampConversion === true;

                const explores = await convertExplores(
                    typedModels,
                    loadSources,
                    adapterType,
                    metrics,
                    this.warehouseClient,
                    lightdashProjectConfig,
                    disableTimestampConversion,
                    allowPartialCompilation,
                );

                Logger.info(
                    'Finished compiling explores after missing catalog error',
                );
                return [...explores, ...failedExplores];
            }
            throw e;
        }
    }

    static validateDbtMetrics(
        version: DbtManifestVersion,
        metrics: DbtMetric[],
    ): DbtMetric[] {
        const validator = new ManifestValidator(version);
        metrics.forEach((metric) => {
            const [isValid, errorMessage] = validator.isDbtMetricValid(metric);
            if (!isValid) {
                throw new ParseError(
                    `Could not parse dbt metric with id ${metric.unique_id}: ${errorMessage}`,
                    {},
                );
            }
        });
        return metrics;
    }

    static validateDbtModel(
        adapterType: SupportedDbtAdapter,
        models: DbtRawModelNode[],
        manifestVersion: DbtManifestVersion,
    ): [DbtModelNode[], ExploreError[]] {
        const validator = new ManifestValidator(manifestVersion);
        return models.reduce(
            ([validModels, invalidModels], model) => {
                let error: InlineError | undefined;
                const [isValid, errorMessage] = validator.isModelValid(model);

                if (!isValid) {
                    error = {
                        type: InlineErrorType.METADATA_PARSE_ERROR,
                        message: errorMessage,
                    };
                } else if (
                    isValid &&
                    Object.values(model.columns).length <= 0
                ) {
                    error = {
                        type: InlineErrorType.NO_DIMENSIONS_FOUND,
                        message: 'No dimensions available',
                    };
                }

                if (error) {
                    const exploreError: ExploreError = {
                        name: model.name,
                        label: model.meta.label || friendlyName(model.name),
                        groupLabel: model.meta.group_label,
                        errors: [
                            error.type === InlineErrorType.METADATA_PARSE_ERROR
                                ? {
                                      ...error,
                                      message: `${model.name ? `${model.name}: ` : ''}${error.message}`,
                                  }
                                : error,
                        ],
                    };
                    return [validModels, [...invalidModels, exploreError]];
                }

                const validatedModel = normaliseModelDatabase(
                    model,
                    adapterType,
                );
                return [[...validModels, validatedModel], invalidModels];
            },
            [[] as DbtModelNode[], [] as ExploreError[]],
        );
    }
}
