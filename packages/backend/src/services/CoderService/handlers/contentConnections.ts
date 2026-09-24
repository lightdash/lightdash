import { ParameterError, type WarehouseConnection } from '@lightdash/common';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';

export type ContentConnectionModels = {
    projectModel: Pick<ProjectModel, 'getConnectionRoute'>;
    warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject' | 'list'
    >;
};

export const listContentConnections = async (
    models: ContentConnectionModels,
    projectUuid: string,
): Promise<WarehouseConnection[]> => {
    if (
        (await models.projectModel.getConnectionRoute(projectUuid, {
            kind: 'original',
        })) !== 'multi'
    ) {
        return [];
    }
    return models.warehouseConnectionModel.list(
        await models.warehouseConnectionModel.getProject(projectUuid),
    );
};

export const resolveContentConnection = (
    connections: WarehouseConnection[],
    name: string | undefined,
): string | null => {
    if (name === undefined) return null;
    const connection = connections.find((candidate) => candidate.name === name);
    if (!connection) {
        throw new ParameterError(
            `This project has no connection named "${name}".`,
        );
    }
    return connection.isOriginal ? null : connection.warehouseConnectionUuid;
};

export const getContentConnectionName = (
    connections: WarehouseConnection[],
    warehouseConnectionUuid: string | null,
): string | undefined => {
    if (warehouseConnectionUuid === null) return undefined;
    const connection = connections.find(
        (candidate) =>
            candidate.warehouseConnectionUuid === warehouseConnectionUuid,
    );
    if (!connection) {
        throw new ParameterError(
            'Content is bound to a connection that is not in this project.',
        );
    }
    return connection.isOriginal ? undefined : connection.name;
};
