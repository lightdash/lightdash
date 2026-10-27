import {
    getDeferredExploreName,
    getErrorMessage,
    getModelsFromManifest,
    InlineErrorType,
    isExploreError,
    NotFoundError,
    ParameterError,
    type CompilationHistoryReport,
    type CreateWarehouseCredentials,
    type DbtExploreIdentity,
    type DbtManifest,
    type Explore,
    type ExploreError,
    type SupportedDbtVersions,
    type WarehouseCatalog,
} from '@lightdash/common';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { DbtSourceError } from '../../dbt/DbtSourceError';
import Logger from '../../logging/logger';
import { type ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { type ExploreNaming } from '../../models/ProjectModel/exploreNameAllocation';
import {
    type BoundExplore,
    type MultiConnectionCarry,
    type ProjectModel,
    type StagedExploreWriteCheck,
} from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import {
    ManifestCollisionError,
    mergeCompileGroupManifests,
    planCompileGroups,
    type CompilableDbtSource,
    type CompileGroupPlan,
    type SourceManifest,
} from '../../projectAdapters/CompileGroup';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import {
    isFatalSourceFailure,
    SourceFailureIsolation,
    validateDbtSourceManifest,
} from '../../projectAdapters/sourceFailureIsolation';
import { markCompilePublished } from '../../scheduler/compileShutdown';
import {
    type CachedWarehouse,
    type DbtManifestFetchResult,
    type TrackingParams,
} from '../../types';
import { runWithConcurrency } from '../../utils/runWithConcurrency';
import { projectMergedManifest } from '../ProjectService/projectMergedManifest';
import { type ConnectionContext } from '../WarehouseClientFactory/ConnectionContext';
import {
    type ScopedWarehouseConnection,
    type WarehouseClientFactory,
} from '../WarehouseClientFactory/WarehouseClientFactory';

const gzipAsync = promisify(gzip);

export const withConnectionWarnings = (
    report: CompilationHistoryReport,
    warnings: string[],
): CompilationHistoryReport =>
    warnings.length === 0
        ? report
        : { ...report, connectionWarnings: warnings };

export type FetchSourceManifest = (
    source: CompilableDbtSource,
    warehouseCredentials: CreateWarehouseCredentials,
    connection: ScopedWarehouseConnection,
) => Promise<DbtManifestFetchResult>;

export type LoadExtraConnectionCredentials = (
    warehouseConnectionUuid: string,
) => Promise<CreateWarehouseCredentials>;

type SourceDiskLifecycle = {
    releaseSourceDisk?: (source: CompilableDbtSource) => Promise<void>;
    releaseAllSourceDisk?: () => Promise<void>;
};

export type PrimaryCompileInput = {
    releaseDisk?: () => Promise<void>;
    connection: ScopedWarehouseConnection;
    fetchManifest: () => Promise<DbtManifestFetchResult>;
    dbtProjectDir: string | undefined;
    warehouseCredentials: CreateWarehouseCredentials;
    cachedWarehouse: CachedWarehouse;
};

export type MultiConnectionSave = {
    exploreStream: AsyncIterable<Explore | ExploreError>;
    bindingOf: (exploreName: string) => string | null;
    carry: MultiConnectionCarry;
    persistArtifacts: (options?: { exploresCommitted: true }) => Promise<void>;
    naming?: ExploreNaming;
};

export type MultiConnectionCompilation = MultiConnectionSave & {
    originalAdapter: DbtManifestProjectAdapter;
    warnings: string[];
};

type CompiledExtraGroup = {
    plan: CompileGroupPlan & { warehouseConnectionUuid: string };
    explores: (Explore | ExploreError)[];
    manifest: Buffer;
    catalog: WarehouseCatalog | null;
    modelNames: string[];
    sourceManifests: SourceManifest[];
};

type MultiConnectionCompilerArguments = {
    warehouseClientFactory: WarehouseClientFactory;
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
    warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
};

const stampedError = (
    explore: Explore | ExploreError,
    dbtSourceUuid: string,
): Explore | ExploreError => {
    const stamped: (Explore | ExploreError) & { dbtSourceUuid: string } = {
        ...explore,
        dbtSourceUuid,
    };
    return stamped;
};

const modelSources = (manifest: DbtManifest): ReadonlyMap<string, string> =>
    new Map(
        getModelsFromManifest(manifest).flatMap((model) =>
            model.lightdash_source_uuid
                ? [
                      [
                          getDeferredExploreName(model),
                          model.lightdash_source_uuid,
                      ] as const,
                  ]
                : [],
        ),
    );

const withErrorSource = (
    explore: Explore | ExploreError,
    sources: ReadonlyMap<string, string>,
): Explore | ExploreError => {
    const dbtSourceUuid = sources.get(explore.name);
    return isExploreError(explore) && dbtSourceUuid !== undefined
        ? stampedError(explore, dbtSourceUuid)
        : explore;
};

class ExtraConnectionCheckError extends Error {
    constructor(readonly refusal: unknown) {
        super('Extra connection check failed');
    }
}

type MultiConnectionCompileInput = SourceDiskLifecycle & {
    onSourceWarning?: (warning: string) => Promise<void>;
    projectUuid: string;
    context: ConnectionContext;
    primary: PrimaryCompileInput;
    dbtVersion: SupportedDbtVersions;
    fetchSourceManifest: FetchSourceManifest;
    mixedWarehouseConnectionsEnabled: boolean;
    concurrency: number;
    loadExtraCredentials: LoadExtraConnectionCredentials;
    beforeLoadExtraCredentials?: () => Promise<void>;
    trackingParams?: TrackingParams;
    analytics?: LightdashAnalytics;
};

export class MultiConnectionCompiler {
    private readonly projectModel: ProjectModel;

    private readonly projectDbtSourcesModel: ProjectDbtSourcesModel;

    private readonly warehouseConnectionCompileModel: WarehouseConnectionCompileModel;

    private readonly warehouseClientFactory: WarehouseClientFactory;

    constructor(args: MultiConnectionCompilerArguments) {
        this.projectModel = args.projectModel;
        this.warehouseClientFactory = args.warehouseClientFactory;
        this.projectDbtSourcesModel = args.projectDbtSourcesModel;
        this.warehouseConnectionCompileModel =
            args.warehouseConnectionCompileModel;
    }

    async planGroups(projectUuid: string): Promise<CompileGroupPlan[]> {
        const [connections, sources] = await Promise.all([
            this.warehouseConnectionCompileModel.getCompileConnections(
                projectUuid,
            ),
            this.projectDbtSourcesModel.getSourcesWithBindings(projectUuid),
        ]);
        return planCompileGroups({
            connections,
            sources,
        });
    }

    private static async fetchSourceManifests(
        sources: CompilableDbtSource[],
        warehouseCredentials: CreateWarehouseCredentials,
        connection: ScopedWarehouseConnection,
        fetchSourceManifest: FetchSourceManifest,
        concurrency: number,
        primaryTask?: {
            context: Omit<SourceManifest, 'manifest' | 'selectedModelIds'>;
            fetch: () => Promise<DbtManifestFetchResult>;
            releaseDisk?: () => Promise<void>;
        },
        lifecycle: SourceDiskLifecycle & {
            isolation?: SourceFailureIsolation;
        } = {},
    ): Promise<SourceManifest[]> {
        const activeFetches = new Set<Promise<DbtManifestFetchResult>>();
        const releaseFailed = async (error: unknown): Promise<never> => {
            await Promise.allSettled([...activeFetches]);
            await Promise.allSettled(
                sources.map(async (source) =>
                    lifecycle.releaseSourceDisk?.(source),
                ),
            );
            await primaryTask?.releaseDisk?.();
            throw error;
        };
        const sourceTasks = sources.map((source) => ({
            key: source.name,
            context: {
                name: source.name,
                precedence: source.precedence,
                dbtSourceUuid: source.projectDbtSourceUuid,
            },
            fetch: async () => {
                const repoSuffix =
                    'repository' in source.dbtConnection &&
                    source.dbtConnection.repository
                        ? ` (${source.dbtConnection.repository})`
                        : '';
                try {
                    const result = await fetchSourceManifest(
                        source,
                        warehouseCredentials,
                        connection,
                    );
                    validateDbtSourceManifest(result.manifest);
                    await lifecycle.releaseSourceDisk?.(source);
                    return result;
                } catch (error) {
                    throw new DbtSourceError(
                        `Failed to load dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(error)}`,
                        error,
                    );
                }
            },
        }));
        const primarySources: SourceManifest[] = [];
        if (primaryTask) {
            const result = await primaryTask.fetch();
            await primaryTask.releaseDisk?.();
            primarySources.push({
                ...primaryTask.context,
                manifest: result.manifest,
                selectedModelIds: result.selectedModelIds,
            });
        }
        return [
            ...primarySources,
            ...(
                await runWithConcurrency(
                    sourceTasks,
                    concurrency,
                    async (task) => {
                        const fetch = task.fetch();
                        activeFetches.add(fetch);
                        let result: DbtManifestFetchResult;
                        try {
                            result = await fetch;
                        } catch (error) {
                            if (
                                await lifecycle.isolation?.skip(
                                    task.context.dbtSourceUuid,
                                    task.key,
                                    error,
                                    'manifest',
                                )
                            )
                                return null;
                            throw error;
                        } finally {
                            activeFetches.delete(fetch);
                        }
                        return {
                            ...task.context,
                            manifest: result.manifest,
                            selectedModelIds: result.selectedModelIds,
                        };
                    },
                ).catch(releaseFailed)
            ).filter((entry) => entry !== null),
        ];
    }

    private async compileExtraGroup({
        projectUuid,
        context,
        plan,
        dbtVersion,
        fetchSourceManifest,
        concurrency,
        loadExtraCredentials,
        beforeAcquireClient,
        trackingParams,
        warnings,
        lifecycle,
    }: {
        projectUuid: string;
        context: ConnectionContext;
        plan: CompileGroupPlan & { warehouseConnectionUuid: string };
        dbtVersion: SupportedDbtVersions;
        fetchSourceManifest: FetchSourceManifest;
        concurrency: number;
        loadExtraCredentials: LoadExtraConnectionCredentials;
        beforeAcquireClient?: () => Promise<void>;
        trackingParams: TrackingParams | undefined;
        warnings: string[];
        lifecycle?: Parameters<
            typeof MultiConnectionCompiler.fetchSourceManifests
        >[6];
    }): Promise<CompiledExtraGroup | null> {
        const credentials = await loadExtraCredentials(
            plan.warehouseConnectionUuid,
        );
        if (beforeAcquireClient) {
            try {
                await beforeAcquireClient();
            } catch (error) {
                throw new ExtraConnectionCheckError(error);
            }
        }
        return this.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid,
                credentials,
                compileGroup: {
                    listedDatabases: plan.listedDatabases,
                    onSkippedDatabase: (database) => {
                        const warning = `Connection "${plan.connectionName}" skipped listed database "${database}": it does not exist.`;
                        if (!warnings.includes(warning)) warnings.push(warning);
                    },
                },
            },
            context,
            async (connection) => {
                const { warehouseClient } = connection;
                const warehouseCredentials = connection.connectionCredentials;
                await warehouseClient.test();
                const sourceManifests =
                    await MultiConnectionCompiler.fetchSourceManifests(
                        plan.sources,
                        warehouseCredentials,
                        connection,
                        fetchSourceManifest,
                        concurrency,
                        undefined,
                        lifecycle,
                    );
                if (sourceManifests.length === 0) return null;
                const { manifest, selectedModelIds } =
                    mergeCompileGroupManifests(sourceManifests);
                let catalog: WarehouseCatalog | null = null;
                const adapter = new DbtManifestProjectAdapter({
                    parsedManifest: manifest,
                    warehouseClient,
                    cachedWarehouse: {
                        warehouseCatalog:
                            await this.warehouseConnectionCompileModel.getCatalogCache(
                                projectUuid,
                                plan.warehouseConnectionUuid,
                            ),
                        onWarehouseCatalogChange: async (changed) => {
                            catalog = changed;
                        },
                    },
                    dbtVersion,
                    selectedModelIds,
                });
                const sources = modelSources(manifest);
                const explores = (
                    await adapter.compileAllExplores(
                        trackingParams,
                        false,
                        true,
                        true,
                    )
                ).map((explore) => withErrorSource(explore, sources));
                return {
                    plan,
                    sourceManifests,
                    explores,
                    modelNames: getModelsFromManifest(manifest).map(
                        (model) => model.name,
                    ),
                    manifest: await gzipAsync(
                        JSON.stringify(projectMergedManifest(manifest)),
                    ),
                    catalog,
                };
            },
        );
    }

    private static async *groupExplores(
        original: AsyncIterable<Explore | ExploreError>,
        originalSources: ReadonlyMap<string, string>,
        originalConnectionName: string,
        extraGroups: CompiledExtraGroup[],
        originalModelNames: string[],
        mixedWarehouseConnectionsEnabled: boolean,
    ): AsyncIterable<Explore | ExploreError> {
        const groups = [
            {
                connectionName: originalConnectionName,
                modelNames: originalModelNames,
            },
            ...extraGroups.map((group) => ({
                connectionName: group.plan.connectionName,
                modelNames: group.modelNames,
            })),
        ];
        const withJoinWarnings = (
            explore: Explore | ExploreError,
            connectionName: string,
        ): Explore | ExploreError => {
            if (
                !mixedWarehouseConnectionsEnabled ||
                isExploreError(explore) ||
                !explore.warnings
            )
                return explore;
            return {
                ...explore,
                warnings: explore.warnings.map((warning) => {
                    if (warning.type !== InlineErrorType.MISSING_TABLE)
                        return warning;
                    const match =
                        /^Join "(.*)" to table "(.*)" was skipped because the model is not available in this project\./.exec(
                            warning.message,
                        );
                    if (!match) return warning;
                    const [, joinName, table] = match;
                    const otherGroup = groups.find(
                        (group) =>
                            group.connectionName !== connectionName &&
                            group.modelNames.includes(table),
                    );
                    return otherGroup
                        ? {
                              ...warning,
                              message: `Join "${joinName}" was skipped: model "${table}" is on connection "${otherGroup.connectionName}", and this explore runs on connection "${connectionName}". Joins across connections are not supported.`,
                          }
                        : warning;
                }),
            };
        };
        const producers = new Map<string, string>();
        const claim = (name: string, connectionName: string) => {
            const producer = producers.get(name);
            if (producer !== undefined && producer !== connectionName) {
                throw new ParameterError(
                    `Explore "${name}" is produced by both connection "${producer}" and connection "${connectionName}". Explore names must be unique across connections.`,
                );
            }
            producers.set(name, connectionName);
        };
        extraGroups.forEach((group) =>
            group.explores.forEach((explore) =>
                claim(explore.name, group.plan.connectionName),
            ),
        );
        for await (const explore of original) {
            claim(explore.name, originalConnectionName);
            yield withJoinWarnings(
                withErrorSource(explore, originalSources),
                originalConnectionName,
            );
        }
        for (const group of extraGroups) {
            yield* group.explores.map((explore) =>
                withJoinWarnings(explore, group.plan.connectionName),
            );
        }
    }

    async compile(
        input: MultiConnectionCompileInput,
    ): Promise<MultiConnectionCompilation> {
        try {
            return await this.compileGroups(input);
        } catch (error) {
            await input.releaseAllSourceDisk?.();
            throw error;
        }
    }

    private async compileGroups({
        projectUuid,
        context,
        primary,
        dbtVersion,
        fetchSourceManifest,
        mixedWarehouseConnectionsEnabled,
        concurrency,
        loadExtraCredentials,
        beforeLoadExtraCredentials,
        trackingParams,
        analytics,
        releaseSourceDisk,
        onSourceWarning = async () => {},
    }: MultiConnectionCompileInput): Promise<MultiConnectionCompilation> {
        const [originalPlan, ...extraPlans] =
            await this.planGroups(projectUuid);
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        const warnings: string[] = [];
        const isolation = new SourceFailureIsolation(
            this.projectModel,
            projectUuid,
            identity.dbtSourceUuid,
            onSourceWarning,
        );
        const lifecycle = { isolation, releaseSourceDisk };
        const originalSources =
            await MultiConnectionCompiler.fetchSourceManifests(
                originalPlan.sources,
                primary.warehouseCredentials,
                primary.connection,
                fetchSourceManifest,
                concurrency,
                {
                    releaseDisk: primary.releaseDisk,
                    context: {
                        name: identity.dbtSourceName,
                        precedence: 0,
                        dbtSourceUuid: identity.dbtSourceUuid,
                    },
                    fetch: () => primary.fetchManifest(),
                },
                lifecycle,
            );
        const originalMerged = mergeCompileGroupManifests(originalSources);
        const originalAdapter = new DbtManifestProjectAdapter({
            parsedManifest: originalMerged.manifest,
            warehouseClient: primary.connection.deriveClient(
                primary.warehouseCredentials,
                {
                    compileGroup: {
                        listedDatabases: originalPlan.listedDatabases,
                        onSkippedDatabase: (database) => {
                            warnings.push(
                                `Connection "${originalPlan.connectionName}" skipped listed database "${database}": it does not exist.`,
                            );
                        },
                    },
                },
            ),
            cachedWarehouse: primary.cachedWarehouse,
            dbtVersion,
            analytics,
            dbtProjectDir: primary.dbtProjectDir,
            selectedModelIds: originalMerged.selectedModelIds,
        });
        const originalStream = await originalAdapter.prepareExploreStream(
            trackingParams,
            false,
            true,
            true,
        );

        const compiledExtraGroups: CompiledExtraGroup[] = [];
        const failedConnectionUuids: string[] = [];
        await extraPlans.reduce(async (previous, plan) => {
            await previous;
            const extraPlan = plan as CompileGroupPlan & {
                warehouseConnectionUuid: string;
            };
            if (beforeLoadExtraCredentials) await beforeLoadExtraCredentials();
            let extraWarehouseType: CreateWarehouseCredentials['type'] | null =
                null;
            try {
                const compiledGroup = await this.compileExtraGroup({
                    projectUuid,
                    context,
                    plan: extraPlan,
                    dbtVersion,
                    fetchSourceManifest,
                    concurrency,
                    loadExtraCredentials: async (uuid) => {
                        const credentials = await loadExtraCredentials(uuid);
                        extraWarehouseType = credentials.type;
                        return credentials;
                    },
                    beforeAcquireClient: beforeLoadExtraCredentials,
                    trackingParams,
                    warnings,
                    lifecycle,
                });
                if (compiledGroup) compiledExtraGroups.push(compiledGroup);
            } catch (error) {
                if (error instanceof ExtraConnectionCheckError)
                    throw error.refusal;
                if (
                    error instanceof ManifestCollisionError ||
                    isFatalSourceFailure(error)
                )
                    throw error;
                failedConnectionUuids.push(extraPlan.warehouseConnectionUuid);
                if (analytics) {
                    if (extraWarehouseType === null) {
                        try {
                            extraWarehouseType =
                                (
                                    await this.projectModel.getWarehouseConnectionsMetadata(
                                        projectUuid,
                                    )
                                ).find(
                                    (connection) =>
                                        connection.warehouseConnectionUuid ===
                                        extraPlan.warehouseConnectionUuid,
                                )?.warehouseType ?? null;
                        } catch (metadataError) {
                            Logger.warn(
                                'Failed to resolve the extra connection warehouse type',
                                metadataError,
                            );
                        }
                    }
                    try {
                        const organizationId =
                            trackingParams?.organizationUuid ??
                            (await this.projectModel.getSummary(projectUuid))
                                .organizationUuid;
                        analytics.track({
                            event: 'warehouse_connection.compile_warning',
                            ...(trackingParams?.userUuid
                                ? { userId: trackingParams.userUuid }
                                : {
                                      anonymousId:
                                          LightdashAnalytics.anonymousId,
                                  }),
                            properties: {
                                organizationId,
                                projectId: projectUuid,
                                warehouseConnectionId:
                                    extraPlan.warehouseConnectionUuid,
                                connectionKind: 'extra',
                                warehouseType: extraWarehouseType,
                                connectionCount: 1 + extraPlans.length,
                                credentialSource: null,
                                reason: 'extra_connection_failed',
                                outcome: 'previous_explores_kept',
                            },
                        });
                    } catch {
                        Logger.warn(
                            'Failed to track extra connection compile warning',
                        );
                    }
                }
                const warning = `Connection "${
                    extraPlan.connectionName
                }" failed to compile, so its previous explores are kept: ${getErrorMessage(
                    error,
                )}`;
                warnings.push(warning);
                Logger.warn(
                    `dbt.compile.connectionCarriedForward projectUuid=${projectUuid} warehouseConnectionUuid=${extraPlan.warehouseConnectionUuid}: ${warning}`,
                );
            }
        }, Promise.resolve());

        const extraBindings = new Map(
            compiledExtraGroups.flatMap((group) =>
                group.explores.map(
                    (explore) =>
                        [
                            explore.name,
                            group.plan.warehouseConnectionUuid,
                        ] as const,
                ),
            ),
        );
        const originalManifest =
            originalPlan.sources.length > 0
                ? await gzipAsync(
                      JSON.stringify(
                          projectMergedManifest(originalMerged.manifest),
                      ),
                  )
                : null;

        warnings.push(...isolation.warnings);
        return {
            originalAdapter,
            exploreStream: MultiConnectionCompiler.groupExplores(
                originalStream,
                modelSources(originalMerged.manifest),
                originalPlan.connectionName,
                compiledExtraGroups,
                getModelsFromManifest(originalMerged.manifest).map(
                    (model) => model.name,
                ),
                mixedWarehouseConnectionsEnabled,
            ),
            bindingOf: (exploreName) => extraBindings.get(exploreName) ?? null,
            carry: {
                kind: 'connections',
                warehouseConnectionUuids: failedConnectionUuids,
                ...(isolation.failedSourceUuids.length > 0
                    ? { dbtSourceUuids: isolation.failedSourceUuids }
                    : {}),
            },
            warnings,
            naming: {
                mode: 'refresh',
                warnings,
                refreshedSourceUuids: [
                    identity.dbtSourceUuid,
                    ...originalSources.map((source) => source.dbtSourceUuid),
                    ...compiledExtraGroups.flatMap((group) =>
                        group.sourceManifests.map(
                            (source) => source.dbtSourceUuid,
                        ),
                    ),
                ],
                models: [
                    originalMerged.manifest,
                    ...compiledExtraGroups.map(
                        (group) =>
                            mergeCompileGroupManifests(group.sourceManifests)
                                .manifest,
                    ),
                ].flatMap((manifest) =>
                    getModelsFromManifest(manifest).map(
                        (model): DbtExploreIdentity => ({
                            sourceUuid: model.lightdash_source_uuid ?? null,
                            sourceName: model.lightdash_source_name ?? null,
                            packageName: model.package_name,
                            uniqueId: model.unique_id,
                            version: model.version,
                            latestVersion: model.latest_version,
                            modelName: model.name,
                        }),
                    ),
                ),
            },
            persistArtifacts: async () => {
                if (originalManifest === null) {
                    await this.projectModel.deleteMergedManifest(projectUuid);
                } else {
                    await this.projectModel.upsertMergedManifest(
                        projectUuid,
                        originalManifest,
                    );
                }
                await Promise.all(
                    compiledExtraGroups.map(async (group) => {
                        await this.warehouseConnectionCompileModel.saveCompileArtifacts(
                            projectUuid,
                            group.plan.warehouseConnectionUuid,
                            {
                                manifest: group.manifest,
                                catalog: group.catalog,
                            },
                        );
                    }),
                );
            },
        };
    }

    async save(
        projectUuid: string,
        compilation: MultiConnectionSave,
        beforeWrite?: StagedExploreWriteCheck,
    ): Promise<{ cachedExploreUuids: string[] }> {
        const saved = await this.projectModel.saveMultiConnectionExplores(
            projectUuid,
            (async function* boundExplores(): AsyncIterable<BoundExplore> {
                for await (const explore of compilation.exploreStream) {
                    yield {
                        explore,
                        warehouseConnectionUuid: compilation.bindingOf(
                            explore.name,
                        ),
                    };
                }
            })(),
            compilation.carry,
            beforeWrite,
            compilation.naming,
        );
        markCompilePublished();
        await compilation.persistArtifacts({ exploresCommitted: true });
        return saved;
    }

    async preparePreviewDeploy({
        projectUuid,
        explores,
        sourcesByPackage,
        sourceAliases,
    }: {
        projectUuid: string;
        explores: (Explore | ExploreError)[];
        sourcesByPackage: ReadonlyMap<string, string>;
        sourceAliases: ReadonlyMap<string, string>;
    }): Promise<MultiConnectionSave> {
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        const sources =
            await this.projectDbtSourcesModel.getSourcesWithBindings(
                projectUuid,
            );
        const bindings = new Map<string, string | null>([
            [identity.dbtSourceUuid, null],
            ...sources.map(
                (source) =>
                    [
                        source.projectDbtSourceUuid,
                        source.warehouseConnectionUuid,
                    ] as const,
            ),
        ]);
        const sourceOf = (explore: Explore | ExploreError): string => {
            const packageName =
                explore.tables?.[explore.baseTable ?? explore.name]
                    ?.dbtPackageName;
            const sourceUuid = packageName
                ? sourcesByPackage.get(packageName)
                : undefined;
            if (!sourceUuid || !bindings.has(sourceUuid)) {
                throw new ParameterError(
                    'The preview deploy has no source for an uploaded explore.',
                );
            }
            return sourceUuid;
        };
        const sourceByName = new Map(
            explores.map((explore) => [explore.name, sourceOf(explore)]),
        );
        const sourceNames = new Map([
            [identity.dbtSourceUuid, identity.dbtSourceName],
            ...sources.map(
                (source) => [source.projectDbtSourceUuid, source.name] as const,
            ),
        ]);
        const warnings: string[] = [];
        return {
            naming: {
                mode: 'deploy',
                sourceMapping: { sourcesByPackage, sourceAliases },
                models: [],
                refreshedSourceUuids: [...new Set(sourceByName.values())],
                warnings,
                onPublished: (published) =>
                    explores.splice(0, explores.length, ...published),
            },
            exploreStream: (async function* deployedExplores() {
                for (const explore of explores) {
                    const dbtSourceUuid = sourceOf(explore);
                    const stamped = explore.dbtModelIdentity
                        ? {
                              ...explore,
                              dbtModelIdentity: {
                                  ...explore.dbtModelIdentity,
                                  sourceUuid: dbtSourceUuid,
                                  sourceName:
                                      sourceNames.get(dbtSourceUuid) ?? null,
                              },
                          }
                        : explore;
                    yield stamped.tables
                        ? {
                              ...stamped,
                              tables: Object.fromEntries(
                                  Object.entries(stamped.tables).map(
                                      ([name, table]) => [
                                          name,
                                          {
                                              ...table,
                                              dbtSourceName: sourceNames.get(
                                                  (table.dbtPackageName
                                                      ? sourcesByPackage.get(
                                                            table.dbtPackageName,
                                                        )
                                                      : undefined) ??
                                                      dbtSourceUuid,
                                              ),
                                              dbtSourceUuid:
                                                  (table.dbtPackageName
                                                      ? sourcesByPackage.get(
                                                            table.dbtPackageName,
                                                        )
                                                      : undefined) ??
                                                  dbtSourceUuid,
                                          },
                                      ],
                                  ),
                              ),
                          }
                        : stampedError(explore, dbtSourceUuid);
                }
            })(),
            bindingOf: (name) => bindings.get(sourceByName.get(name)!) ?? null,
            carry: {
                kind: 'otherDbtSourceSet',
                dbtSourceUuids: [...new Set(sourceByName.values())],
                packageSources: Object.fromEntries(sourcesByPackage),
                sourceAliases: Object.fromEntries(sourceAliases),
            },
            persistArtifacts: async () => {},
        };
    }

    async prepareSourceDeploy({
        projectUuid,
        projectDbtSourceUuid,
        explores,
    }: {
        projectUuid: string;
        projectDbtSourceUuid: string | null;
        explores: (Explore | ExploreError)[];
    }): Promise<MultiConnectionSave> {
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        const dbtSourceUuid = projectDbtSourceUuid ?? identity.dbtSourceUuid;
        let warehouseConnectionUuid: string | null = null;
        let { dbtSourceName } = identity;
        if (dbtSourceUuid !== identity.dbtSourceUuid) {
            const source = (
                await this.projectDbtSourcesModel.getSourcesWithBindings(
                    projectUuid,
                )
            ).find(
                (candidate) => candidate.projectDbtSourceUuid === dbtSourceUuid,
            );
            if (!source) {
                throw new NotFoundError(
                    `Cannot find dbt source with id: ${dbtSourceUuid}`,
                );
            }
            warehouseConnectionUuid = source.warehouseConnectionUuid;
            dbtSourceName = source.name;
        }
        const withSourceIdentity = (
            explore: Explore | ExploreError,
        ): Explore | ExploreError =>
            explore.tables
                ? {
                      ...explore,
                      tables: Object.fromEntries(
                          Object.entries(explore.tables).map(
                              ([name, table]) => [
                                  name,
                                  name === explore.baseTable
                                      ? {
                                            ...table,
                                            dbtSourceUuid,
                                            dbtSourceName,
                                        }
                                      : { ...table },
                              ],
                          ),
                      ),
                  }
                : stampedError(explore, dbtSourceUuid);
        const warnings: string[] = [];
        const deployed = explores.map((explore) => {
            const stamped = withSourceIdentity(explore);
            return stamped.dbtModelIdentity
                ? {
                      ...stamped,
                      dbtModelIdentity: {
                          ...stamped.dbtModelIdentity,
                          sourceUuid: dbtSourceUuid,
                          sourceName: dbtSourceName,
                      },
                  }
                : stamped;
        });
        return {
            naming: {
                mode: 'deploy',
                models: [],
                refreshedSourceUuids: [dbtSourceUuid],
                warnings,
                onPublished: (published) =>
                    explores.splice(0, explores.length, ...published),
            },
            exploreStream: (async function* deployedExplores() {
                yield* deployed;
            })(),
            bindingOf: () => warehouseConnectionUuid,
            carry: {
                kind: 'otherDbtSources',
                dbtSourceUuid,
                warehouseConnectionUuid,
            },
            persistArtifacts: async () => {},
        };
    }
}
