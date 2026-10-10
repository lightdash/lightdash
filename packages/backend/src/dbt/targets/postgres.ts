import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { DEFAULT_THREADS, envVar, envVarReference } from './helpers';

export const postgresTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.POSTGRES }
    >,
    _policy: DbtTargetPolicy,
): DbtTargetResult => ({
    kind: 'target',
    target: {
        type: credentials.type,
        host: credentials.host,
        user: envVarReference('user'),
        password: envVarReference('password'),
        port: credentials.port,
        dbname: credentials.dbname,
        schema: credentials.schema,
        threads: DEFAULT_THREADS,
        keepalives_idle: credentials.keepalivesIdle,
        search_path: credentials.searchPath,
        role: credentials.role,
        sslmode: credentials.sslmode,
        ...(credentials.host.endsWith('.rds.amazonaws.com')
            ? {
                  sslrootcert:
                      require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-rds-global.pem'),
              }
            : {}),
    },
    environment: {
        [envVar('user')]: credentials.user,
        [envVar('password')]: credentials.password,
    },
});
