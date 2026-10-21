import {
    isExploreError,
    isUserManagedExplore,
    ParameterError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import { type DbtSourceRefCatalogModel } from '../models/DbtSourceRefCatalogModel';
import { type ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import {
    cliDeployCollisionReason,
    cliDeployConflictError,
} from '../utils/cliDeployError';

const baseTable = (explore: Explore | ExploreError) =>
    explore.tables?.[explore.baseTable ?? explore.name];

const sourceOf = (explore: Explore | ExploreError) =>
    baseTable(explore)?.dbtSourceUuid ??
    (isExploreError(explore)
        ? (explore as ExploreError & { dbtSourceUuid?: string }).dbtSourceUuid
        : undefined);

export const resolveCliPreviewDeploy = async (
    models: {
        projectModel: Pick<
            ProjectModel,
            'getDbtSourceIdentity' | 'getAllExploresFromCache'
        >;
        projectDbtSourcesModel: Pick<
            ProjectDbtSourcesModel,
            'getSourcesWithBindings'
        >;
        dbtSourceRefCatalogModel: Pick<
            DbtSourceRefCatalogModel,
            'getProjectNames'
        >;
    },
    args: {
        projectUuid: string;
        upstreamProjectUuid?: string;
        explores: (Explore | ExploreError)[];
        sourceUuid: string | null;
    },
): Promise<{
    sourcesByPackage: ReadonlyMap<string, string>;
    sourceAliases: ReadonlyMap<string, string>;
    sourceUuids: string[];
}> => {
    const identity = await models.projectModel.getDbtSourceIdentity(
        args.projectUuid,
    );
    const sources = await models.projectDbtSourcesModel.getSourcesWithBindings(
        args.projectUuid,
    );
    const sourceNames = new Map([
        [identity.dbtSourceUuid, identity.dbtSourceName],
        ...sources.map(
            (source) => [source.projectDbtSourceUuid, source.name] as const,
        ),
    ]);
    const refuse = (reason: string): never => {
        throw cliDeployConflictError(reason, [...sourceNames.values()]);
    };
    if (args.sourceUuid !== null && !sourceNames.has(args.sourceUuid)) {
        throw new ParameterError(
            'The selected dbt source does not belong to this project.',
        );
    }
    const cached = Object.values(
        await models.projectModel.getAllExploresFromCache(args.projectUuid),
    ).filter((explore) => !isUserManagedExplore(explore));
    const sourceAliases = new Map(
        [...sourceNames.keys()].map((uuid) => [uuid, uuid]),
    );
    const packages = new Map<string, Set<string>>();
    const add = (packageName: string, sourceUuid: string | undefined) => {
        if (!sourceUuid || !sourceNames.has(sourceUuid)) return;
        const owners = packages.get(packageName) ?? new Set<string>();
        owners.add(sourceUuid);
        packages.set(packageName, owners);
    };
    const readPackages = async (
        projectUuid: string,
        remap: ReadonlyMap<string, string>,
    ) => {
        const saved =
            projectUuid === args.projectUuid
                ? cached
                : Object.values(
                      await models.projectModel.getAllExploresFromCache(
                          projectUuid,
                      ),
                  ).filter((explore) => !isUserManagedExplore(explore));
        saved.forEach((explore) => {
            const packageName = baseTable(explore)?.dbtPackageName;
            const owner = sourceOf(explore);
            if (packageName && owner) add(packageName, remap.get(owner));
        });
        const catalog =
            await models.dbtSourceRefCatalogModel.getProjectNames(projectUuid);
        catalog.forEach((row) =>
            add(row.project_name, remap.get(row.dbt_source_uuid)),
        );
    };
    await readPackages(
        args.projectUuid,
        new Map([...sourceNames.keys()].map((uuid) => [uuid, uuid])),
    );
    if (args.upstreamProjectUuid) {
        const parentIdentity = await models.projectModel.getDbtSourceIdentity(
            args.upstreamProjectUuid,
        );
        const parentSources =
            await models.projectDbtSourcesModel.getSourcesWithBindings(
                args.upstreamProjectUuid,
            );
        const remap = new Map([
            [parentIdentity.dbtSourceUuid, identity.dbtSourceUuid],
        ]);
        parentSources.forEach((parent) => {
            const copied = sources.find(
                (source) =>
                    source.name === parent.name &&
                    !source.hasCredentialError &&
                    !parent.hasCredentialError &&
                    source.dbtConnection !== null &&
                    isEqual(source.dbtConnection, parent.dbtConnection),
            );
            if (copied)
                remap.set(
                    parent.projectDbtSourceUuid,
                    copied.projectDbtSourceUuid,
                );
        });
        remap.forEach((source, parent) => sourceAliases.set(parent, source));
        await readPackages(args.upstreamProjectUuid, remap);
    }
    const cachedOwner = (explore: Explore | ExploreError) => {
        const stamped = sourceOf(explore);
        if (stamped) return sourceAliases.get(stamped);
        const packageName = baseTable(explore)?.dbtPackageName;
        const owners = packageName ? packages.get(packageName) : undefined;
        return owners?.size === 1 ? [...owners][0] : undefined;
    };
    if (
        cached.some((explore) => !sourceNames.has(cachedOwner(explore) ?? ''))
    ) {
        refuse(
            'the saved explores do not identify their dbt source; refresh the project in Lightdash',
        );
    }
    if (args.explores.length === 0)
        refuse(
            'the upload contains no explores; compile the dbt project and deploy again',
        );
    const ownerForPackage = (packageName: string | undefined): string => {
        if (!packageName)
            refuse(
                'the uploaded explores carry no dbt project name; update the Lightdash CLI',
            );
        const owners = [...(packages.get(packageName!) ?? [])];
        if (owners.length === 0)
            refuse(
                `no source in this project provides the dbt project ${packageName}`,
            );
        if (owners.length > 1)
            refuse(
                `several sources (${owners.map((owner) => sourceNames.get(owner)).join(', ')}) provide ${packageName}; the preview cannot assign its models to one source`,
            );
        return owners[0];
    };
    const ownersByExplore = new Map<string, string>();
    for (const explore of args.explores) {
        const owner = ownerForPackage(baseTable(explore)?.dbtPackageName);
        Object.values(explore.tables ?? {}).forEach((table) => {
            if (table.dbtPackageName) ownerForPackage(table.dbtPackageName);
        });
        const priorOwner = ownersByExplore.get(explore.name);
        if (priorOwner && priorOwner !== owner) {
            refuse(
                cliDeployCollisionReason([
                    {
                        exploreName: explore.name,
                        sourceName: sourceNames.get(priorOwner)!,
                    },
                ]),
            );
        }
        ownersByExplore.set(explore.name, owner);
    }
    const deployedSources = new Set(ownersByExplore.values());
    if (
        args.sourceUuid !== null &&
        deployedSources.size === 1 &&
        !deployedSources.has(args.sourceUuid)
    ) {
        refuse(
            `the deploy named source ${sourceNames.get(args.sourceUuid)}, but the uploaded explores belong to source ${sourceNames.get([...deployedSources][0])}`,
        );
    }
    return {
        sourcesByPackage: new Map(
            [...packages].flatMap(([packageName, owners]) =>
                owners.size === 1
                    ? [[packageName, [...owners][0]] as const]
                    : [],
            ),
        ),
        sourceAliases,
        sourceUuids: [...deployedSources],
    };
};
