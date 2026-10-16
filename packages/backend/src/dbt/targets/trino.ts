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
): DbtTargetResult => {
    const target = {
        type: credentials.type,
        host: credentials.host,
        user: envVarReference('user'),
        port: credentials.port,
        database: credentials.dbname,
        schema: credentials.schema,
        http_scheme: credentials.http_scheme,
    };
    if (!credentials.password) {
        return {
            kind: 'target',
            target: { ...target, method: 'none' },
            environment: { [envVar('user')]: credentials.user },
        };
    }
    return {
        kind: 'target',
        target: {
            ...target,
            method: 'ldap',
            password: envVarReference('password'),
        },
        environment: {
            [envVar('user')]: credentials.user,
            [envVar('password')]: credentials.password,
        },
    };
};
