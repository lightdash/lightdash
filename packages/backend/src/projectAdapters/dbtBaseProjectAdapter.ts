import {
    attachTypesToModels,
    convertExplores,
    DbtManifestVersion,
    DbtMetric,
    DbtModelNode,
    DbtPackages,
    DbtRawModelNode,
    Explore,
    ExploreError,
    friendlyName,
    GetDbtManifestVersion,
    getSchemaStructureFromDbtModels,
    InlineError,
    InlineErrorType,
    isSupportedDbtAdapter,
    ManifestValidator,
    MissingCatalogEntryError,
    normaliseModelDatabase,
    ParseError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import { CachedWarehouse, DbtClient, ProjectAdapter } from '../types';

export class DbtBaseProjectAdapter implements ProjectAdapter {
    dbtClient: DbtClient;

    warehouseClient: WarehouseClient;

    cachedWarehouse: CachedWarehouse;

    dbtVersion: SupportedDbtVersions;

    constructor(
        dbtClient: DbtClient,
        warehouseClient: WarehouseClient,
        cachedWarehouse: CachedWarehouse,
        dbtVersion: SupportedDbtVersions,
    ) {
        this.dbtClient = dbtClient;
        this.warehouseClient = warehouseClient;
        this.cachedWarehouse = cachedWarehouse;
        this.dbtVersion = dbtVersion;
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

    public async compileAllExplores(
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
        const adapterType = manifest.metadata.adapter_type;

        // Validate models in the manifest - models with invalid metadata will compile to failed Explores
        const models = Object.values(manifest.nodes).filter(
            (node: any) => node.resource_type === 'model' && node.meta !== null, //
        ) as DbtRawModelNode[];
        const manifestVersion = GetDbtManifestVersion(this.dbtVersion);
        Logger.debug(
            `Validate ${models.length} models in manifest with version ${manifestVersion}`,
        );

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

        // Be lazy and try to attach types to the remaining models without refreshing the catalog
        try {
            if (this.cachedWarehouse?.warehouseCatalog === undefined) {
                throw new MissingCatalogEntryError(
                    `Warehouse catalog is undefined`,
                    {},
                );
            }
            Logger.debug(`Attach types to ${validModels.length} models`);
            const lazyTypedModels = attachTypesToModels(
                validModels,
                this.cachedWarehouse.warehouseCatalog,
                true,
                adapterType !== 'snowflake',
            );
            Logger.debug('Convert explores');
            const lazyExplores = await convertExplores(
                lazyTypedModels,
                loadSources,
                adapterType,
                metrics,
                this.warehouseClient,
            );
            return [...lazyExplores, ...failedExplores];
        } catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                Logger.debug(
                    'Get warehouse catalog after missing catalog error',
                );
                const modelCatalog =
                    getSchemaStructureFromDbtModels(validModels);
                Logger.debug(
                    `Fetching table metadata for ${modelCatalog.length} tables`,
                );

                const warehouseCatalog = await this.warehouseClient.getCatalog(
                    modelCatalog,
                );
                await this.cachedWarehouse?.onWarehouseCatalogChange(
                    warehouseCatalog,
                );

                Logger.debug(
                    'Attach types to models after missing catalog error',
                );
                // Some types were missing so refresh the schema and try again
                const typedModels = attachTypesToModels(
                    validModels,
                    warehouseCatalog,
                    false,
                    adapterType !== 'snowflake',
                );
                Logger.debug('Convert explores after missing catalog error');
                const explores = await convertExplores(
                    typedModels,
                    loadSources,
                    adapterType,
                    metrics,
                    this.warehouseClient,
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
