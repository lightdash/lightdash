import {
    combineManifestSources,
    DbtManifest,
    DbtRawModelNode,
    Explore,
    ExploreError,
    getDbtManifestVersion,
    getErrorMessage,
    getModelsFromManifest,
    InlineError,
    InlineErrorType,
    ManifestCollision,
    ManifestSource,
    MultipleConnectionsError,
    ParameterError,
    ProjectDbtSource,
    qualifyManifestNames,
} from '@lightdash/common';
import { ManifestValidator } from '@lightdash/common/dbt/validation';
import merge from 'lodash/merge';
import { ProjectAdapter } from '../types';
import { runWithConcurrency } from '../utils/runWithConcurrency';
import { DbtManifestProjectAdapter } from './dbtManifestProjectAdapter';

export class CompileGroup extends DbtManifestProjectAdapter {
    readonly connectionUuid: string;

    readonly connectionName: string;

    readonly manifest: DbtManifest;

    private crossConnectionErrors = new Map<string, InlineError[]>();

    constructor(
        args: ConstructorParameters<typeof DbtManifestProjectAdapter>[0] & {
            parsedManifest: DbtManifest;
            connectionUuid: string;
            connectionName: string;
        },
    ) {
        super(args);
        this.connectionUuid = args.connectionUuid;
        this.connectionName = args.connectionName;
        this.manifest = args.parsedManifest;
    }

    static partition(sources: ProjectDbtSource[]): ProjectDbtSource[][] {
        const groups = new Map<string, ProjectDbtSource[]>();
        sources.forEach((source) => {
            const group = groups.get(source.connectionUuid) ?? [];
            group.push(source);
            groups.set(source.connectionUuid, group);
        });
        return [...groups.values()];
    }

    static async fetchManifests<T, R>(
        sources: T[],
        concurrency: number,
        fetch: (source: T) => Promise<R>,
    ): Promise<R[]> {
        const pending: Promise<R>[] = [];
        try {
            return await runWithConcurrency(sources, concurrency, (source) => {
                const manifest = fetch(source);
                pending.push(manifest);
                return manifest;
            });
        } catch (error) {
            await Promise.allSettled(pending);
            throw error;
        }
    }

    static merge(manifests: ManifestSource[]) {
        const result = combineManifestSources(manifests);
        if (result.collisions.length > 0) {
            throw new ParameterError(
                CompileGroup.formatManifestCollisionsError(result.collisions),
            );
        }
        return result.manifest;
    }

    private get models(): DbtRawModelNode[] {
        return getModelsFromManifest(this.manifest);
    }

    private get resolvedNames(): Map<string, string> {
        return qualifyManifestNames(
            this.models.map((model) => ({
                ...model,
                uniqueId: model.unique_id,
            })),
            'model',
        );
    }

    setPeerGroups(groups: CompileGroup[]): void {
        if (groups.length === 1) return;
        const names = this.resolvedNames;
        const localNames = new Set(names.values());
        const sameSourceNames = new Set(
            this.models.map(
                (model) => `${model.lightdash_source_uuid}\u0000${model.name}`,
            ),
        );
        const foreignConnections = new Map<string, string[]>();
        groups
            .filter((group) => group !== this)
            .forEach((group) => {
                const peerNames = group.resolvedNames;
                group.models.forEach((model) => {
                    new Set([
                        model.name,
                        peerNames.get(model.unique_id)!,
                    ]).forEach((name) => {
                        const connections = foreignConnections.get(name) ?? [];
                        connections.push(group.connectionName);
                        foreignConnections.set(name, connections);
                    });
                });
            });
        const validator = new ManifestValidator(
            getDbtManifestVersion(this.manifest),
        );
        this.models.forEach((model) => {
            if (!validator.isModelValid(model)[0]) return;
            const meta = merge({}, model.meta, model.config?.meta);
            const joinsByExplore = [
                { name: names.get(model.unique_id)!, joins: meta.joins },
                ...Object.entries(meta.explores ?? {}).map(
                    ([name, explore]) => ({
                        name: model.lightdash_namespace_prefix
                            ? `${model.lightdash_namespace_prefix}__${name}`
                            : name,
                        joins: explore.joins ?? meta.joins,
                    }),
                ),
            ];
            joinsByExplore.forEach(({ name, joins }) => {
                const errors = (joins ?? []).flatMap((join): InlineError[] => {
                    const sameSourceModel = sameSourceNames.has(
                        `${model.lightdash_source_uuid}\u0000${join.join}`,
                    );
                    if (sameSourceModel || localNames.has(join.join)) return [];
                    return [
                        ...new Set(foreignConnections.get(join.join) ?? []),
                    ].map((connectionName) => ({
                        type: InlineErrorType.METADATA_PARSE_ERROR,
                        message: `Cannot join table "${model.name}" on connection "${this.connectionName}" to table "${join.join}" on connection "${connectionName}". Joins must use the same connection.`,
                    }));
                });
                if (errors.length > 0)
                    this.crossConnectionErrors.set(name, errors);
            });
        });
    }

    override async prepareExploreStream(
        ...args: Parameters<ProjectAdapter['prepareExploreStream']>
    ): Promise<AsyncIterable<Explore | ExploreError>> {
        const stream = await super.prepareExploreStream(...args);
        const errors = this.crossConnectionErrors;
        return (async function* compileGroupStream() {
            for await (const explore of stream) {
                const crossConnectionErrors = errors.get(explore.name);
                yield crossConnectionErrors
                    ? {
                          name: explore.name,
                          label: explore.label,
                          tags: explore.tags,
                          groupLabel: explore.groupLabel,
                          ...(explore.groups ? { groups: explore.groups } : {}),
                          errors: crossConnectionErrors,
                      }
                    : explore;
            }
        })();
    }

    private static formatManifestCollisionsError(
        collisions: ManifestCollision[],
    ): string {
        const MAX_COLLISIONS_IN_ERROR = 10;
        const shown = collisions.slice(0, MAX_COLLISIONS_IN_ERROR);
        const remainder = collisions.length - shown.length;
        const details = shown
            .map(
                (c) =>
                    `${c.section === 'nodes' ? 'Model' : 'Entry'} "${
                        c.key
                    }" is defined in both "${c.winningSource}" and "${
                        c.supersededSource
                    }"`,
            )
            .join('; ');
        const packageNames = collisions.map(
            (collision) => collision.key.match(/^[^.]+\.([^.]+)\./)?.[1],
        );
        const sharedPackageNames = [
            ...new Set(packageNames.filter((name) => name !== undefined)),
        ].sort();
        const allCollisionsIdentifyPackages =
            packageNames.length > 0 &&
            packageNames.every((name) => name !== undefined);

        if (allCollisionsIdentifyPackages) {
            const formatQuotedList = (values: string[]) => {
                const shownValues = values.slice(0, MAX_COLLISIONS_IN_ERROR);
                const quotedValues = shownValues.map((value) => `"${value}"`);
                const formattedValues =
                    quotedValues.length <= 2
                        ? quotedValues.join(' and ')
                        : `${quotedValues.slice(0, -1).join(', ')}, and ${
                              quotedValues.at(-1) ?? ''
                          }`;
                const omittedValues = values.length - shownValues.length;
                return omittedValues > 0
                    ? `${formattedValues} and ${omittedValues} more`
                    : formattedValues;
            };
            const sourceNames = [
                ...new Set(
                    collisions.flatMap((collision) => [
                        collision.winningSource,
                        collision.supersededSource,
                    ]),
                ),
            ].sort();

            return (
                `The dbt sources ${formatQuotedList(
                    sourceNames,
                )} use the same dbt project name${
                    sharedPackageNames.length === 1 ? '' : 's'
                } ${formatQuotedList(
                    sharedPackageNames,
                )}. Change the name: value in one repository's dbt_project.yml and deploy again. ` +
                `${details}${remainder > 0 ? `; and ${remainder} more` : ''}.`
            );
        }

        return (
            `Merging dbt sources found ${collisions.length} naming collision${
                collisions.length === 1 ? '' : 's'
            }: ${details}${remainder > 0 ? `; and ${remainder} more` : ''}. ` +
            `Rename or remove the duplicate(s) before deploying.`
        );
    }
}

export class CompileGroupsProjectAdapter implements ProjectAdapter {
    constructor(
        readonly groups: CompileGroup[],
        private readonly onPrepared: () => Promise<void>,
        private readonly cleanup: () => Promise<void>,
    ) {
        groups.forEach((group) => group.setPeerGroups(groups));
    }

    async prepareExploreStream(
        ...args: Parameters<ProjectAdapter['prepareExploreStream']>
    ): Promise<AsyncIterable<Explore | ExploreError>> {
        const streams: AsyncIterable<Explore | ExploreError>[] = [];
        await this.groups.reduce(async (previous, group) => {
            await previous;
            try {
                await group.warehouseClient.test();
                streams.push(await group.prepareExploreStream(...args));
            } catch (error) {
                throw new ParameterError(
                    `Failed to compile connection "${group.connectionName}": ${getErrorMessage(error)}`,
                );
            }
        }, Promise.resolve());
        await this.onPrepared();
        return (async function* union() {
            const names = new Set<string>();
            const readStream = async function* readStream(
                stream: AsyncIterable<Explore | ExploreError>,
            ) {
                for await (const explore of stream) {
                    if (names.has(explore.name)) {
                        throw new ParameterError(
                            `Explore name "${explore.name}" is used by more than one compile group. Use distinct namespace prefixes.`,
                        );
                    }
                    names.add(explore.name);
                    yield explore;
                }
            };
            for (const stream of streams) yield* readStream(stream);
        })();
    }

    async compileAllExplores(
        ...args: Parameters<ProjectAdapter['compileAllExplores']>
    ) {
        const result: (Explore | ExploreError)[] = [];
        for await (const explore of await this.prepareExploreStream(...args)) {
            result.push(explore);
        }
        return result;
    }

    getDbtManifest() {
        if (this.groups.length !== 1) throw new MultipleConnectionsError();
        return this.groups[0].getDbtManifest();
    }

    getDbtPackages() {
        return this.groups[0].getDbtPackages();
    }

    getLightdashProjectConfig(
        ...args: Parameters<ProjectAdapter['getLightdashProjectConfig']>
    ) {
        return this.groups[0].getLightdashProjectConfig(...args);
    }

    getProjectContext() {
        return this.groups[0].getProjectContext();
    }

    async test() {
        await this.groups.reduce(async (previous, group) => {
            await previous;
            await group.test();
        }, Promise.resolve());
    }

    async destroy() {
        try {
            await Promise.all(this.groups.map((group) => group.destroy()));
        } finally {
            await this.cleanup();
        }
    }
}
