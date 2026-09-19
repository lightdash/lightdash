import {
    getWarehouseLocation,
    ParameterError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DeployTarget,
    type Explore,
    type ExploreError,
    type ProjectDbtSource,
} from '@lightdash/common';

type CliDeployProjectModel = {
    getWarehouseCredentialsForProject: (
        projectUuid: string,
        connectionUuid?: string,
    ) => Promise<CreateWarehouseCredentials>;
};

type CliDeploySourcesModel = {
    getSource: (sourceUuid: string) => Promise<ProjectDbtSource>;
};

const assertTargetMatchesConnection = (
    target: DeployTarget,
    credentials: CreateWarehouseCredentials,
): void => {
    const location = getWarehouseLocation(credentials);
    const connectionDatabase = location.database ?? location.schema;
    const locationLabel =
        credentials.type === WarehouseTypes.ATHENA ? 'catalog' : 'database';
    if (connectionDatabase !== target.database) {
        throw new ParameterError(
            `The dbt target compiles against ${locationLabel} ${target.database} but the source's connection points at ${connectionDatabase}.`,
        );
    }
    if (
        credentials.type === WarehouseTypes.ATHENA &&
        target.region !== undefined &&
        credentials.region !== target.region
    ) {
        throw new ParameterError(
            `The dbt target compiles against region ${target.region} but the source's connection points at ${credentials.region}.`,
        );
    }
};

export const prepareCliDeployExplores = async ({
    projectModel,
    projectDbtSourcesModel,
    projectUuid,
    sourceUuid,
    target,
    explores,
}: {
    projectModel: CliDeployProjectModel;
    projectDbtSourcesModel: CliDeploySourcesModel;
    projectUuid: string;
    sourceUuid?: string;
    target?: DeployTarget;
    explores: (Explore | ExploreError)[];
}): Promise<(Explore | ExploreError)[]> => {
    if (!sourceUuid) return explores;
    const source = await projectDbtSourcesModel.getSource(sourceUuid);
    if (source.projectUuid !== projectUuid) {
        throw new ParameterError(
            'The selected dbt source does not belong to this project.',
        );
    }
    if (target) {
        const credentials =
            await projectModel.getWarehouseCredentialsForProject(
                projectUuid,
                source.connectionUuid,
            );
        assertTargetMatchesConnection(target, credentials);
    }
    return explores.map((explore) =>
        explore.tables
            ? {
                  ...explore,
                  tables: Object.fromEntries(
                      Object.entries(explore.tables).map(([name, table]) => [
                          name,
                          {
                              ...table,
                              dbtSourceUuid: source.projectDbtSourceUuid,
                              connectionUuid: source.connectionUuid,
                          },
                      ]),
                  ),
              }
            : explore,
    );
};
