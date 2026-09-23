import {
    combineManifestSources,
    getCompiledModels,
    getModelsFromManifest,
    ParameterError,
    UnexpectedServerError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DbtProjectConfig,
    type ManifestCollision,
    type WarehouseClient,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    warehouseClientFromCredentials,
    type WarehouseListedDatabases,
} from '@lightdash/warehouses';
import { type BoundProjectDbtSource } from '../models/ProjectDbtSourcesModel';
import { type CompileConnection } from '../models/WarehouseConnectionModel/WarehouseConnectionModel';

export type CompilableDbtSource = BoundProjectDbtSource & {
    dbtConnection: DbtProjectConfig;
};

export type CompileGroupPlan = {
    warehouseConnectionUuid: string | null;
    connectionName: string;
    listedDatabases: WarehouseListedDatabases;
    sources: CompilableDbtSource[];
};

export type SourceManifest = {
    name: string;
    precedence: number;
    dbtSourceUuid: string;
    manifest: DbtManifest;
    selectedModelIds?: string[];
};

export class ManifestCollisionError extends ParameterError {}

const MAX_COLLISIONS_IN_ERROR = 10;

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

export const formatManifestCollisionsError = (
    collisions: ManifestCollision[],
): string => {
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
};

const withCompilationSelection = (
    manifest: DbtManifest,
    selectedModelIds?: string[],
): DbtManifest => {
    const compiledModelIds = new Set(
        getCompiledModels(getModelsFromManifest(manifest), selectedModelIds)
            .filter((node) => node.resource_type === 'model')
            .map((node) => node.unique_id),
    );
    return {
        ...manifest,
        nodes: Object.fromEntries(
            Object.entries(manifest.nodes).map(([uniqueId, node]) => [
                uniqueId,
                node.resource_type === 'model'
                    ? { ...node, compiled: compiledModelIds.has(uniqueId) }
                    : node,
            ]),
        ) as DbtManifest['nodes'],
    };
};

const withSourceIdentity = (
    manifest: DbtManifest,
    dbtSourceUuid: string,
): DbtManifest => ({
    ...manifest,
    nodes: Object.fromEntries(
        Object.entries(manifest.nodes).map(([uniqueId, node]) => [
            uniqueId,
            node.resource_type === 'model' || node.resource_type === 'seed'
                ? { ...node, lightdash_source_uuid: dbtSourceUuid }
                : node,
        ]),
    ) as DbtManifest['nodes'],
});

const combineSelectedModelIds = (
    sources: { manifest: DbtManifest; selectedModelIds?: string[] }[],
): string[] | undefined => {
    if (sources.every((source) => source.selectedModelIds === undefined)) {
        return undefined;
    }
    return Array.from(
        new Set(
            sources.flatMap((source) =>
                source.selectedModelIds === undefined
                    ? getCompiledModels(getModelsFromManifest(source.manifest))
                          .filter((model) => model.resource_type === 'model')
                          .map((model) => model.unique_id)
                    : source.selectedModelIds,
            ),
        ),
    );
};

export const mergeCompileGroupManifests = (
    sources: SourceManifest[],
): { manifest: DbtManifest; selectedModelIds: string[] | undefined } => {
    const prepared = sources.map((source) => ({
        ...source,
        manifest: withSourceIdentity(
            withCompilationSelection(source.manifest, source.selectedModelIds),
            source.dbtSourceUuid,
        ),
    }));
    const { manifest, collisions } = combineManifestSources(
        prepared.map(({ name, precedence, manifest: sourceManifest }) => ({
            name,
            precedence,
            manifest: sourceManifest,
        })),
    );
    if (collisions.length > 0) {
        throw new ManifestCollisionError(
            formatManifestCollisionsError(collisions),
        );
    }
    return { manifest, selectedModelIds: combineSelectedModelIds(prepared) };
};

export const planCompileGroups = ({
    connections,
    sources,
    includeUnboundSources,
}: {
    connections: CompileConnection[];
    sources: BoundProjectDbtSource[];
    includeUnboundSources: boolean;
}): CompileGroupPlan[] => {
    const original = connections.find((connection) => connection.isOriginal);
    if (!original) {
        throw new UnexpectedServerError(
            'The project has no original warehouse connection',
        );
    }
    const brokenSource = sources.find((source) => source.hasCredentialError);
    if (brokenSource) {
        throw new ParameterError(
            `Failed to load dbt source "${brokenSource.name}": its connection credentials could not be decrypted. Remove it and add it again with a fresh connection.`,
        );
    }
    const compilable = sources.filter(
        (source): source is CompilableDbtSource =>
            source.dbtConnection !== null,
    );
    const toPlan = (
        connection: CompileConnection,
        groupSources: CompilableDbtSource[],
    ): CompileGroupPlan => ({
        warehouseConnectionUuid: connection.isOriginal
            ? null
            : connection.warehouseConnectionUuid,
        connectionName: connection.name,
        listedDatabases: {
            listAllDatabases: connection.listAllDatabases,
            additionalDatabases: connection.additionalDatabases,
        },
        sources: groupSources,
    });
    const knownConnections = new Set(
        connections.map((connection) => connection.warehouseConnectionUuid),
    );
    const unknownBinding = compilable.find(
        (source) =>
            source.warehouseConnectionUuid !== null &&
            !knownConnections.has(source.warehouseConnectionUuid),
    );
    if (unknownBinding) {
        throw new UnexpectedServerError(
            `dbt source "${unknownBinding.name}" is bound to a connection outside this project`,
        );
    }
    const extraPlans = connections
        .filter((connection) => !connection.isOriginal)
        .map((connection) =>
            toPlan(
                connection,
                compilable.filter(
                    (source) =>
                        source.warehouseConnectionUuid ===
                        connection.warehouseConnectionUuid,
                ),
            ),
        )
        .filter((plan) => plan.sources.length > 0);
    return [
        toPlan(
            original,
            includeUnboundSources
                ? compilable.filter(
                      (source) => source.warehouseConnectionUuid === null,
                  )
                : [],
        ),
        ...extraPlans,
    ];
};

export const warehouseClientForCompileGroup = (
    credentials: CreateWarehouseCredentials,
    listedDatabases: WarehouseListedDatabases,
    onSkippedDatabase: (database: string) => void,
): WarehouseClient =>
    credentials.type === WarehouseTypes.POSTGRES
        ? new ListedDatabasesPostgresWarehouseClient(
              credentials,
              listedDatabases,
              onSkippedDatabase,
          )
        : warehouseClientFromCredentials(credentials);
