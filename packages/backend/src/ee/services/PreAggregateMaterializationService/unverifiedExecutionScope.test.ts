import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreateDuckdbDucklakeCredentials,
    type CreateDucklakeDataPath,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { deriveUnverifiedExecutionScope } from './unverifiedExecutionScope';

const databricks: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'schema',
    serverHostName: 'warehouse.example.com',
    httpPath: '/sql/1',
    personalAccessToken: 'private-test-token',
};

const bigquery: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project',
    dataset: 'dataset',
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'application',
        client_secret: 'private-client-secret',
        refresh_token: 'private-refresh-token',
    },
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
};

const args = {
    actorId: 'actor-1',
    credentialSourceId: 'user-credential-1',
    secret: 'server-only-test-secret',
};

describe('deriveUnverifiedExecutionScope', () => {
    test('proves only an exact actor, credential source, and resolved credential snapshot', () => {
        const input = { ...args, warehouseCredentials: databricks };
        const baseline = deriveUnverifiedExecutionScope(input);
        expect(baseline).toEqual({
            status: 'proven',
            hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(deriveUnverifiedExecutionScope(input)).toEqual(baseline);
        for (const changed of [
            { ...input, actorId: 'actor-2' },
            { ...input, credentialSourceId: 'user-credential-2' },
            { ...input, secret: 'rotated-server-secret' },
            {
                ...input,
                warehouseCredentials: {
                    ...databricks,
                    personalAccessToken: 'different-principal-token',
                },
            },
            {
                ...input,
                warehouseCredentials: {
                    ...databricks,
                    httpPath: '/sql/2',
                },
            },
        ]) {
            expect(deriveUnverifiedExecutionScope(changed)).not.toEqual(
                baseline,
            );
        }
        expect(JSON.stringify(baseline)).not.toContain('private-test-token');
        expect(JSON.stringify(baseline)).not.toContain(args.secret);
        expect(JSON.stringify(baseline)).not.toContain(args.actorId);
    });

    test.each<CreateWarehouseCredentials>([
        bigquery,
        {
            ...databricks,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            personalAccessToken: undefined,
            token: 'actual-oauth-access-token',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'database',
            schema: 'schema',
            token: 'motherduck-token',
        },
        {
            type: WarehouseTypes.ATHENA,
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            region: 'us-east-1',
            database: 'database',
            schema: 'schema',
            s3StagingDir: 's3://results',
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
            sessionToken: 'session-token',
        },
        {
            type: WarehouseTypes.REDSHIFT,
            authenticationType: RedshiftAuthenticationType.IAM,
            host: 'redshift.example.com',
            port: 5439,
            dbname: 'database',
            schema: 'schema',
            user: 'user',
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
        },
    ])(
        'binds explicit active authentication for $type',
        (warehouseCredentials) => {
            expect(
                deriveUnverifiedExecutionScope({
                    ...args,
                    warehouseCredentials,
                }),
            ).toEqual({ status: 'proven', hash: expect.any(String) });
        },
    );

    test.each<CreateWarehouseCredentials>([
        { ...bigquery, authenticationType: BigqueryAuthenticationType.ADC },
        { ...bigquery, keyfileContents: { type: 'authorized_user' } },
        {
            ...databricks,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            token: undefined,
            // A stale PAT cannot prove the active OAuth identity.
        },
        {
            type: WarehouseTypes.ATHENA,
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
            region: 'us-east-1',
            database: 'database',
            schema: 'schema',
            s3StagingDir: 's3://results',
            // Athena ignores these for IAM_ROLE.
            accessKeyId: 'stale-access-key',
            secretAccessKey: 'stale-secret',
        },
        {
            type: WarehouseTypes.REDSHIFT,
            authenticationType: RedshiftAuthenticationType.IAM,
            host: 'redshift.example.com',
            port: 5439,
            dbname: 'database',
            schema: 'schema',
            user: 'user',
            password: 'unused-password',
        },
        {
            ...databricks,
            authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
            oauthClientId: 'known-principal',
            token: 'rotating-token',
        },
    ])(
        'fails closed for ambient, missing, inactive, or already verified auth $type',
        (warehouseCredentials) => {
            expect(
                deriveUnverifiedExecutionScope({
                    ...args,
                    warehouseCredentials,
                }),
            ).toEqual({ status: 'unavailable' });
        },
    );

    test('canonicalizes key order and requires server key and selected actor/source', () => {
        const input = { ...args, warehouseCredentials: bigquery };
        expect(
            deriveUnverifiedExecutionScope({
                ...input,
                warehouseCredentials: {
                    ...bigquery,
                    keyfileContents: Object.fromEntries(
                        Object.entries(bigquery.keyfileContents).reverse(),
                    ),
                },
            }),
        ).toEqual(deriveUnverifiedExecutionScope(input));
        for (const missing of [
            { ...input, secret: '' },
            { ...input, actorId: '' },
            { ...input, credentialSourceId: '' },
        ]) {
            expect(deriveUnverifiedExecutionScope(missing)).toEqual({
                status: 'unavailable',
            });
        }
    });

    test('OAuth access-token rotation preserves the same active refresh grant', () => {
        const oauth: CreateDatabricksCredentials = {
            ...databricks,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            oauthClientId: 'application',
            refreshToken: 'same-user-refresh-grant',
            token: 'access-token-1',
        };
        const baseline = deriveUnverifiedExecutionScope({
            ...args,
            warehouseCredentials: oauth,
        });
        expect(baseline.status).toBe('proven');
        expect(
            deriveUnverifiedExecutionScope({
                ...args,
                warehouseCredentials: {
                    ...oauth,
                    token: 'access-token-2',
                    personalAccessToken: 'different-unused-pat',
                },
            }),
        ).toEqual(baseline);
        expect(
            deriveUnverifiedExecutionScope({
                ...args,
                warehouseCredentials: {
                    ...oauth,
                    refreshToken: 'unproven-different-refresh-grant',
                },
            }),
        ).not.toEqual(baseline);
        expect(
            deriveUnverifiedExecutionScope({
                ...args,
                warehouseCredentials: {
                    ...bigquery,
                    keyfileContents: {
                        ...bigquery.keyfileContents,
                        access_token: 'rotated-google-access-token',
                    },
                },
            }),
        ).toEqual(
            deriveUnverifiedExecutionScope({
                ...args,
                warehouseCredentials: bigquery,
            }),
        );
    });
});

describe('generation-local Snowflake and DuckLake execution scope', () => {
    const scopeArgs = {
        actorId: 'actor-1',
        credentialSourceId: 'project-1',
        secret: 'test-server-key',
    };
    const snowflake: CreateSnowflakeCredentials = {
        type: WarehouseTypes.SNOWFLAKE,
        authenticationType: SnowflakeAuthenticationType.SSO,
        account: 'account',
        user: 'ignored-username',
        database: 'analytics',
        schema: 'public',
        warehouse: 'SMALL',
        token: 'access-token-one',
        refreshToken: 'refresh-grant-one',
    };
    test('pins the active SSO grant and permits its access token rotation', () => {
        const original = deriveUnverifiedExecutionScope({
            ...scopeArgs,
            warehouseCredentials: snowflake,
        });
        expect(original).toEqual({
            status: 'proven',
            hash: expect.any(String),
        });
        expect(
            deriveUnverifiedExecutionScope({
                ...scopeArgs,
                warehouseCredentials: {
                    ...snowflake,
                    token: 'rotated-access-token',
                },
            }),
        ).toEqual(original);
        expect(
            deriveUnverifiedExecutionScope({
                ...scopeArgs,
                warehouseCredentials: {
                    ...snowflake,
                    refreshToken: 'different-grant',
                },
            }),
        ).not.toEqual(original);
        expect(
            deriveUnverifiedExecutionScope({
                ...scopeArgs,
                warehouseCredentials: {
                    ...snowflake,
                    token: undefined,
                    refreshToken: undefined,
                },
            }),
        ).toEqual({ status: 'unavailable' });
    });

    const ducklake: CreateDuckdbDucklakeCredentials = {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.DUCKLAKE,
        schema: 'main',
        catalog: {
            type: DucklakeCatalogType.POSTGRES,
            host: 'catalog.example.test',
            port: 5432,
            database: 'catalog',
            user: 'materializer',
            password: 'test-password',
        },
        dataPath: { type: DucklakeDataPathType.LOCAL, path: '/test/data' },
    };
    test.each<CreateDucklakeDataPath>([
        { type: DucklakeDataPathType.LOCAL, path: '/test/data' },
        {
            type: DucklakeDataPathType.S3,
            url: 's3://test/data',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
        },
        {
            type: DucklakeDataPathType.GCS,
            url: 'gs://test/data',
            hmacKeyId: 'test-key',
            hmacSecret: 'test-secret',
        },
        {
            type: DucklakeDataPathType.AZURE,
            url: 'az://test/data',
            connectionString: 'test-explicit-connection',
        },
        {
            type: DucklakeDataPathType.AZURE,
            url: 'az://test/data',
            accountName: 'test-account',
            accountKey: 'test-account-key',
        },
    ])(
        'pins explicit DuckLake $type data credentials and the complete catalog',
        (dataPath) => {
            const original = deriveUnverifiedExecutionScope({
                ...scopeArgs,
                warehouseCredentials: { ...ducklake, dataPath },
            });
            expect(original).toEqual({
                status: 'proven',
                hash: expect.any(String),
            });
            expect(
                deriveUnverifiedExecutionScope({
                    ...scopeArgs,
                    warehouseCredentials: {
                        ...ducklake,
                        dataPath,
                        schema: 'different-schema',
                    },
                }),
            ).not.toEqual(original);
            expect(
                deriveUnverifiedExecutionScope({
                    ...scopeArgs,
                    warehouseCredentials: {
                        ...ducklake,
                        dataPath,
                        catalog: {
                            type: DucklakeCatalogType.SQLITE,
                            path: '/different/catalog.sqlite',
                        },
                    },
                }),
            ).not.toEqual(original);
        },
    );
    test.each<CreateDucklakeDataPath>([
        { type: DucklakeDataPathType.S3, url: 's3://test/data' },
        {
            type: DucklakeDataPathType.S3,
            url: 's3://test/data',
            accessKeyId: 'incomplete-key',
        },
        { type: DucklakeDataPathType.GCS, url: 'gs://test/data' },
        {
            type: DucklakeDataPathType.AZURE,
            url: 'az://test/data',
            accountName: 'ambient-account-name',
        },
    ])(
        'does not invent proof for ambient or unused DuckLake $type credentials',
        (dataPath) => {
            expect(
                deriveUnverifiedExecutionScope({
                    ...scopeArgs,
                    warehouseCredentials: { ...ducklake, dataPath },
                }),
            ).toEqual({ status: 'unavailable' });
        },
    );
});
