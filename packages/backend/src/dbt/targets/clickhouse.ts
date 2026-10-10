import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { envVar, envVarReference } from './helpers';

export const clickhouseTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.CLICKHOUSE }
    >,
    _policy: DbtTargetPolicy,
): DbtTargetResult => ({
    kind: 'target',
    target: {
        type: WarehouseTypes.CLICKHOUSE,
        host: credentials.host,
        port: credentials.port,
        user: envVarReference('user'),
        password: envVarReference('password'),
        schema: credentials.schema,
        secure: credentials.secure,
    },
    environment: {
        [envVar('user')]: credentials.user,
        [envVar('password')]: credentials.password,
    },
});
