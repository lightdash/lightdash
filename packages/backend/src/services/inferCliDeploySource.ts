import {
    ConflictError,
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

const cannotInfer = (reason: string): never => {
    throw new ConflictError(
        `Cannot infer the dbt source for this complete deploy: ${reason}. Pass --source or run lightdash config set-source, then deploy again. Refresh the project first if its cached source identities are missing.`,
    );
};

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
        return cannotInfer('cached explores have unknown source identities');
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
    const successful = explores.filter((explore) => !isExploreError(explore));
    if (successful.some((explore) => !baseTable(explore)?.dbtPackageName)) {
        return cannotInfer('an uploaded base table has no dbt package');
    }
    const mapped = successful.filter((explore) =>
        packages.has(baseTable(explore)!.dbtPackageName!),
    );
    if (mapped.length === 0)
        return cannotInfer('no uploaded package matches a source');
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
        return cannotInfer('the uploaded packages disagree with dbtModelNames');
    }
    let candidates = [...sourceUuids].filter((sourceUuid) =>
        [...uploadedPackages].every((packageName) =>
            packages.get(packageName)!.has(sourceUuid),
        ),
    );
    if (candidates.length === 0)
        return cannotInfer(
            'the upload contains packages from different sources',
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
        const databases = new Set(
            mapped
                .map((explore) => baseTable(explore)?.database)
                .filter(Boolean),
        );
        if (cliDeploy.target) databases.add(cliDeploy.target.database);
        if (databases.size !== 1)
            return cannotInfer(
                'the uploaded database is missing or inconsistent',
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
    }
    if (candidates.length !== 1)
        return cannotInfer(
            'several sources match, or no source matches the database',
        );
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
                'an uploaded explore name belongs to another source',
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
