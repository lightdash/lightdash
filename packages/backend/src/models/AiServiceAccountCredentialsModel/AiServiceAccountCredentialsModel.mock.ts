import {
    AthenaAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
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
    message: 'AI service account connection checked.',
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
    message: 'AI service account connection checked.',
    checkedAt: new Date('2026-10-10T00:00:00Z'),
};
