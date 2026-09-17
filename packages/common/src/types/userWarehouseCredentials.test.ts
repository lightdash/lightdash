import {
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from './projects';
import {
    bigquerySsoUserCredentialsSchema,
    mergeUserWarehouseCredentials,
    snowflakeUserCredentialsSchema,
} from './userWarehouseCredentials';

describe('snowflakeUserCredentialsSchema', () => {
    it.each([
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'password',
            password: 'password',
        },
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'private_key',
            privateKey: 'private-key',
        },
        {
            type: 'snowflake',
            authenticationType: 'sso',
            refreshToken: 'refresh-token',
        },
    ])('accepts supported credentials: $authenticationType', (credentials) => {
        expect(
            snowflakeUserCredentialsSchema.safeParse(credentials).success,
        ).toBe(true);
    });

    it.each([
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'password',
            password: '',
        },
        {
            type: 'snowflake',
            user: 'snowflake-user',
            authenticationType: 'private_key',
            privateKey: '',
        },
        {
            type: 'snowflake',
            authenticationType: 'sso',
            refreshToken: '',
        },
    ])('rejects empty secrets: $authenticationType', (credentials) => {
        expect(
            snowflakeUserCredentialsSchema.safeParse(credentials).success,
        ).toBe(false);
    });
});

describe('bigquerySsoUserCredentialsSchema', () => {
    it('rejects an empty keyfile (the reported bug value)', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            keyfileContents: {},
        });
        expect(result.success).toBe(false);
    });

    it('rejects a keyfile with a blank refresh_token', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client-id',
                client_secret: 'client-secret',
                refresh_token: '',
            },
        });
        expect(result.success).toBe(false);
    });

    it('accepts a keyfile with a valid refresh_token', () => {
        const result = bigquerySsoUserCredentialsSchema.safeParse({
            type: 'bigquery',
            authenticationType: 'sso',
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client-id',
                client_secret: 'client-secret',
                refresh_token: 'a-real-refresh-token',
            },
        });
        expect(result.success).toBe(true);
    });
});

describe('mergeUserWarehouseCredentials', () => {
    const cases: Array<{
        name: string;
        connection: CreateWarehouseCredentials;
        userCredentials: Parameters<typeof mergeUserWarehouseCredentials>[1];
        expectedAuthentication: object;
        expectedConnectionFields: object;
    }> = [
        {
            name: 'Athena',
            connection: {
                type: WarehouseTypes.ATHENA,
                region: 'eu-west-1',
                database: 'analytics',
                schema: 'reporting',
                s3StagingDir: 's3://connection-staging',
            },
            userCredentials: {
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'user-access-key',
                secretAccessKey: 'user-secret',
                sessionToken: 'user-session',
                assumeRoleArn: 'user-role',
                assumeRoleExternalId: 'user-external-id',
                region: 'us-east-1',
            } as never,
            expectedAuthentication: {
                accessKeyId: 'user-access-key',
                secretAccessKey: 'user-secret',
                sessionToken: 'user-session',
                assumeRoleArn: 'user-role',
                assumeRoleExternalId: 'user-external-id',
            },
            expectedConnectionFields: { region: 'eu-west-1' },
        },
        {
            name: 'Postgres',
            connection: {
                type: WarehouseTypes.POSTGRES,
                host: 'connection-host',
                port: 5432,
                dbname: 'analytics',
                schema: 'public',
                user: 'connection-user',
                password: 'connection-password',
            },
            userCredentials: {
                type: WarehouseTypes.POSTGRES,
                user: 'personal-user',
                password: 'personal-password',
                host: 'personal-host',
            } as never,
            expectedAuthentication: {
                user: 'personal-user',
                password: 'personal-password',
            },
            expectedConnectionFields: { host: 'connection-host', port: 5432 },
        },
        {
            name: 'Redshift',
            connection: {
                type: WarehouseTypes.REDSHIFT,
                host: 'connection-host',
                port: 5439,
                dbname: 'analytics',
                schema: 'public',
                user: 'connection-user',
                password: 'connection-password',
                region: 'eu-west-1',
            },
            userCredentials: {
                type: WarehouseTypes.REDSHIFT,
                user: 'personal-user',
                password: 'personal-password',
                region: 'us-east-1',
            } as never,
            expectedAuthentication: {
                user: 'personal-user',
                password: 'personal-password',
            },
            expectedConnectionFields: { region: 'eu-west-1' },
        },
        {
            name: 'Snowflake',
            connection: {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'connection-account',
                user: 'connection-user',
                password: 'connection-password',
                database: 'analytics',
                warehouse: 'compute',
                schema: 'public',
            },
            userCredentials: {
                type: WarehouseTypes.SNOWFLAKE,
                user: 'personal-user',
                password: 'personal-password',
                database: 'personal-database',
            } as never,
            expectedAuthentication: {
                user: 'personal-user',
                password: 'personal-password',
            },
            expectedConnectionFields: {
                database: 'analytics',
                warehouse: 'compute',
            },
        },
        {
            name: 'BigQuery',
            connection: {
                type: WarehouseTypes.BIGQUERY,
                project: 'connection-project',
                dataset: 'connection-dataset',
                keyfileContents: { private_key: 'connection-key' },
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                location: 'EU',
                maximumBytesBilled: undefined,
            },
            userCredentials: {
                type: WarehouseTypes.BIGQUERY,
                keyfileContents: { refresh_token: 'personal-refresh-token' },
                dataset: 'personal-dataset',
            } as never,
            expectedAuthentication: {
                keyfileContents: {
                    refresh_token: 'personal-refresh-token',
                },
            },
            expectedConnectionFields: {
                project: 'connection-project',
                dataset: 'connection-dataset',
                location: 'EU',
            },
        },
        {
            name: 'Databricks',
            connection: {
                type: WarehouseTypes.DATABRICKS,
                database: 'connection-catalog',
                serverHostName: 'connection-host',
                httpPath: 'connection-path',
                personalAccessToken: 'connection-token',
            },
            userCredentials: {
                type: WarehouseTypes.DATABRICKS,
                personalAccessToken: 'personal-token',
                serverHostName: 'personal-host',
            } as never,
            expectedAuthentication: { personalAccessToken: 'personal-token' },
            expectedConnectionFields: {
                database: 'connection-catalog',
                serverHostName: 'connection-host',
                httpPath: 'connection-path',
            },
        },
        {
            name: 'Trino',
            connection: {
                type: WarehouseTypes.TRINO,
                host: 'connection-host',
                port: 8080,
                dbname: 'analytics',
                schema: 'public',
                http_scheme: 'https',
                user: 'connection-user',
                password: 'connection-password',
            },
            userCredentials: {
                type: WarehouseTypes.TRINO,
                user: 'personal-user',
                password: 'personal-password',
                host: 'personal-host',
            } as never,
            expectedAuthentication: {
                user: 'personal-user',
                password: 'personal-password',
            },
            expectedConnectionFields: { host: 'connection-host', port: 8080 },
        },
        {
            name: 'ClickHouse',
            connection: {
                type: WarehouseTypes.CLICKHOUSE,
                host: 'connection-host',
                port: 8443,
                schema: 'analytics',
                user: 'connection-user',
                password: 'connection-password',
            },
            userCredentials: {
                type: WarehouseTypes.CLICKHOUSE,
                user: 'personal-user',
                password: 'personal-password',
                host: 'personal-host',
            } as never,
            expectedAuthentication: {
                user: 'personal-user',
                password: 'personal-password',
            },
            expectedConnectionFields: { host: 'connection-host', port: 8443 },
        },
        {
            name: 'DuckDB',
            connection: {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'connection-database',
                schema: 'main',
                token: 'connection-token',
            },
            userCredentials: {
                type: WarehouseTypes.DUCKDB,
                token: 'personal-token',
                database: 'personal-database',
            } as never,
            expectedAuthentication: { token: 'personal-token' },
            expectedConnectionFields: { database: 'connection-database' },
        },
    ];

    it.each(cases)(
        'overrides only $name authentication fields',
        ({
            connection,
            userCredentials,
            expectedAuthentication,
            expectedConnectionFields,
        }) => {
            const result = mergeUserWarehouseCredentials(
                connection,
                userCredentials,
            );
            expect(result).toMatchObject(expectedAuthentication);
            expect(result).toMatchObject(expectedConnectionFields);
        },
    );
});
