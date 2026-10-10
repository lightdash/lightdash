import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { envVar, envVarReference } from './helpers';

export const databricksTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.DATABRICKS }
    >,
    _policy: DbtTargetPolicy,
): DbtTargetResult => {
    const tokenValue = credentials.token ?? credentials.personalAccessToken;
    if (!tokenValue) {
        throw new Error(
            'Databricks credentials must have either token or personalAccessToken',
        );
    }
    return {
        kind: 'target',
        target: {
            type: WarehouseTypes.DATABRICKS,
            catalog: credentials.catalog,
            // this supposed to be a `schema` but changing it will break for existing customers
            schema: credentials.database,
            host: credentials.serverHostName,
            token: envVarReference('token'),
            http_path: credentials.httpPath,
        },
        environment: {
            [envVar('token')]:
                credentials.personalAccessToken || credentials.token || '',
        },
    };
};
