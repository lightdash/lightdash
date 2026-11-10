import {
    CreateWarehouseCredentials,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { DEFAULT_THREADS, envVar, envVarReference } from './helpers';

export const snowflakeTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.SNOWFLAKE }
    >,
    _policy: DbtTargetPolicy,
): DbtTargetResult => {
    const result: Extract<DbtTargetResult, { kind: 'target' }> = {
        kind: 'target',
        target: {
            type: credentials.type,
            account: credentials.account,
            user: envVarReference('user'),
            password: envVarReference('password'),
            role: credentials.role,
            database: credentials.database,
            warehouse: credentials.warehouse,
            schema: credentials.schema,
            threads: DEFAULT_THREADS,
            client_session_keep_alive: credentials.clientSessionKeepAlive,
            query_tag: credentials.queryTag,
        },
        environment: {
            [envVar('user')]: credentials.user,
        },
    };
    if (credentials.authenticationType === SnowflakeAuthenticationType.SSO) {
        // Credentials from SSO will be loaded on _resolveWarehouseClientCredentials in ProjectService
        console.debug('Snowflake authentication type is SSO');
    } else if (
        (!credentials.authenticationType ||
            credentials.authenticationType === 'password') &&
        credentials.password
    ) {
        result.target.password = envVarReference('password');
        result.environment[envVar('password')] = credentials.password;
    } else if (credentials.privateKey) {
        result.target.private_key = envVarReference('privateKey');
        result.environment[envVar('privateKey')] = credentials.privateKey;

        if (credentials.privateKeyPass) {
            result.target.private_key_passphrase =
                envVarReference('privateKeyPass');
            result.environment[envVar('privateKeyPass')] =
                credentials.privateKeyPass;
        }
    } else {
        throw new Error(
            `Incorrect snowflake profile. Profile should have SSO credentials, password or private key.`,
        );
    }
    return result;
};
