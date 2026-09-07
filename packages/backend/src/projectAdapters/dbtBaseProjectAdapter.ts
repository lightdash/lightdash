import {
    AnyType,
    applyMetricFlowMetricsToModels,
    attachTypesToModels,
    catalogHasTimestampDomains,
    DbtManifestVersion,
    DbtModelNode,
    DbtPackages,
    DbtRawModelNode,
    DbtRpcGetManifestResults,
    DEFAULT_SPOTLIGHT_CONFIG,
    ensureCatalogTimestampDomainsKey,
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
    iterateExplores,
    loadLightdashProjectConfig,
    loadProjectContextFile,
    MissingCatalogEntryError,
    normaliseModelDatabase,
    NotFoundError,
    ParseError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    WAREHOUSE_TIMESTAMP_DOMAINS_KEY,
    type AttachTypesDiagnostics,
    type LightdashProjectConfig,
    type ProjectContextEntry,
    type WarehouseCatalog,
    type WarehouseCatalogTable,
} from '@lightdash/common';
import { ManifestValidator } from '@lightdash/common/dbt/validation';
import { WarehouseClient } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { preAggregatePostProcessor } from '../ee/preAggregates/postProcessor';
import Logger from '../logging/logger';
import { traceSpan } from '../tracing/tracing';
import {
    CachedWarehouse,
    DbtClient,
    ProjectAdapter,
    type ExploreCompileOptions,
    type TrackingParams,
} from '../types';

const postProcessors = [preAggregatePostProcessor];
const DEFAULT_WAREHOUSE_CATALOG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type WarehouseCatalogFetchReason =
    | 'cache_miss'
    | 'known_missing_skipped'
    | 'cache_expired'
    | 'manual';

const warehouseCatalogTableKey = ({
    database,
    schema,
    table,
}: WarehouseCatalogTable) => `${database}\u0000${schema}\u0000${table}`;

export const findMissingWarehouseTables = (
    models: DbtModelNode[],
    warehouseCatalog: WarehouseCatalog,
    caseSensitiveMatching: boolean,
): WarehouseCatalogTable[] => {
    const catalogKeys = new Set<string>();
    Object.entries(warehouseCatalog).forEach(([database, schemas]) => {
        if (database === WAREHOUSE_TIMESTAMP_DOMAINS_KEY) return;
        Object.entries(schemas ?? {}).forEach(([schema, tables]) => {
            Object.entries(tables ?? {}).forEach(([table, columns]) => {
                if (columns == null) return;
                const reference = { database, schema, table };
                const key = warehouseCatalogTableKey(reference);
                catalogKeys.add(
                    caseSensitiveMatching ? key : key.toLowerCase(),
                );
            });
        });
    });

    const references = models.flatMap(({ database, schema, name, alias }) => [
        { database, schema, table: name },
        { database, schema, table: alias || name },
    ]);
    const missing = new Map<string, WarehouseCatalogTable>();
    references.forEach((reference) => {
        const key = warehouseCatalogTableKey(reference);
        const matchKey = caseSensitiveMatching ? key : key.toLowerCase();
        if (!catalogKeys.has(matchKey) && !missing.has(matchKey)) {
            missing.set(matchKey, reference);
        }
    });
    return [...missing.values()];
};

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

    async destroy(): Promise<void> {
        Logger.debug(`Destroy base project adapter`);
        await this.dbtClient.cleanup?.();
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

    public async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        // Install dependencies first (same as compileAllExplores) — a git source's
        // `dbt ls` fails without its packages installed.
        if (this.dbtClient.installDeps !== undefined) {
            Logger.debug('Install dependencies');
            await this.dbtClient.installDeps();
        }
        Logger.debug(`Get dbt manifest`);
        return this.dbtClient.getDbtManifest();
    }

    public async getLightdashProjectConfig(
        trackingParams?: TrackingParams,
    ): Promise<LightdashProjectConfig> {
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

    public async getProjectContext(): Promise<ProjectContextEntry[]> {
        if (!this.dbtProjectDir) {
            return [];
        }

        const configPath = path.join(
            this.dbtProjectDir,
            'lightdash.project_context.yml',
        );

        try {
            const fileContents = await fs.readFile(configPath, 'utf8');
            return loadProjectContextFile(fileContents);
        } catch (e) {
            Logger.debug(
                `No lightdash.project_context.yml found in ${configPath}`,
            );

            if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
                return [];
            }
            throw e;
        }
    }

    public async compileAllExplores(
        trackingParams?: TrackingParams,
        loadSources: boolean = false,
        allowPartialCompilation: boolean = true,
        compileOptions?: ExploreCompileOptions,
    ): Promise<(Explore | ExploreError)[]> {
        const stream = await this.prepareExploreStream(
            trackingParams,
            loadSources,
            allowPartialCompilation,
            compileOptions,
        );
        const explores: (Explore | ExploreError)[] = [];
        for await (const explore of stream) explores.push(explore);
        return explores;
    }

    public async prepareExploreStream(
        trackingParams?: TrackingParams,
        loadSources: boolean = false,
        allowPartialCompilation: boolean = true,
        compileOptions?: ExploreCompileOptions,
    ): Promise<AsyncIterable<Explore | ExploreError>> {
        const unnestRepeatedColumns =
            compileOptions?.unnestRepeatedColumns ?? false;
        Logger.debug('Install dependencies');
        // Install dependencies for dbt and fetch the manifest - may raise error meaning no explores compile
        if (this.dbtClient.installDeps !== undefined) {
            await this.dbtClient.installDeps();
        }
        Logger.debug('Get dbt manifest');
        const { manifest, selectedModelIds } =
            await this.dbtClient.getDbtManifest();
        // Type of the target warehouse
        if (!isSupportedDbtAdapter(manifest.metadata)) {
            throw new ParseError(
                `Dbt project not supported. Lightdash does not support adapter ${manifest.metadata.adapter_type}`,
                {},
            );
        }

        if (selectedModelIds) {
            Logger.info(
                `Manifest generated with selector, matched ${selectedModelIds.length} model(s)`,
            );
        }

        const models = traceSpan(
            { op: 'dbt', name: 'filterManifestModels' },
            () => {
                const startTime = Date.now();
                const manifestModels = getModelsFromManifest(manifest);
                Logger.info(`Manifest models ${manifestModels.length}`);
                const compiledModels = getCompiledModels(
                    manifestModels,
                    selectedModelIds,
                );
                Logger.info(`Compiled models ${compiledModels.length}`);
                const filtered = compiledModels.filter(
                    (node: AnyType) =>
                        ['model', 'seed'].includes(node.resource_type) &&
                        node.meta,
                ) as DbtRawModelNode[];
                const elapsed = Date.now() - startTime;
                Logger.info(
                    `Filtered to ${filtered.length} model(s) in ${elapsed}ms`,
                );
                return filtered;
            },
        );

        const adapterType = manifest.metadata.adapter_type;

        const manifestVersion = getDbtManifestVersion(manifest);
        Logger.info(
            `Validate ${models.length} models in manifest with version ${manifestVersion}`,
        );

        if (models.length === 0) {
            throw new NotFoundError(`No models found`);
        }

        const [validatedModels, failedExplores] =
            DbtBaseProjectAdapter._validateDbtModel(
                adapterType,
                models,
                manifestVersion,
            );

        // Translate MetricFlow definitions (semantic_models + metrics) into
        // Lightdash metrics on each model, mirroring the CLI compile.
        // Best-effort: translation failures never abort the compile.
        const metricFlowTranslation = applyMetricFlowMetricsToModels(
            validatedModels,
            manifest,
        );
        if (metricFlowTranslation.error !== null) {
            Logger.warn(
                `Failed to translate MetricFlow metrics, continuing without them: ${metricFlowTranslation.error}`,
            );
        }
        metricFlowTranslation.warnings.forEach((warning) =>
            Logger.debug(warning),
        );
        if (
            metricFlowTranslation.translatedCount > 0 ||
            metricFlowTranslation.skippedCount > 0
        ) {
            Logger.info(
                `Translated ${metricFlowTranslation.translatedCount} MetricFlow metric(s) into Lightdash metrics (skipped ${metricFlowTranslation.skippedCount} unsupported)`,
            );
        }
        const validModels = metricFlowTranslation.models;

        const lightdashProjectConfig =
            await this.getLightdashProjectConfig(trackingParams);
        const caseSensitiveMatching = adapterType !== 'snowflake';
        const modelCatalog = getSchemaStructureFromDbtModels(validModels);
        const cachedCatalog = this.cachedWarehouse.warehouseCatalog;
        const fetchedAt = this.cachedWarehouse.warehouseCatalogFetchedAt;
        const knownMissingTables =
            fetchedAt == null
                ? []
                : (this.cachedWarehouse.missingWarehouseTables ?? []);
        const maxAgeMs =
            this.cachedWarehouse.warehouseCatalogMaxAgeMs ??
            DEFAULT_WAREHOUSE_CATALOG_CACHE_MAX_AGE_MS;
        let fetchReason: Exclude<
            WarehouseCatalogFetchReason,
            'known_missing_skipped'
        > = 'cache_miss';

        if (cachedCatalog === undefined) {
            fetchReason = 'cache_miss';
        } else if (this.cachedWarehouse.manualWarehouseCatalogRefresh) {
            fetchReason = 'manual';
        } else if (!catalogHasTimestampDomains(cachedCatalog)) {
            fetchReason = 'cache_miss';
        } else if (
            fetchedAt != null &&
            Date.now() - fetchedAt.getTime() >= maxAgeMs
        ) {
            fetchReason = 'cache_expired';
        } else {
            try {
                const lazyTypedModels = attachTypesToModels(
                    validModels,
                    cachedCatalog,
                    true,
                    caseSensitiveMatching,
                    (diagnostics) =>
                        DbtBaseProjectAdapter.logAttachTypesPhase(
                            'cached_catalog',
                            trackingParams,
                            diagnostics,
                            knownMissingTables.length,
                        ),
                    knownMissingTables,
                );
                const currentlyMissingTables = findMissingWarehouseTables(
                    validModels,
                    cachedCatalog,
                    caseSensitiveMatching,
                );
                if (currentlyMissingTables.length > 0) {
                    DbtBaseProjectAdapter.logWarehouseCatalogFetch(
                        'known_missing_skipped',
                        trackingParams,
                        this.warehouseClient,
                        modelCatalog.length,
                        0,
                        knownMissingTables.length,
                    );
                }
                Logger.info('Convert explores');
                const disableTimestampConversion =
                    this.warehouseClient.credentials.type === 'snowflake' &&
                    this.warehouseClient.credentials
                        .disableTimestampConversion === true;
                const lazyExplores = iterateExplores(
                    lazyTypedModels,
                    loadSources,
                    adapterType,
                    this.warehouseClient,
                    lightdashProjectConfig,
                    {
                        disableTimestampConversion,
                        allowPartialCompilation,
                        postProcessors,
                        unnestRepeatedColumns,
                    },
                );
                return (async function* compiledExplores() {
                    yield* lazyExplores;
                    yield* failedExplores;
                    Logger.info('Finished compiling explores');
                })();
            } catch (e) {
                if (!(e instanceof MissingCatalogEntryError)) {
                    throw e;
                }
                fetchReason = 'cache_miss';
            }
        }

        Logger.info('Get warehouse catalog after missing catalog error');
        const catalogFetchStartedAt = Date.now();
        const warehouseCatalog =
            await this.warehouseClient.getCatalog(modelCatalog);
        ensureCatalogTimestampDomainsKey(warehouseCatalog);
        const missingTables = findMissingWarehouseTables(
            validModels,
            warehouseCatalog,
            caseSensitiveMatching,
        );
        DbtBaseProjectAdapter.logWarehouseCatalogFetch(
            fetchReason,
            trackingParams,
            this.warehouseClient,
            modelCatalog.length,
            Date.now() - catalogFetchStartedAt,
            missingTables.length,
        );
        await this.cachedWarehouse.onWarehouseCatalogChange({
            warehouseCatalog,
            fetchedAt: new Date(),
            missingTables,
        });
        const typedModels = attachTypesToModels(
            validModels,
            warehouseCatalog,
            false,
            caseSensitiveMatching,
            (diagnostics) =>
                DbtBaseProjectAdapter.logAttachTypesPhase(
                    'refetched_catalog',
                    trackingParams,
                    diagnostics,
                    missingTables.length,
                ),
        );
        Logger.info('Convert explores after missing catalog error');
        const disableTimestampConversion =
            this.warehouseClient.credentials.type === 'snowflake' &&
            this.warehouseClient.credentials.disableTimestampConversion ===
                true;
        const explores = iterateExplores(
            typedModels,
            loadSources,
            adapterType,
            this.warehouseClient,
            lightdashProjectConfig,
            {
                disableTimestampConversion,
                allowPartialCompilation,
                postProcessors,
                unnestRepeatedColumns,
            },
        );
        return (async function* compiledExplores() {
            yield* explores;
            yield* failedExplores;
            Logger.info('Finished compiling explores after missing catalog error');
        })();
    }

    private static logWarehouseCatalogFetch(
        reason: WarehouseCatalogFetchReason,
        trackingParams: TrackingParams | undefined,
        warehouseClient: WarehouseClient,
        requestedTables: number,
        durationMs: number,
        knownMissing: number,
    ) {
        Logger.info(
            `dbt.compile.warehouseCatalogFetch reason=${reason} knownMissing=${knownMissing} durationMs=${durationMs}`,
            {
                event: 'dbt.compile.warehouseCatalogFetch',
                projectUuid: trackingParams?.projectUuid ?? null,
                jobUuid: trackingParams?.jobUuid ?? null,
                warehouseType: warehouseClient.credentials.type,
                requestedTables,
                durationMs,
                reason,
                knownMissing,
            },
        );
    }

    private static logAttachTypesPhase(
        catalogSource: 'cached_catalog' | 'refetched_catalog',
        trackingParams: TrackingParams | undefined,
        diagnostics: AttachTypesDiagnostics,
        knownMissing: number,
    ) {
        Logger.info(
            `dbt.compile.attachTypes catalogSource=${catalogSource} knownMissing=${knownMissing} durationMs=${diagnostics.durationMs}`,
            {
                event: 'dbt.compile.attachTypes',
                projectUuid: trackingParams?.projectUuid ?? null,
                jobUuid: trackingParams?.jobUuid ?? null,
                catalogSource,
                knownMissing,
                durationMs: diagnostics.durationMs,
                modelCount: diagnostics.modelCount,
                columnCount: diagnostics.columnCount,
                catalogTableCount: diagnostics.catalogTableCount,
                distinctSchemaCount: diagnostics.schemaPairs.length,
                schemaPairs: diagnostics.schemaPairs.slice(0, 20),
                exactLookups: diagnostics.exactLookups,
                caseInsensitiveLookups: diagnostics.caseInsensitiveLookups,
                missingLookups: diagnostics.missingLookups,
            },
        );
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
                    // Seeds that fail validation are silently skipped —
                    // they're only used as join targets, not standalone explores.
                    if (model.resource_type === 'seed') {
                        return [validModels, invalidModels];
                    }
                    const metaGroups: string[] | undefined = model.meta.groups;
                    const exploreError: ExploreError = {
                        name: model.name,
                        label: model.meta.label || friendlyName(model.name),
                        groupLabel: model.meta.group_label,
                        ...(metaGroups && metaGroups.length > 0
                            ? { groups: metaGroups }
                            : {}),
                        errors: [error],
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
