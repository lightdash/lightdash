import {
    AnyType,
    DEFAULT_SPOTLIGHT_CONFIG,
    DbtManifestVersion,
    DbtMetric,
    DbtModelNode,
    DbtPackages,
    DbtRawModelNode,
    Explore,
    ExploreError,
    InlineError,
    InlineErrorType,
    ManifestValidator,
    MissingCatalogEntryError,
    NotFoundError,
    ParseError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    attachTypesToModels,
    convertExplores,
    friendlyName,
    getCompiledModels,
    getDbtManifestVersion,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    isSupportedDbtAdapter,
    loadLightdashProjectConfig,
    normaliseModelDatabase,
    type LightdashProjectConfig,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import fs from 'fs/promises';
import path from 'path';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import Logger from '../logging/logger';
import { CachedWarehouse, DbtClient, ProjectAdapter } from '../types';

export class DbtBaseProjectAdapter implements ProjectAdapter {
    dbtClient: DbtClient;

    warehouseClient: WarehouseClient;

    cachedWarehouse: CachedWarehouse;

    dbtVersion: SupportedDbtVersions;

    private readonly analytics: LightdashAnalytics | undefined;

    dbtProjectDir?: string;

    constructor(
        dbtClient: DbtClient,
        warehouseClient: WarehouseClient,
        cachedWarehouse: CachedWarehouse,
        dbtVersion: SupportedDbtVersions,
        dbtProjectDir?: string,
        analytics?: LightdashAnalytics,
    ) {
        this.dbtClient = dbtClient;
        this.warehouseClient = warehouseClient;
        this.cachedWarehouse = cachedWarehouse;
        this.dbtVersion = dbtVersion;
        this.dbtProjectDir = dbtProjectDir;
        this.analytics = analytics;
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug(`Destroy base project adapter`);
    }

    public async test(): Promise<void> {
        Logger.debug('Test dbt client');
        await this.dbtClient.test();
        Logger.debug('Test warehouse client');
        await this.warehouseClient.test();
    }

    public async getDbtPackages(): Promise<DbtPackages | undefined> {
        Logger.debug(`Get dbt packages`);
        if (this.dbtClient.getDbtPackages) {
            return this.dbtClient.getDbtPackages();
        }
        return undefined;
    }

    public async getLightdashProjectConfig(trackingParams?: {
        projectUuid: string;
        organizationUuid: string;
        userUuid: string;
    }): Promise<LightdashProjectConfig> {
        if (!this.dbtProjectDir) {
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }

        const configPath = path.join(
            this.dbtProjectDir,
            'lightdash.config.yml',
        );

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
                // Return default config if file doesn't exist
                return {
                    spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                };
            }
            throw e;
        }
    }

    public async compileAllExplores(
        trackingParams?: {
            userUuid: string;
            organizationUuid: string;
            projectUuid: string;
        },
        loadSources: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        Logger.debug('Install dependencies');
        // Install dependencies for dbt and fetch the manifest - may raise error meaning no explores compile
        if (this.dbtClient.installDeps !== undefined) {
            await this.dbtClient.installDeps();
        }
        Logger.debug('Get dbt manifest');
        const { manifest } = await this.dbtClient.getDbtManifest();
        // Type of the target warehouse
        if (!isSupportedDbtAdapter(manifest.metadata)) {
            throw new ParseError(
                `Dbt project not supported. Lightdash does not support adapter ${manifest.metadata.adapter_type}`,
                {},
            );
        }
        let models: DbtRawModelNode[] = [];

        if (this.dbtClient.getSelector()) {
            Logger.info(
                `Manifest generated with selector "${this.dbtClient.getSelector()}"`,
            );
            // If selector is provided, we use compile to get the models that match the selector
            const manifestModels = getModelsFromManifest(manifest);
            Logger.info(`Manifest models ${manifestModels.length}`);
            const compiledModels = getCompiledModels(manifestModels, undefined);
            Logger.info(`Compiled models ${compiledModels.length}`);
            models = compiledModels.filter(
                (node: AnyType) => node.resource_type === 'model' && node.meta, // check that node.meta exists
            ) as DbtRawModelNode[];
            Logger.info(`Filtered models ${models.length}`);
        } else {
            const nodes = Object.values(manifest.nodes);
            Logger.info(`Manifest models ${nodes.length}`);
            // If selector is not provided, we use all the models from the manifest
            // models with invalid metadata will compile to failed Explores
            models = nodes.filter(
                (node: AnyType) => node.resource_type === 'model' && node.meta, // check that node.meta exists
            ) as DbtRawModelNode[];
            Logger.info(`Filtered models ${models.length}`);
        }

        const adapterType = manifest.metadata.adapter_type;

        const manifestVersion = getDbtManifestVersion(manifest);
        Logger.info(
            `Validate ${models.length} models in manifest with version ${manifestVersion}`,
        );

        if (models.length === 0) {
            throw new NotFoundError(`No models found`);
        }

        const [validModels, failedExplores] =
            DbtBaseProjectAdapter._validateDbtModel(
                adapterType,
                models,
                manifestVersion,
            );

        // Validate metrics in the manifest - compile fails if any invalid
        const metrics = DbtBaseProjectAdapter._validateDbtMetrics(
            manifestVersion,
            [
                DbtManifestVersion.V10,
                DbtManifestVersion.V11,
                DbtManifestVersion.V12,
            ].includes(manifestVersion)
                ? []
                : Object.values(manifest.metrics),
        );

        const lightdashProjectConfig = await this.getLightdashProjectConfig(
            trackingParams,
        );

        // Be lazy and try to attach types to the remaining models without refreshing the catalog
        try {
            if (this.cachedWarehouse?.warehouseCatalog === undefined) {
                throw new MissingCatalogEntryError(
                    `Warehouse catalog is undefined`,
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
            const lazyExplores = await convertExplores(
                lazyTypedModels,
                loadSources,
                adapterType,
                metrics,
                this.warehouseClient,
                lightdashProjectConfig,
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

                const warehouseCatalog = await this.warehouseClient.getCatalog(
                    modelCatalog,
                );
                await this.cachedWarehouse?.onWarehouseCatalogChange(
                    warehouseCatalog,
                );

                Logger.info(
                    'Attach types to models after missing catalog error',
                );
                // Some types were missing so refresh the schema and try again
                const typedModels = attachTypesToModels(
                    validModels,
                    warehouseCatalog,
                    false,
                    adapterType !== 'snowflake',
                );
                Logger.info('Convert explores after missing catalog error');
                const explores = await convertExplores(
                    typedModels,
                    loadSources,
                    adapterType,
                    metrics,
                    this.warehouseClient,
                    lightdashProjectConfig,
                );
                Logger.info(
                    'Finished compiling explores after missing catalog error',
                );
                return [...explores, ...failedExplores];
            }
            throw e;
        }
    }

    static _validateDbtMetrics(
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

    static _validateDbtModel(
        adapterType: SupportedDbtAdapter,
        models: DbtRawModelNode[],
        manifestVersion: DbtManifestVersion,
    ): [DbtModelNode[], ExploreError[]] {
        const validator = new ManifestValidator(manifestVersion);
        return models.reduce(
            ([validModels, invalidModels], model) => {
                let error: InlineError | undefined;
                // Match against json schema
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
                                      message: `${
                                          model.name ? `${model.name}: ` : ''
                                      }${error.message}`,
                                  }
                                : error,
                        ],
                    };
                    return [validModels, [...invalidModels, exploreError]];
                }
                // Fix null databases
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
