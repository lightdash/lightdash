import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { envVar, envVarReference } from './helpers';

export const trinoTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.TRINO }
    >,
    _policy: DbtTargetPolicy,
): DbtTargetResult => ({
    kind: 'target',
    target: {
        type: credentials.type,
        host: credentials.host,
        method: 'ldap',
        user: envVarReference('user'),
        password: envVarReference('password'),
        port: credentials.port,
        database: credentials.dbname,
        schema: credentials.schema,
        http_scheme: credentials.http_scheme,
    },
    environment: {
        [envVar('user')]: credentials.user,
        [envVar('password')]: credentials.password,
    },
});
