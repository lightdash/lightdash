import {
    getWarehouseLocation,
    isExploreError,
    isUserManagedExplore,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type DbtSourceRefCatalogModel } from '../models/DbtSourceRefCatalogModel';
import { type ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { cliDeployConflictError } from '../utils/cliDeployError';
import { type CliDeploySelection } from './cliDeploy';

type InferenceModels = {
    projectModel: Pick<
        ProjectModel,
        | 'getDbtSourceIdentity'
        | 'getAllExploresFromCache'
        | 'getWarehouseCredentialsForBinding'
    >;
    projectDbtSourcesModel: Pick<
        ProjectDbtSourcesModel,
        'getSourcesWithBindings'
    >;
    dbtSourceRefCatalogModel: Pick<DbtSourceRefCatalogModel, 'getProjectNames'>;
    warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject' | 'getCredentials'
    >;
};

export type InferredCliDeploySource = {
    sourceUuid: string;
    method: 'package_match' | 'overlap_tiebreak' | 'database_tiebreak';
    explores: (Explore | ExploreError)[];
    droppedExploreCount: number;
};

const baseTable = (explore: Explore | ExploreError) =>
    explore.tables?.[explore.baseTable ?? explore.name];

const cachedSourceUuid = (explore: Explore | ExploreError) =>
    baseTable(explore)?.dbtSourceUuid ??
    (isExploreError(explore)
        ? (explore as ExploreError & { dbtSourceUuid?: string }).dbtSourceUuid
        : undefined);

export const inferCliDeploySource = async (
    models: InferenceModels,
    args: {
        projectUuid: string;
        explores: (Explore | ExploreError)[];
        dbtModelNames: string[] | undefined;
        cliDeploy: CliDeploySelection;
    },
): Promise<InferredCliDeploySource> => {
    const { projectUuid, explores, dbtModelNames, cliDeploy } = args;
    const identity =
        await models.projectModel.getDbtSourceIdentity(projectUuid);
    const sources =
        await models.projectDbtSourcesModel.getSourcesWithBindings(projectUuid);
    const sourceNames = [
        identity.dbtSourceName,
        ...sources.map((source) => source.name),
    ];
    const cannotInfer = (reason: string): never => {
        throw cliDeployConflictError(reason, sourceNames);
    };
    const successful = explores.filter((explore) => !isExploreError(explore));
    if (explores.length === 0)
        return cannotInfer(
            'the upload contains no explores; compile the dbt project and deploy again',
        );
    if (successful.length === 0)
        return cannotInfer(
            'none of the uploaded explores compiled successfully; fix the compile errors and deploy again',
        );
    if (successful.some((explore) => !baseTable(explore)?.dbtPackageName)) {
        return cannotInfer(
            'the uploaded explores carry no dbt project name; update the Lightdash CLI',
        );
    }
    const sourceUuids = new Set([
        identity.dbtSourceUuid,
        ...sources.map((source) => source.projectDbtSourceUuid),
    ]);
    const cached = Object.values(
        await models.projectModel.getAllExploresFromCache(projectUuid),
    ).filter((explore) => !isUserManagedExplore(explore));
    if (
        cached.some(
            (explore) => !sourceUuids.has(cachedSourceUuid(explore) ?? ''),
        )
    ) {
        return cannotInfer(
            'the saved explores do not identify their dbt source; refresh the project in Lightdash',
        );
    }
    const packages = new Map<string, Set<string>>();
    const addPackage = (packageName: string, sourceUuid: string) => {
        if (!sourceUuids.has(sourceUuid)) return;
        const owners = packages.get(packageName) ?? new Set<string>();
        owners.add(sourceUuid);
        packages.set(packageName, owners);
    };
    cached.forEach((explore) => {
        const table = baseTable(explore);
        const sourceUuid = cachedSourceUuid(explore);
        if (table?.dbtPackageName && sourceUuid) {
            addPackage(table.dbtPackageName, sourceUuid);
        }
    });
    const catalogNames =
        await models.dbtSourceRefCatalogModel.getProjectNames(projectUuid);
    catalogNames.forEach((row) => {
        addPackage(row.project_name, row.dbt_source_uuid);
    });
    const mapped = successful.filter((explore) =>
        packages.has(baseTable(explore)!.dbtPackageName!),
    );
    if (mapped.length === 0) {
        const uploadedPackages = [
            ...new Set(
                successful.map(
                    (explore) => baseTable(explore)!.dbtPackageName!,
                ),
            ),
        ];
        return cannotInfer(
            `no source in this project provides the dbt project ${uploadedPackages.join(', ')}`,
        );
    }
    const uploadedPackages = new Set(
        mapped.map((explore) => baseTable(explore)!.dbtPackageName!),
    );
    if (
        dbtModelNames !== undefined &&
        [...uploadedPackages].some(
            (packageName) =>
                !dbtModelNames.some((name) =>
                    name.startsWith(`${packageName}__`),
                ),
        )
    ) {
        return cannotInfer(
            'the explores and the model list disagree; run the deploy again',
        );
    }
    let candidates = [...sourceUuids].filter((sourceUuid) =>
        [...uploadedPackages].every((packageName) =>
            packages.get(packageName)!.has(sourceUuid),
        ),
    );
    if (candidates.length === 0)
        return cannotInfer(
            `the upload contains models from several sources (${[...uploadedPackages].join(', ')})`,
        );
    let method: InferredCliDeploySource['method'] = 'package_match';
    if (candidates.length > 1) {
        const names = new Set(mapped.map((explore) => explore.name));
        const overlap = candidates.filter((sourceUuid) => {
            const cachedNames = new Set(
                cached
                    .filter(
                        (explore) => cachedSourceUuid(explore) === sourceUuid,
                    )
                    .map((explore) => explore.name),
            );
            return (
                [...names].filter((name) => cachedNames.has(name)).length /
                    names.size >=
                0.9
            );
        });
        if (overlap.length > 0) candidates = overlap;
        if (candidates.length === 1) method = 'overlap_tiebreak';
    }
    if (candidates.length > 1) {
        const candidateNames = candidates.map((sourceUuid) =>
            sourceUuid === identity.dbtSourceUuid
                ? identity.dbtSourceName
                : sources.find(
                      (source) => source.projectDbtSourceUuid === sourceUuid,
                  )!.name,
        );
        const providerNames =
            candidateNames.length === 2
                ? candidateNames.join(' and ')
                : `${candidateNames.slice(0, -1).join(', ')} and ${candidateNames.at(-1)}`;
        const ambiguousReason = `sources ${providerNames} ${candidateNames.length === 2 ? 'both' : 'all'} provide ${[...uploadedPackages].join(', ')}, and ${cliDeploy.target ? `the dbt target database ${cliDeploy.target.database} does not pick one` : 'the deploy did not send a dbt target database'}`;
        const databases = new Set(
            mapped
                .map((explore) => baseTable(explore)?.database)
                .filter(Boolean),
        );
        if (cliDeploy.target) databases.add(cliDeploy.target.database);
        if (databases.size === 0) return cannotInfer(ambiguousReason);
        if (databases.size > 1)
            return cannotInfer(
                cliDeploy.target
                    ? 'the explores and the dbt target name different databases; run the deploy again'
                    : 'the uploaded explores name several databases; run the deploy again',
            );
        const [database] = databases;
        const matching = await Promise.all(
            candidates.map(async (sourceUuid) => {
                const source = sources.find(
                    (candidate) =>
                        candidate.projectDbtSourceUuid === sourceUuid,
                );
                let sourceDatabase = source?.warehouseLocation.database;
                if (!sourceDatabase) {
                    const credentials = source?.warehouseConnectionUuid
                        ? await models.warehouseConnectionModel.getCredentials(
                              await models.warehouseConnectionModel.getProject(
                                  projectUuid,
                              ),
                              source.warehouseConnectionUuid,
                          )
                        : await models.projectModel.getWarehouseCredentialsForBinding(
                              projectUuid,
                              { kind: 'original' },
                          );
                    const location = getWarehouseLocation(credentials);
                    sourceDatabase = location.database ?? location.schema;
                }
                return sourceDatabase === database ? sourceUuid : null;
            }),
        );
        candidates = matching.filter(
            (sourceUuid): sourceUuid is string => sourceUuid !== null,
        );
        method = 'database_tiebreak';
        if (candidates.length !== 1) return cannotInfer(ambiguousReason);
    }
    const [sourceUuid] = candidates;
    const cachedByName = new Map(
        cached.map((explore) => [explore.name, explore]),
    );
    const kept = explores.filter((explore) => {
        const packageName = baseTable(explore)?.dbtPackageName;
        const owners = packageName ? packages.get(packageName) : undefined;
        const existing = cachedByName.get(explore.name);
        const existingSource = existing
            ? cachedSourceUuid(existing)
            : undefined;
        if (owners && !owners.has(sourceUuid)) return false;
        if (existingSource && existingSource !== sourceUuid) {
            if (isExploreError(explore)) return false;
            return cannotInfer(
                'an uploaded explore name already belongs to another source',
            );
        }
        return true;
    });
    return {
        sourceUuid,
        method,
        explores: kept,
        droppedExploreCount: explores.length - kept.length,
    };
};
