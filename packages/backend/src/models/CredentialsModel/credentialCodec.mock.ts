import { WarehouseTypes } from '@lightdash/common';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { type CredentialCodecKey } from './credentialCodec';

export const createEncryptionUtil = (
    active = 'active-test-key',
    fallbacks: string[] = [],
) =>
    new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: active,
            lightdashSecrets: {
                active,
                fallbacks,
                all: [active, ...fallbacks],
            },
        },
    });

export const codecCases: Array<
    CredentialCodecKey & {
        identity: Record<string, unknown>;
        secrets: Record<string, unknown>;
    }
> = [
    ...[
        ['password', { password: 'secret-password' }],
        [
            'private_key',
            {
                privateKey: 'secret-private-key',
                privateKeyPass: 'secret-passphrase',
            },
        ],
        ['sso', { token: 'secret-access-token' }],
        ['external_browser', {}],
        ['oauth_authorization_code', { token: 'secret-access-token' }],
        ['none', {}],
    ].map(([authMode, secrets]) => ({
        purpose: 'shared_login' as const,
        warehouseType: WarehouseTypes.SNOWFLAKE,
        authMode: authMode as string,
        identity: { user: 'alice', role: 'analyst' },
        secrets: secrets as Record<string, unknown>,
    })),
    {
        purpose: 'agent_sign_in',
        warehouseType: WarehouseTypes.SNOWFLAKE,
        authMode: 'sso',
        identity: { user: 'agent' },
        secrets: { token: 'secret-agent-token' },
    },
    {
        purpose: 'ai_service_account',
        warehouseType: WarehouseTypes.BIGQUERY,
        authMode: 'private_key',
        identity: {
            type: 'service_account',
            client_email: 'agent@example.com',
        },
        secrets: { private_key: 'secret-google-key' },
    },
    {
        purpose: 'personal_sign_in',
        warehouseType: WarehouseTypes.BIGQUERY,
        authMode: 'sso',
        identity: { client_id: 'google-client' },
        secrets: { token: 'secret-google-access-token' },
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.BIGQUERY,
        authMode: 'adc',
        identity: {},
        secrets: {},
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.DATABRICKS,
        authMode: 'personal_access_token',
        identity: {},
        secrets: { personalAccessToken: 'secret-pat' },
    },
    {
        purpose: 'ai_service_account',
        warehouseType: WarehouseTypes.DATABRICKS,
        authMode: 'oauth_m2m',
        identity: { oauthClientId: 'principal' },
        secrets: { oauthClientSecret: 'secret-client' },
    },
    {
        purpose: 'personal_sign_in',
        warehouseType: WarehouseTypes.DATABRICKS,
        authMode: 'oauth_u2m',
        identity: {},
        secrets: { token: 'secret-databricks-token' },
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.POSTGRES,
        authMode: 'password',
        identity: { user: 'alice' },
        secrets: {
            password: 'secret-pg',
            sslcert: 'secret-cert',
            sslkey: 'secret-ssl-key',
            sslrootcert: 'secret-root-cert',
        },
    },
    ...[
        WarehouseTypes.REDSHIFT,
        WarehouseTypes.TRINO,
        WarehouseTypes.CLICKHOUSE,
    ].map((warehouseType) => ({
        purpose: 'shared_login' as const,
        warehouseType,
        authMode: 'password',
        identity: { user: 'alice' },
        secrets: { password: 'secret-db' },
    })),
    ...['iam', 'iam_browser'].map((authMode) => ({
        purpose: 'shared_login' as const,
        warehouseType: WarehouseTypes.REDSHIFT,
        authMode,
        identity: { user: 'alice', assumeRoleArn: 'arn:role' },
        secrets: {
            accessKeyId: 'secret-key-id',
            secretAccessKey: 'secret-aws',
            sessionToken: 'secret-session',
            assumeRoleExternalId: 'secret-external',
        },
    })),
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.ATHENA,
        authMode: 'access_key',
        identity: {},
        secrets: {
            accessKeyId: 'secret-aws-id',
            secretAccessKey: 'secret-aws-key',
        },
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.ATHENA,
        authMode: 'iam_role',
        identity: { assumeRoleArn: 'arn:role' },
        secrets: { assumeRoleExternalId: 'secret-external' },
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.ATHENA,
        authMode: 'web_identity',
        identity: {
            assumeRoleArn: 'arn:role',
            webIdentityAudience: 'audience',
        },
        secrets: {},
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.DUCKDB,
        authMode: 'token',
        identity: {},
        secrets: { token: 'secret-motherduck' },
    },
    {
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.DUCKDB,
        authMode: 'ducklake',
        identity: {
            catalog: { user: 'alice' },
            dataPath: { accountName: 'azure' },
        },
        secrets: {
            catalog: { password: 'secret-catalog' },
            dataPath: {
                accessKeyId: 'secret-s3-id',
                secretAccessKey: 'secret-s3',
                hmacKeyId: 'secret-gcs-id',
                hmacSecret: 'secret-gcs',
                connectionString: 'secret-azure-connection',
                accountKey: 'secret-azure-key',
            },
        },
    },
    ...['embedded', 'analytics'].map((authMode) => ({
        purpose: 'shared_login' as const,
        warehouseType: WarehouseTypes.DUCKDB,
        authMode,
        identity: {},
        secrets: {},
    })),
    {
        purpose: 'agent_oauth_client',
        warehouseType: WarehouseTypes.SNOWFLAKE,
        authMode: 'oauth',
        identity: { clientId: 'client' },
        secrets: { clientSecret: 'secret-agent-client' },
    },
    {
        purpose: 'ssh_key_pair',
        warehouseType: null,
        authMode: 'key_pair',
        identity: { publicKey: 'public-key' },
        secrets: { privateKey: 'secret-ssh' },
    },
    ...['oauth', 'personal_access_token'].map((authMode) => ({
        purpose: 'git_user' as const,
        warehouseType: null,
        authMode,
        identity: { providerLogin: 'alice', providerUserId: '123' },
        secrets: { token: 'secret-git' },
    })),
    ...['github', 'gitlab'].map((authMode) => ({
        purpose: 'git_installation' as const,
        warehouseType: null,
        authMode,
        identity: {},
        secrets: {
            installationId: 'secret-installation',
            token: 'secret-installation-token',
        },
    })),
    {
        purpose: 'dbt_cloud',
        warehouseType: null,
        authMode: 'api_key',
        identity: {},
        secrets: {
            api_key: 'secret-dbt',
            webhook_hmac_secret: 'secret-webhook',
        },
    },
    {
        purpose: 'dbt_git',
        warehouseType: null,
        authMode: 'personal_access_token',
        identity: { username: 'alice' },
        secrets: { personal_access_token: 'secret-dbt-git' },
    },
    {
        purpose: 'dbt_git',
        warehouseType: null,
        authMode: 'installation_id',
        identity: {},
        secrets: { installation_id: 'secret-dbt-install' },
    },
    {
        purpose: 'dbt_environment',
        warehouseType: null,
        authMode: 'environment',
        identity: {},
        secrets: { environment: [{ key: 'DB_PASSWORD', value: 'secret-env' }] },
    },
    {
        purpose: 'external_source',
        warehouseType: null,
        authMode: 'oauth',
        identity: {},
        secrets: { token: 'secret-external-source' },
    },
];
