import {
    AthenaAuthenticationType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type CreateAthenaCredentials,
    type CreateClickhouseCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateTrinoCredentials,
} from '@lightdash/common';
import { generateKeyPairSync } from 'node:crypto';

export const snowflakeKeyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});
export const snowflakePrivateKey = snowflakeKeyPair.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
export const snowflakePassphrase = ' passphrase with spaces ';
export const snowflakeEncryptedKey = snowflakeKeyPair.privateKey
    .export({
        format: 'pem',
        type: 'pkcs8',
        cipher: 'aes-256-cbc',
        passphrase: snowflakePassphrase,
    })
    .toString();
export const snowflakeSecrets = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    user: 'SlotUser',
    role: 'SlotRole',
    warehouse: 'SlotWarehouse',
    privateKey: snowflakePrivateKey,
} as const;
export const snowflakeVerification = {
    ok: true,
    principal: 'OBSERVED_USER',
    observed: { currentUser: 'OBSERVED_USER', currentRole: 'OBSERVED_ROLE' },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};

export const athenaSecrets = {
    type: WarehouseTypes.ATHENA,
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'slot-access-key',
    secretAccessKey: 'slot-secret-key',
    workGroup: 'agent-workgroup',
    s3StagingDir: 's3://agent-results/prefix/',
} as const;

export const athenaConnection: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    threads: 2,
    numRetries: 1,
    startOfWeek: 1,
    dataTimezone: 'UTC',
    accessKeyId: 'person-key',
    secretAccessKey: 'person-secret',
    sessionToken: 'person-token',
    assumeRoleArn: 'arn:aws:iam::123456789012:role/person',
    assumeRoleExternalId: 'person-external',
    webIdentityAudience: 'person-audience',
    workGroup: 'person-workgroup',
    s3StagingDir: 's3://person-results/',
    s3DataDir: 's3://person-data/',
    requireUserCredentials: true,
};
export const athenaVerification = {
    ok: true,
    principal: 'arn:aws:sts::123456789012:assumed-role/agent/session',
    observed: {
        principalArn: 'arn:aws:sts::123456789012:assumed-role/agent/session',
    },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};

export const postgresSecrets = {
    type: WarehouseTypes.POSTGRES,
    user: 'ai_agents',
    password: 'agent-password',
} as const;

export const postgresConnection: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    port: 5432,
    dbname: 'analytics',
    schema: 'reporting',
    user: 'project-user',
    password: 'project-password',
    role: 'project-role',
    sslcert: 'project-cert',
    sslkey: 'project-key',
    sslmode: 'verify-full',
    sslrootcert: 'root-cert',
    useSshTunnel: true,
    sshTunnelHost: 'bastion.internal',
    sshTunnelPort: 22,
    sshTunnelUser: 'tunnel-user',
    sshTunnelPublicKey: 'tunnel-public',
    sshTunnelPrivateKey: 'tunnel-private',
    requireUserCredentials: true,
};

export const postgresVerification = {
    ok: true,
    principal: 'ai_agents',
    observed: { currentUser: 'ai_agents' },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};

export const redshiftSecrets = {
    type: WarehouseTypes.REDSHIFT,
    user: 'ai_agents',
    password: 'agent-password',
} as const;

export const redshiftConnection: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'warehouse.internal',
    port: 5439,
    authenticationType: RedshiftAuthenticationType.IAM,
    accessKeyId: 'parent-access',
    secretAccessKey: 'parent-secret',
    sessionToken: 'parent-token',
    assumeRoleArn: 'parent-role',
    assumeRoleExternalId: 'parent-external-id',
    awsSsoStartUrl: 'parent-sso-url',
    awsSsoRegion: 'parent-sso-region',
    awsSsoAccountId: 'parent-sso-account',
    awsSsoRoleName: 'parent-sso-role',
    autoCreate: true,
    dbGroups: ['parent-group'],
    region: 'us-east-1',
    clusterIdentifier: 'cluster',
    workgroupName: 'workgroup',
    isServerless: true,
    ra3Node: true,
    dbname: 'analytics',
    schema: 'reporting',
    user: 'project-user',
    password: 'project-password',
    sslmode: 'verify-full',
    useSshTunnel: true,
    sshTunnelHost: 'bastion.internal',
    sshTunnelPort: 22,
    sshTunnelUser: 'tunnel-user',
    sshTunnelPublicKey: 'tunnel-public',
    sshTunnelPrivateKey: 'tunnel-private',
    requireUserCredentials: true,
};

export const redshiftVerification = {
    ok: true,
    principal: 'ai_agents',
    observed: { currentUser: 'ai_agents' },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};

export const trinoSecrets = {
    type: WarehouseTypes.TRINO,
    user: 'ai_agents',
    password: 'agent-password',
} as const;

export const trinoConnection: CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'warehouse.internal',
    port: 8443,
    dbname: 'analytics',
    schema: 'reporting',
    http_scheme: 'https',
    source: 'project-source',
    startOfWeek: 1,
    dataTimezone: 'Europe/London',
    user: 'project-user',
    password: 'project-password',
    requireUserCredentials: true,
};

export const trinoVerification = {
    ok: true,
    principal: 'MappedAgent/RestrictedRole',
    observed: { currentUser: 'MappedAgent/RestrictedRole' },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};

export const clickhouseSecrets = {
    type: WarehouseTypes.CLICKHOUSE,
    user: 'ai_agents',
    password: 'agent-password',
} as const;

export const clickhouseConnection: CreateClickhouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE,
    host: 'warehouse.internal',
    port: 8443,
    schema: 'analytics',
    secure: true,
    timeoutSeconds: 60,
    startOfWeek: 1,
    dataTimezone: 'Europe/London',
    user: 'project-user',
    password: 'project-password',
    requireUserCredentials: true,
};

export const clickhouseVerification = {
    ok: true,
    principal: 'ai_agents',
    observed: { currentUser: 'ai_agents', readonly: '2', useQueryCache: '0' },
    message: 'Shared agent account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};

export const clickhouseSlot: AiServiceAccountSlot = {
    uuid: 'clickhouse-slot',
    identityUuid: 'clickhouse-generation',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    kind: 'ai_service_account',
    scope: 'connection',
    warehouseType: WarehouseTypes.CLICKHOUSE,
    method: 'password',
    createdByUserUuid: 'creator',
    updatedByUserUuid: 'updater',
    credentialSubjectUserUuid: null,
    createdAt: new Date('2026-10-10T00:00:00Z'),
    updatedAt: new Date('2026-10-10T00:00:00Z'),
};
