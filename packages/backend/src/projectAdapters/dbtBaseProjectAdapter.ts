import {
    AnyType,
    applyMetricFlowMetricsToModels,
    attachTypesToModels,
    catalogHasTimestampDomains,
    DbtManifestVersion,
    DbtModelNode,
    DbtPackages,
    DbtRawModelNode,
    DEFAULT_SPOTLIGHT_CONFIG,
    ensureCatalogTimestampDomainsKey,
    Explore,
    ExploreError,
    friendlyName,
    getCompiledModels,
    getDbtManifestVersion,
    getMissingCatalogEntries,
    getModelsFromManifest,
    getSchemaStructureFromDbtModels,
    haveMissingCatalogEntriesChanged,
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
    setCatalogMissingEntries,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    type AttachTypesDiagnostics,
    type LightdashProjectConfig,
    type ProjectContextEntry,
    type WarehouseCatalogMissingEntry,
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
    DbtManifestFetchResult,
    ProjectAdapter,
    type TrackingParams,
} from '../types';

const postProcessors = [preAggregatePostProcessor];

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

    public async getDbtManifest(): Promise<DbtManifestFetchResult> {
        // Install dependencies first (same as compileAllExplores) — a git source's
        // `dbt ls` fails without its packages installed.
        let depsMs: number | null = null;
        if (this.dbtClient.installDeps !== undefined) {
            Logger.debug('Install dependencies');
            const depsStartedAt = Date.now();
            await this.dbtClient.installDeps();
            depsMs = Date.now() - depsStartedAt;
        }
        Logger.debug(`Get dbt manifest`);
        const manifestStartedAt = Date.now();
        const result = await this.dbtClient.getDbtManifest();
        return {
            ...result,
            timings: {
                gitRefreshMs: null,
                depsMs,
                manifestMs: Date.now() - manifestStartedAt,
            },
        };
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
    ): Promise<(Explore | ExploreError)[]> {
        const stream = await this.prepareExploreStream(
            trackingParams,
            loadSources,
            allowPartialCompilation,
        );
        const explores: (Explore | ExploreError)[] = [];
        for await (const explore of stream) explores.push(explore);
        return explores;
    }

    public async prepareExploreStream(
        trackingParams?: TrackingParams,
        loadSources: boolean = false,
        allowPartialCompilation: boolean = true,
    ): Promise<AsyncIterable<Explore | ExploreError>> {
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

        const typedModels = await this.attachTypes(
            validModels,
            adapterType,
            trackingParams,
        );
        Logger.info('Convert explores');
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
            },
        );
        return (async function* compiledExplores() {
            yield* explores;
            yield* failedExplores;
            Logger.info('Finished compiling explores');
        })();
    }

    private async attachTypes(
        models: DbtModelNode[],
        adapterType: SupportedDbtAdapter,
        trackingParams: TrackingParams | undefined,
    ): Promise<DbtModelNode[]> {
        const caseSensitiveMatching = adapterType !== 'snowflake';
        const cachedCatalog = this.cachedWarehouse?.warehouseCatalog;
        if (cachedCatalog === undefined) {
            return this.attachTypesAfterCatalogFetch(
                models,
                caseSensitiveMatching,
                'no_cache',
                trackingParams,
            );
        }
        // A cache written before timestamp domains existed would otherwise
        // be reused forever (only missing entries trigger a refetch),
        // leaving every column unclassified — refetch it once.
        if (!catalogHasTimestampDomains(cachedCatalog)) {
            return this.attachTypesAfterCatalogFetch(
                models,
                caseSensitiveMatching,
                'cache_predates_timestamp_domains',
                trackingParams,
            );
        }

        const { knownMissing, unknownMissing } = getMissingCatalogEntries(
            cachedCatalog,
            models,
            caseSensitiveMatching,
        );
        if (unknownMissing.length > 0) {
            return this.attachTypesAfterCatalogFetch(
                models,
                caseSensitiveMatching,
                'cache_miss',
                trackingParams,
            );
        }
        if (
            knownMissing.length > 0 &&
            (await this.haveKnownMissingEntriesChanged(
                models,
                knownMissing,
                caseSensitiveMatching,
                trackingParams,
            ))
        ) {
            return this.attachTypesAfterCatalogFetch(
                models,
                caseSensitiveMatching,
                'known_missing_changed',
                trackingParams,
            );
        }

        try {
            return attachTypesToModels(
                models,
                cachedCatalog,
                true,
                caseSensitiveMatching,
                (diagnostics) =>
                    DbtBaseProjectAdapter.logAttachTypesPhase(
                        'cached_catalog',
                        knownMissing,
                        trackingParams,
                        diagnostics,
                    ),
                knownMissing,
            );
        } catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                return this.attachTypesAfterCatalogFetch(
                    models,
                    caseSensitiveMatching,
                    'cache_miss',
                    trackingParams,
                );
            }
            throw e;
        }
    }

    private async haveKnownMissingEntriesChanged(
        models: DbtModelNode[],
        knownMissing: WarehouseCatalogMissingEntry[],
        caseSensitiveMatching: boolean,
        trackingParams: TrackingParams | undefined,
    ): Promise<boolean> {
        const probeStartedAt = Date.now();
        const probedTables = knownMissing.map(
            ({ database, schema, table }) => ({ database, schema, table }),
        );
        const probedCatalog =
            await this.warehouseClient.getCatalog(probedTables);
        const changed = haveMissingCatalogEntriesChanged(
            probedCatalog,
            models,
            knownMissing,
            caseSensitiveMatching,
        );
        Logger.info('dbt.compile.warehouseCatalogFetch', {
            event: 'dbt.compile.warehouseCatalogFetch',
            projectUuid: trackingParams?.projectUuid ?? null,
            jobUuid: trackingParams?.jobUuid ?? null,
            warehouseType: this.warehouseClient.credentials.type,
            reason: 'known_missing_probe',
            requestedTables: probedTables.length,
            ...DbtBaseProjectAdapter.countMissingEntries(knownMissing),
            changed,
            durationMs: Date.now() - probeStartedAt,
        });
        return changed;
    }

    private async attachTypesAfterCatalogFetch(
        models: DbtModelNode[],
        caseSensitiveMatching: boolean,
        reason:
            | 'no_cache'
            | 'cache_predates_timestamp_domains'
            | 'cache_miss'
            | 'known_missing_changed',
        trackingParams: TrackingParams | undefined,
    ): Promise<DbtModelNode[]> {
        const requestedTables = getSchemaStructureFromDbtModels(models);
        const catalogFetchStartedAt = Date.now();
        const warehouseCatalog =
            await this.warehouseClient.getCatalog(requestedTables);
        const { unknownMissing: missingEntries } = getMissingCatalogEntries(
            warehouseCatalog,
            models,
            caseSensitiveMatching,
        );
        Logger.info('dbt.compile.warehouseCatalogFetch', {
            event: 'dbt.compile.warehouseCatalogFetch',
            projectUuid: trackingParams?.projectUuid ?? null,
            jobUuid: trackingParams?.jobUuid ?? null,
            warehouseType: this.warehouseClient.credentials.type,
            reason,
            requestedTables: requestedTables.length,
            ...DbtBaseProjectAdapter.countMissingEntries(missingEntries),
            durationMs: Date.now() - catalogFetchStartedAt,
        });
        // Clients only create the sidecar when they classify a column;
        // stamp it (possibly empty) so the staleness check above can't
        // refetch again on domain-less warehouses.
        ensureCatalogTimestampDomainsKey(warehouseCatalog);
        setCatalogMissingEntries(warehouseCatalog, missingEntries);
        await this.cachedWarehouse?.onWarehouseCatalogChange(warehouseCatalog);

        return attachTypesToModels(
            models,
            warehouseCatalog,
            false,
            caseSensitiveMatching,
            (diagnostics) =>
                DbtBaseProjectAdapter.logAttachTypesPhase(
                    'refetched_catalog',
                    missingEntries,
                    trackingParams,
                    diagnostics,
                ),
        );
    }

    private static countMissingEntries(
        entries: WarehouseCatalogMissingEntry[],
    ) {
        return {
            knownMissingTables: entries.filter(
                ({ columns }) => columns === null,
            ).length,
            knownMissingColumns: entries.reduce(
                (count, { columns }) => count + (columns?.length ?? 0),
                0,
            ),
        };
    }

    private static logAttachTypesPhase(
        catalogSource: 'cached_catalog' | 'refetched_catalog',
        knownMissing: WarehouseCatalogMissingEntry[],
        trackingParams: TrackingParams | undefined,
        diagnostics: AttachTypesDiagnostics,
    ) {
        Logger.info('dbt.compile.attachTypes', {
            event: 'dbt.compile.attachTypes',
            projectUuid: trackingParams?.projectUuid ?? null,
            jobUuid: trackingParams?.jobUuid ?? null,
            catalogSource,
            ...DbtBaseProjectAdapter.countMissingEntries(knownMissing),
            durationMs: diagnostics.durationMs,
            modelCount: diagnostics.modelCount,
            columnCount: diagnostics.columnCount,
            catalogTableCount: diagnostics.catalogTableCount,
            distinctSchemaCount: diagnostics.schemaPairs.length,
            schemaPairs: diagnostics.schemaPairs.slice(0, 20),
            exactLookups: diagnostics.exactLookups,
            caseInsensitiveLookups: diagnostics.caseInsensitiveLookups,
            missingLookups: diagnostics.missingLookups,
        });
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
