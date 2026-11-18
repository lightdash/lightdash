import { ParameterError, WarehouseTypes } from '@lightdash/common';
import { PostgresWarehouseClient } from '@lightdash/warehouses';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    ConnectionSurface,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import { type WarehouseClientFactory } from '../WarehouseClientFactory/WarehouseClientFactory';

export async function withMaterializationWarehouse<T>(
    projectModel: Pick<ProjectModel, 'getWarehouseCredentialsForBinding'>,
    factory: Pick<WarehouseClientFactory, 'withWarehouseClient'>,
    projectUuid: string,
    organizationUuid: string,
    modelName: string,
    operation: (warehouse: PostgresWarehouseClient) => Promise<T>,
): Promise<T> {
    const credentials = await projectModel.getWarehouseCredentialsForBinding(
        projectUuid,
        { kind: 'original' },
    );
    const message = `Model ${modelName} requires shared Postgres credentials.`;
    if (
        credentials.type !== WarehouseTypes.POSTGRES ||
        credentials.requireUserCredentials
    )
        throw new ParameterError(message);
    return factory.withWarehouseClient(
        {
            kind: 'resolved',
            projectUuid,
            credentials,
            aiPlan: null,
            warehouseConnectionUuid: null,
            connectionRoute: null,
        },
        {
            organizationUuid,
            queryContext: null,
            purpose: 'query',
            aiAccess: 'enforce',
            actor: {
                surface: ConnectionSurface.SCHEDULE,
                person: null,
                aiClient: null,
            },
        },
        async ({ warehouseClient, credentialKind }) => {
            if (
                !(warehouseClient instanceof PostgresWarehouseClient) ||
                credentialKind !== WarehouseCredentialKind.SHARED
            )
                throw new ParameterError(message);
            return operation(warehouseClient);
        },
    );
}
