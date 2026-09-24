import {
    getWarehouseLocation,
    ParameterError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DeployTarget,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../models/WarehouseConnectionModel/WarehouseConnectionModel';

export type CliDeploySelection = {
    sourceUuid: string | null;
    target: DeployTarget | null;
};

export const NO_CLI_DEPLOY_SELECTION: CliDeploySelection = {
    sourceUuid: null,
    target: null,
};

type CliDeployModels = {
    projectModel: Pick<
        ProjectModel,
        'getDbtSourceIdentity' | 'getWarehouseCredentialsForBinding'
    >;
    projectDbtSourcesModel: Pick<
        ProjectDbtSourcesModel,
        'getSourcesWithBindings'
    >;
    warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject' | 'list' | 'getCredentials'
    >;
};

type DeployDestination = {
    projectDbtSourceUuid: string | null;
    warehouseConnectionUuid: string | null;
    databaseOverride: string | null;
};

const resolveDestination = async (
    models: CliDeployModels,
    projectUuid: string,
    sourceUuid: string | null,
): Promise<DeployDestination> => {
    const original = {
        projectDbtSourceUuid: null,
        warehouseConnectionUuid: null,
        databaseOverride: null,
    };
    if (sourceUuid === null) return original;
    const identity =
        await models.projectModel.getDbtSourceIdentity(projectUuid);
    if (sourceUuid === identity.dbtSourceUuid) {
        return { ...original, projectDbtSourceUuid: sourceUuid };
    }
    const source = (
        await models.projectDbtSourcesModel.getSourcesWithBindings(projectUuid)
    ).find((candidate) => candidate.projectDbtSourceUuid === sourceUuid);
    if (!source) {
        throw new ParameterError(
            'The selected dbt source does not belong to this project.',
        );
    }
    return {
        projectDbtSourceUuid: source.projectDbtSourceUuid,
        warehouseConnectionUuid: source.warehouseConnectionUuid,
        databaseOverride: source.warehouseLocation.database,
    };
};

const connectionCredentials = async (
    models: CliDeployModels,
    projectUuid: string,
    warehouseConnectionUuid: string | null,
): Promise<{ name: string; credentials: CreateWarehouseCredentials }> => {
    const project =
        await models.warehouseConnectionModel.getProject(projectUuid);
    const connection = (
        await models.warehouseConnectionModel.list(project)
    ).find((candidate) =>
        warehouseConnectionUuid === null
            ? candidate.isOriginal
            : candidate.warehouseConnectionUuid === warehouseConnectionUuid,
    );
    if (!connection) {
        throw new ParameterError('The deploy connection was not found.');
    }
    return {
        name: connection.name,
        credentials:
            warehouseConnectionUuid === null
                ? await models.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'original' },
                  )
                : await models.warehouseConnectionModel.getCredentials(
                      project,
                      warehouseConnectionUuid,
                  ),
    };
};

const assertTargetMatchesConnection = (
    target: DeployTarget,
    connection: { name: string; credentials: CreateWarehouseCredentials },
    databaseOverride: string | null,
): void => {
    const location = getWarehouseLocation(connection.credentials);
    const connectionDatabase =
        databaseOverride ?? location.database ?? location.schema;
    const locationLabel =
        connection.credentials.type === WarehouseTypes.ATHENA
            ? 'catalog'
            : 'database';
    if (connectionDatabase !== target.database) {
        throw new ParameterError(
            `The dbt target compiles against ${locationLabel} ${target.database}, but the deploy goes to the connection "${connection.name}", which points at ${connectionDatabase}. Choose the dbt source for this target with --source.`,
        );
    }
    if (
        connection.credentials.type === WarehouseTypes.ATHENA &&
        target.region !== undefined &&
        connection.credentials.region !== target.region
    ) {
        throw new ParameterError(
            `The dbt target compiles against region ${target.region}, but the deploy goes to the connection "${connection.name}", which points at ${connection.credentials.region}. Choose the dbt source for this target with --source.`,
        );
    }
};

export const resolveCliDeploySource = async (
    models: CliDeployModels,
    projectUuid: string,
    selection: CliDeploySelection,
): Promise<string | null> => {
    const destination = await resolveDestination(
        models,
        projectUuid,
        selection.sourceUuid,
    );
    if (selection.target !== null) {
        assertTargetMatchesConnection(
            selection.target,
            await connectionCredentials(
                models,
                projectUuid,
                destination.warehouseConnectionUuid,
            ),
            destination.databaseOverride,
        );
    }
    return destination.projectDbtSourceUuid;
};

const withoutClientBinding = <T extends object>(value: T): T => {
    const {
        connectionUuid: _connectionUuid,
        warehouseConnectionUuid: _warehouseConnectionUuid,
        ...rest
    } = value as T & {
        connectionUuid?: unknown;
        warehouseConnectionUuid?: unknown;
    };
    return rest as T;
};

export const withoutClientBindings = (
    explore: Explore | ExploreError,
): Explore | ExploreError => {
    const stripped = withoutClientBinding(explore);
    return stripped.tables
        ? {
              ...stripped,
              tables: Object.fromEntries(
                  Object.entries(stripped.tables).map(([name, table]) => [
                      name,
                      withoutClientBinding(table),
                  ]),
              ),
          }
        : stripped;
};
