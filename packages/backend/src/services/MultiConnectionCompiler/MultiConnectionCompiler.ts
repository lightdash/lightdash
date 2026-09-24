import {
    getErrorMessage,
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
import { SshTunnel } from '@lightdash/warehouses';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import Logger from '../../logging/logger';
import { type ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import {
    type BoundExplore,
    type MultiConnectionCarry,
    type ProjectModel,
} from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import {
    ManifestCollisionError,
    mergeCompileGroupManifests,
    planCompileGroups,
    warehouseClientForCompileGroup,
    type CompilableDbtSource,
    type CompileGroupPlan,
    type SourceManifest,
} from '../../projectAdapters/CompileGroup';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import { type CachedWarehouse, type TrackingParams } from '../../types';
import { projectMergedManifest } from '../ProjectService/projectMergedManifest';

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
) => Promise<{ manifest: DbtManifest; selectedModelIds?: string[] }>;

export type LoadExtraConnectionCredentials = (
    warehouseConnectionUuid: string,
) => Promise<CreateWarehouseCredentials>;

export type PrimaryCompileInput = {
    manifest: DbtManifest;
    selectedModelIds?: string[];
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
};

type MultiConnectionCompilerArguments = {
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
    warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
};

export class MultiConnectionCompiler {
    private readonly projectModel: ProjectModel;

    private readonly projectDbtSourcesModel: ProjectDbtSourcesModel;

    private readonly warehouseConnectionCompileModel: WarehouseConnectionCompileModel;

    constructor(args: MultiConnectionCompilerArguments) {
        this.projectModel = args.projectModel;
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
        fetchSourceManifest: FetchSourceManifest,
    ): Promise<SourceManifest[]> {
        return Promise.all(
            sources.map(async (source) => {
                const repoSuffix =
                    'repository' in source.dbtConnection &&
                    source.dbtConnection.repository
                        ? ` (${source.dbtConnection.repository})`
                        : '';
                try {
                    const { manifest, selectedModelIds } =
                        await fetchSourceManifest(source, warehouseCredentials);
                    return {
                        name: source.name,
                        precedence: source.precedence,
                        dbtSourceUuid: source.projectDbtSourceUuid,
                        manifest,
                        selectedModelIds,
                    };
                } catch (error) {
                    throw new ParameterError(
                        `Failed to load dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            }),
        );
    }

    private async compileExtraGroup({
        projectUuid,
        plan,
        dbtVersion,
        fetchSourceManifest,
        loadExtraCredentials,
        trackingParams,
        warnings,
    }: {
        projectUuid: string;
        plan: CompileGroupPlan & { warehouseConnectionUuid: string };
        dbtVersion: SupportedDbtVersions;
        fetchSourceManifest: FetchSourceManifest;
        loadExtraCredentials: LoadExtraConnectionCredentials;
        trackingParams: TrackingParams | undefined;
        warnings: string[];
    }): Promise<CompiledExtraGroup> {
        const credentials = await loadExtraCredentials(
            plan.warehouseConnectionUuid,
        );
        const sshTunnel = new SshTunnel(credentials);
        try {
            const warehouseCredentials = await sshTunnel.connect();
            const warehouseClient = warehouseClientForCompileGroup(
                warehouseCredentials,
                plan.listedDatabases,
                (database) => {
                    warnings.push(
                        `Connection "${plan.connectionName}" skipped listed database "${database}": it does not exist.`,
                    );
                },
            );
            await warehouseClient.test();
            const sourceManifests =
                await MultiConnectionCompiler.fetchSourceManifests(
                    plan.sources,
                    warehouseCredentials,
                    fetchSourceManifest,
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
            const explores = await adapter.compileAllExplores(
                trackingParams,
                false,
                true,
            );
            return {
                plan,
                explores,
                manifest: await gzipAsync(
                    JSON.stringify(projectMergedManifest(manifest)),
                ),
                catalog,
            };
        } finally {
            await sshTunnel.disconnect();
        }
    }

    private static async *groupExplores(
        original: AsyncIterable<Explore | ExploreError>,
        originalConnectionName: string,
        extraGroups: CompiledExtraGroup[],
    ): AsyncIterable<Explore | ExploreError> {
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
            yield explore;
        }
        for (const group of extraGroups) {
            yield* group.explores;
        }
    }

    async compile({
        projectUuid,
        primary,
        dbtVersion,
        includeUnboundSources,
        fetchSourceManifest,
        loadExtraCredentials,
        trackingParams,
    }: {
        projectUuid: string;
        primary: PrimaryCompileInput;
        dbtVersion: SupportedDbtVersions;
        includeUnboundSources: boolean;
        fetchSourceManifest: FetchSourceManifest;
        loadExtraCredentials: LoadExtraConnectionCredentials;
        trackingParams?: TrackingParams;
    }): Promise<MultiConnectionCompilation> {
        const [originalPlan, ...extraPlans] = await this.planGroups(
            projectUuid,
            includeUnboundSources,
        );
        const identity =
            await this.projectModel.getDbtSourceIdentity(projectUuid);
        const warnings: string[] = [];

        const originalSources = [
            {
                name: identity.dbtSourceName,
                precedence: 0,
                dbtSourceUuid: identity.dbtSourceUuid,
                manifest: primary.manifest,
                selectedModelIds: primary.selectedModelIds,
            },
            ...(await MultiConnectionCompiler.fetchSourceManifests(
                originalPlan.sources,
                primary.warehouseCredentials,
                fetchSourceManifest,
            )),
        ];
        const originalMerged = mergeCompileGroupManifests(originalSources);
        const originalAdapter = new DbtManifestProjectAdapter({
            parsedManifest: originalMerged.manifest,
            warehouseClient: warehouseClientForCompileGroup(
                primary.warehouseCredentials,
                originalPlan.listedDatabases,
                (database) => {
                    warnings.push(
                        `Connection "${originalPlan.connectionName}" skipped listed database "${database}": it does not exist.`,
                    );
                },
            ),
            cachedWarehouse: primary.cachedWarehouse,
            dbtVersion,
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
            try {
                compiledExtraGroups.push(
                    await this.compileExtraGroup({
                        projectUuid,
                        plan: extraPlan,
                        dbtVersion,
                        fetchSourceManifest,
                        loadExtraCredentials,
                        trackingParams,
                        warnings,
                    }),
                );
            } catch (error) {
                if (error instanceof ManifestCollisionError) throw error;
                failedConnectionUuids.push(extraPlan.warehouseConnectionUuid);
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
                originalPlan.connectionName,
                compiledExtraGroups,
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
                : explore;
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
                primaryDbtSourceUuid: identity.dbtSourceUuid,
            },
            persistArtifacts: async () => {},
        };
    }
}
