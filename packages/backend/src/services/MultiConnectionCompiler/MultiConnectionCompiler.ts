import {
    getErrorMessage,
    getModelsFromManifest,
    InlineErrorType,
    isExploreError,
    NotFoundError,
    ParameterError,
    type CompilationHistoryReport,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type Explore,
    type ExploreError,
    type SupportedDbtVersions,
    type WarehouseCatalog,
} from '@lightdash/common';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { withCrossSourceRefsHint } from '../../dbt/dbtExternalNodes';
import { type DbtProjectScan } from '../../dbt/dbtProjectScan';
import { DbtSourceError } from '../../dbt/DbtSourceError';
import Logger from '../../logging/logger';
import { type ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
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
import {
    resolveCrossSourceManifests,
    type CrossSourceFetchResult,
    type CrossSourceFetchTask,
} from '../../projectAdapters/crossSourceRefs';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import {
    type CachedWarehouse,
    type DbtManifestFetchOptions,
    type TrackingParams,
} from '../../types';
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
    options: DbtManifestFetchOptions,
) => Promise<CrossSourceFetchResult>;

export type PrepareSourceManifest = (
    source: CompilableDbtSource,
    warehouseCredentials: CreateWarehouseCredentials,
    connection: ScopedWarehouseConnection,
) => Promise<DbtProjectScan | null>;

export type LoadExtraConnectionCredentials = (
    warehouseConnectionUuid: string,
) => Promise<CreateWarehouseCredentials>;

export type PrimaryCompileInput = {
    prepare?: () => Promise<DbtProjectScan | null>;
    connection: ScopedWarehouseConnection;
    fetchManifest: (
        options: DbtManifestFetchOptions,
    ) => Promise<CrossSourceFetchResult>;
    dbtProjectDir: string | undefined;
    warehouseCredentials: CreateWarehouseCredentials;
    cachedWarehouse: CachedWarehouse;
};

export type MultiConnectionSave = {
    exploreStream: AsyncIterable<Explore | ExploreError>;
    bindingOf: (exploreName: string) => string | null;
    carry: MultiConnectionCarry;
    persistArtifacts: () => Promise<void>;
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
                ? [[model.name, model.lightdash_source_uuid] as const]
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

    async planGroups(
        projectUuid: string,
        includeUnboundSources: boolean,
    ): Promise<CompileGroupPlan[]> {
        const [connections, sources] = await Promise.all([
            this.warehouseConnectionCompileModel.getCompileConnections(
                projectUuid,
            ),
            this.projectDbtSourcesModel.getSourcesWithBindings(projectUuid),
        ]);
        return planCompileGroups({
            connections,
            sources,
            includeUnboundSources,
        });
    }

    private static async fetchSourceManifests(
        sources: CompilableDbtSource[],
        warehouseCredentials: CreateWarehouseCredentials,
        connection: ScopedWarehouseConnection,
        fetchSourceManifest: FetchSourceManifest,
        enabled: boolean,
        concurrency: number,
        projectUuid: string,
        primaryTask?: CrossSourceFetchTask<
            Omit<SourceManifest, 'manifest' | 'selectedModelIds'>
        >,
        prepareSourceManifest?: PrepareSourceManifest,
        warnings: string[] = [],
    ): Promise<SourceManifest[]> {
        const sourceTasks = sources.map((source) => ({
            prepare: prepareSourceManifest
                ? async () => {
                      try {
                          return await prepareSourceManifest(
                              source,
                              warehouseCredentials,
                              connection,
                          );
                      } catch (error) {
                          const repoSuffix =
                              'repository' in source.dbtConnection &&
                              source.dbtConnection.repository
                                  ? ` (${source.dbtConnection.repository})`
                                  : '';
                          throw new DbtSourceError(
                              `Failed to load dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(error)}`,
                              error,
                          );
                      }
                  }
                : undefined,
            key: source.name,
            context: {
                name: source.name,
                precedence: source.precedence,
                dbtSourceUuid: source.projectDbtSourceUuid,
            },
            fetch: async (options: DbtManifestFetchOptions) => {
                const repoSuffix =
                    'repository' in source.dbtConnection &&
                    source.dbtConnection.repository
                        ? ` (${source.dbtConnection.repository})`
                        : '';
                try {
                    return await fetchSourceManifest(
                        source,
                        warehouseCredentials,
                        connection,
                        options,
                    );
                } catch (error) {
                    const hinted = withCrossSourceRefsHint(error, enabled);
                    throw new DbtSourceError(
                        `Failed to load dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(hinted)}`,
                        hinted,
                    );
                }
            },
        }));
        if (!enabled) {
            const primarySources: SourceManifest[] = [];
            if (primaryTask) {
                const result = await primaryTask.fetch({ externalNodes: [] });
                primarySources.push({
                    ...primaryTask.context,
                    manifest: result.manifest,
                    selectedModelIds: result.selectedModelIds,
                });
            }
            return [
                ...primarySources,
                ...(await Promise.all(
                    sourceTasks.map(async (task) => {
                        const result = await task.fetch({ externalNodes: [] });
                        return {
                            ...task.context,
                            manifest: result.manifest,
                            selectedModelIds: result.selectedModelIds,
                        };
                    }),
                )),
            ];
        }
        const resolution = await resolveCrossSourceManifests({
            enabled,
            concurrency,
            tasks: [...(primaryTask ? [primaryTask] : []), ...sourceTasks],
        });
        warnings.push(...resolution.warnings);
        if (enabled) {
            Logger.info('dbt.compile.crossSourceRefsResolved', {
                event: 'dbt.compile.crossSourceRefsResolved',
                projectUuid,
                rounds: resolution.rounds,
                scannedEdges: resolution.scan.known,
                firstAttemptInjected: resolution.firstAttemptInjected,
                dbtLsRuns: resolution.attempts,
                sources: resolution.results.map(({ task, injectedFrom }) => ({
                    name: task.key,
                    injectedFrom,
                })),
            });
        }
        return resolution.results.map(({ task, result }) => ({
            ...task.context,
            manifest: result.manifest,
            selectedModelIds: result.selectedModelIds,
        }));
    }

    private async compileExtraGroup({
        projectUuid,
        context,
        plan,
        dbtVersion,
        fetchSourceManifest,
        prepareSourceManifest,
        crossSourceRefsEnabled,
        concurrency,
        loadExtraCredentials,
        beforeAcquireClient,
        trackingParams,
        warnings,
    }: {
        projectUuid: string;
        context: ConnectionContext;
        plan: CompileGroupPlan & { warehouseConnectionUuid: string };
        dbtVersion: SupportedDbtVersions;
        fetchSourceManifest: FetchSourceManifest;
        prepareSourceManifest?: PrepareSourceManifest;
        crossSourceRefsEnabled: boolean;
        concurrency: number;
        loadExtraCredentials: LoadExtraConnectionCredentials;
        beforeAcquireClient?: () => Promise<void>;
        trackingParams: TrackingParams | undefined;
        warnings: string[];
    }): Promise<CompiledExtraGroup> {
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
                        crossSourceRefsEnabled,
                        concurrency,
                        projectUuid,
                        undefined,
                        prepareSourceManifest,
                        warnings,
                    );
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
                    )
                ).map((explore) => withErrorSource(explore, sources));
                return {
                    plan,
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
            if (isExploreError(explore) || !explore.warnings) return explore;
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

    async compile({
        projectUuid,
        context,
        primary,
        dbtVersion,
        includeUnboundSources,
        fetchSourceManifest,
        prepareSourceManifest,
        crossSourceRefsEnabled,
        concurrency,
        loadExtraCredentials,
        beforeLoadExtraCredentials,
        trackingParams,
        analytics,
    }: {
        projectUuid: string;
        context: ConnectionContext;
        primary: PrimaryCompileInput;
        dbtVersion: SupportedDbtVersions;
        includeUnboundSources: boolean;
        fetchSourceManifest: FetchSourceManifest;
        prepareSourceManifest?: PrepareSourceManifest;
        crossSourceRefsEnabled: boolean;
        concurrency: number;
        loadExtraCredentials: LoadExtraConnectionCredentials;
        beforeLoadExtraCredentials?: () => Promise<void>;
        trackingParams?: TrackingParams;
        analytics?: LightdashAnalytics;
    }): Promise<MultiConnectionCompilation> {
        const [originalPlan, ...extraPlans] = await this.planGroups(
            projectUuid,
            includeUnboundSources,
        );
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        const warnings: string[] = [];

        const originalSources =
            await MultiConnectionCompiler.fetchSourceManifests(
                originalPlan.sources,
                primary.warehouseCredentials,
                primary.connection,
                fetchSourceManifest,
                crossSourceRefsEnabled,
                concurrency,
                projectUuid,
                {
                    prepare: primary.prepare,
                    key: identity.dbtSourceName,
                    context: {
                        name: identity.dbtSourceName,
                        precedence: 0,
                        dbtSourceUuid: identity.dbtSourceUuid,
                    },
                    fetch: async (options) => {
                        try {
                            return await primary.fetchManifest(options);
                        } catch (error) {
                            throw withCrossSourceRefsHint(
                                error,
                                crossSourceRefsEnabled,
                            );
                        }
                    },
                },
                prepareSourceManifest,
                warnings,
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
                compiledExtraGroups.push(
                    await this.compileExtraGroup({
                        projectUuid,
                        context,
                        plan: extraPlan,
                        dbtVersion,
                        fetchSourceManifest,
                        prepareSourceManifest,
                        crossSourceRefsEnabled,
                        concurrency,
                        loadExtraCredentials: async (uuid) => {
                            const credentials =
                                await loadExtraCredentials(uuid);
                            extraWarehouseType = credentials.type;
                            return credentials;
                        },
                        beforeAcquireClient: beforeLoadExtraCredentials,
                        trackingParams,
                        warnings,
                    }),
                );
            } catch (error) {
                if (error instanceof ExtraConnectionCheckError)
                    throw error.refusal;
                if (error instanceof ManifestCollisionError) throw error;
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
            ),
            bindingOf: (exploreName) => extraBindings.get(exploreName) ?? null,
            carry: {
                kind: 'connections',
                warehouseConnectionUuids: failedConnectionUuids,
            },
            warnings,
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
                    compiledExtraGroups.map((group) =>
                        this.warehouseConnectionCompileModel.saveCompileArtifacts(
                            projectUuid,
                            group.plan.warehouseConnectionUuid,
                            {
                                manifest: group.manifest,
                                catalog: group.catalog,
                            },
                        ),
                    ),
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
            ...(beforeWrite ? [beforeWrite] : []),
        );
        await compilation.persistArtifacts();
        return saved;
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
                                  { ...table, dbtSourceUuid },
                              ],
                          ),
                      ),
                  }
                : stampedError(explore, dbtSourceUuid);
        return {
            exploreStream: (async function* deployedExplores() {
                for (const explore of explores) {
                    yield withSourceIdentity(explore);
                }
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
