import {
    AthenaAuthenticationType,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    DuckdbConnectionType,
    MissingWarehouseCredentialsError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import {
    composePersonalWarehouseCredentials,
    PERSONAL_CREDENTIAL_RECONNECT_MESSAGE,
    projectPersonalWarehouseCredentials,
} from './personalCredentialOverlay';

const project = (stored: object) =>
    projectPersonalWarehouseCredentials(
        stored as UserWarehouseCredentialsWithSecrets['credentials'],
    );
const maliciousExtras = {
    host: 'evil-host',
    port: 666,
    dbname: 'evil-db',
    httpPath: '/evil',
    catalog: 'evil-catalog',
    warehouse: 'evil-warehouse',
    role: 'evil-role',
    executionProject: 'evil-project',
    maximumBytesBilled: 999999,
    region: 'evil-region',
    workGroup: 'evil-group',
    assumeRoleArn: 'evil-arn',
    connectionType: 'embedded',
    sshTunnelHost: 'evil-bastion',
    sshTunnelPort: 666,
    useSshTunnel: false,
    requireUserCredentials: false,
};

describe('POSTGRES', () => {
    test('shape D: routing extras on a stored row cannot change host, port or SSH tunnel', () => {
        const connection = {
            type: WarehouseTypes.POSTGRES,
            host: 'connection-host',
            port: 5432,
            dbname: 'connection-db',
            schema: 'public',
            user: 'connection-user',
            password: 'connection-password',
            role: 'connection-role',
            sslcert: 'connection-cert',
            sslkey: 'connection-key',
            sslrootcert: 'connection-root',
            useSshTunnel: true,
            sshTunnelHost: 'connection-bastion',
            sshTunnelPort: 22,
            sshTunnelUser: 'tunnel-user',
            sshTunnelPrivateKey: 'tunnel-key',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.POSTGRES,
            user: 'personal-user',
            password: 'personal-password',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.POSTGRES,
            host: 'connection-host',
            port: 5432,
            dbname: 'connection-db',
            schema: 'public',
            user: 'personal-user',
            password: 'personal-password',
            role: 'connection-role',
            sslcert: 'connection-cert',
            sslkey: 'connection-key',
            sslrootcert: 'connection-root',
            useSshTunnel: true,
            sshTunnelHost: 'connection-bastion',
            sshTunnelPort: 22,
            sshTunnelUser: 'tunnel-user',
            sshTunnelPrivateKey: 'tunnel-key',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('REDSHIFT', () => {
    test('shape D: routing extras on a stored row cannot change host, port or SSH tunnel', () => {
        const connection = {
            type: WarehouseTypes.REDSHIFT,
            host: 'connection-host',
            port: 5439,
            dbname: 'connection-db',
            schema: 'public',
            user: 'connection-user',
            password: 'connection-password',
            authenticationType: 'iam',
            accessKeyId: 'connection-access',
            secretAccessKey: 'connection-secret',
            sessionToken: 'connection-session',
            assumeRoleArn: 'connection-arn',
            assumeRoleExternalId: 'connection-external',
            dbGroups: ['connection-group'],
            autoCreate: true,
            awsSsoStartUrl: 'connection-start',
            awsSsoRegion: 'connection-region',
            awsSsoAccountId: 'connection-account',
            awsSsoRoleName: 'connection-role',
            useSshTunnel: true,
            sshTunnelHost: 'connection-bastion',
            sshTunnelPort: 22,
            sshTunnelPrivateKey: 'tunnel-key',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.REDSHIFT,
            user: 'personal-user',
            authenticationType: 'iam',
            accessKeyId: 'personal-access',
            secretAccessKey: 'personal-secret',
            assumeRoleArn: 'personal-arn',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.REDSHIFT,
            host: 'connection-host',
            port: 5439,
            dbname: 'connection-db',
            schema: 'public',
            user: 'personal-user',
            authenticationType: 'iam',
            accessKeyId: 'personal-access',
            secretAccessKey: 'personal-secret',
            assumeRoleArn: 'personal-arn',
            dbGroups: ['connection-group'],
            autoCreate: true,
            awsSsoStartUrl: 'connection-start',
            awsSsoRegion: 'connection-region',
            awsSsoAccountId: 'connection-account',
            awsSsoRoleName: 'connection-role',
            useSshTunnel: true,
            sshTunnelHost: 'connection-bastion',
            sshTunnelPort: 22,
            sshTunnelPrivateKey: 'tunnel-key',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('SNOWFLAKE', () => {
    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'connection-account',
            database: 'connection-db',
            warehouse: 'connection-warehouse',
            schema: 'public',
            user: 'connection-user',
            password: 'connection-password',
            privateKey: 'connection-key',
            privateKeyPass: 'connection-pass',
            refreshToken: 'connection-refresh',
            token: 'connection-token',
            authenticationType: 'private_key',
            role: 'connection-role',
            queryTag: 'connection-tag',
            accessUrl: 'connection-url',
            organizationWarehouseCredentialsUuid: 'connection-org-credential',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.SNOWFLAKE,
            authenticationType: 'sso',
            refreshToken: 'personal-refresh',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.SNOWFLAKE,
            account: 'connection-account',
            database: 'connection-db',
            warehouse: 'connection-warehouse',
            schema: 'public',
            user: '',
            authenticationType: 'sso',
            refreshToken: 'personal-refresh',
            role: 'connection-role',
            queryTag: 'connection-tag',
            accessUrl: 'connection-url',
            organizationWarehouseCredentialsUuid: 'connection-org-credential',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('BIGQUERY', () => {
    test('legacy nested keyfile policy is dropped from reads and composed credentials', () => {
        const identity = {
            type: 'authorized_user',
            client_id: 'client',
            client_secret: 'secret',
            refresh_token: 'refresh',
        };
        const personal = project({
            type: WarehouseTypes.BIGQUERY,
            keyfileContents: {
                ...identity,
                quota_project_id: 'legacy-project',
            },
        });
        expect(personal).toMatchObject({ keyfileContents: identity });
        const composed = composePersonalWarehouseCredentials(
            {
                type: WarehouseTypes.BIGQUERY,
                project: 'connection-project',
                dataset: 'connection-dataset',
            } as CreateWarehouseCredentials,
            personal,
        );
        expect(composed).toMatchObject({ keyfileContents: identity });
        if (composed.type !== WarehouseTypes.BIGQUERY)
            throw new Error('Expected BigQuery');
        expect(Object.keys(composed.keyfileContents ?? {}).sort()).toEqual([
            'client_id',
            'client_secret',
            'refresh_token',
            'type',
        ]);
    });

    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.BIGQUERY,
            project: 'connection-project',
            dataset: 'connection-dataset',
            timeoutSeconds: 10,
            priority: 'batch',
            retries: 2,
            location: 'connection-location',
            maximumBytesBilled: 123,
            executionProject: 'connection-execution',
            authenticationType: 'adc',
            keyfileContents: { private_key: 'connection-key' },
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.BIGQUERY,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'personal-client',
                refresh_token: 'personal-refresh',
            },
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.BIGQUERY,
            project: 'connection-project',
            dataset: 'connection-dataset',
            timeoutSeconds: 10,
            priority: 'batch',
            retries: 2,
            location: 'connection-location',
            maximumBytesBilled: 123,
            executionProject: 'connection-execution',
            authenticationType: 'sso',
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'personal-client',
                refresh_token: 'personal-refresh',
            },
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('DATABRICKS', () => {
    test('shape C: Databricks PAT row without a mode runs as the PAT and never inherits the connection M2M client', () => {
        const connection = {
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'connection.cloud.databricks.com',
            httpPath: '/connection',
            database: 'connection-db',
            catalog: 'connection-catalog',
            authenticationType: 'oauth_m2m',
            oauthClientId: 'connection-client',
            oauthClientSecret: 'connection-secret',
            personalAccessToken: 'connection-pat',
            refreshToken: 'connection-refresh',
            token: 'connection-token',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.DATABRICKS,
            personalAccessToken: 'personal-pat',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.DATABRICKS,
            serverHostName: 'connection.cloud.databricks.com',
            httpPath: '/connection',
            database: 'connection-db',
            catalog: 'connection-catalog',
            authenticationType: 'personal_access_token',
            personalAccessToken: 'personal-pat',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('TRINO', () => {
    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.TRINO,
            host: 'connection-host',
            port: 8080,
            dbname: 'connection-db',
            schema: 'public',
            http_scheme: 'https',
            user: 'connection-user',
            password: 'connection-password',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.TRINO,
            user: 'personal-user',
            password: '',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.TRINO,
            host: 'connection-host',
            port: 8080,
            dbname: 'connection-db',
            schema: 'public',
            http_scheme: 'https',
            user: 'personal-user',
            password: '',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('CLICKHOUSE', () => {
    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.CLICKHOUSE,
            host: 'connection-host',
            port: 8443,
            schema: 'public',
            secure: true,
            user: 'connection-user',
            password: 'connection-password',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.CLICKHOUSE,
            user: 'personal-user',
            password: '',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.CLICKHOUSE,
            host: 'connection-host',
            port: 8443,
            schema: 'public',
            secure: true,
            user: 'personal-user',
            password: '',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('ATHENA', () => {
    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.ATHENA,
            region: 'connection-region',
            database: 'connection-db',
            schema: 'public',
            workGroup: 'connection-group',
            s3StagingDir: 's3://connection/staging',
            s3DataDir: 's3://connection/data',
            authenticationType: 'web_identity',
            accessKeyId: 'connection-access',
            secretAccessKey: 'connection-secret',
            sessionToken: 'connection-session',
            assumeRoleArn: 'connection-arn',
            assumeRoleExternalId: 'connection-external',
            webIdentityAudience: 'connection-audience',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'personal-access',
            secretAccessKey: 'personal-secret',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.ATHENA,
            region: 'connection-region',
            database: 'connection-db',
            schema: 'public',
            workGroup: 'connection-group',
            s3StagingDir: 's3://connection/staging',
            s3DataDir: 's3://connection/data',
            authenticationType: 'access_key',
            accessKeyId: 'personal-access',
            secretAccessKey: 'personal-secret',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

describe('DUCKDB', () => {
    test('composes only personal identity and preserves connection policy', () => {
        const connection = {
            type: WarehouseTypes.DUCKDB,
            connectionType: 'motherduck',
            database: 'connection-db',
            schema: 'public',
            token: 'connection-token',
            requireUserCredentials: true,
        } as CreateWarehouseCredentials;
        const stored = {
            ...maliciousExtras,
            type: WarehouseTypes.DUCKDB,
            token: 'personal-token',
        };
        const originalConnection = structuredClone(connection);
        const originalStored = structuredClone(stored);
        const personal = project(stored);
        const originalPersonal = structuredClone(personal);
        expect(
            composePersonalWarehouseCredentials(connection, personal),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            connectionType: 'motherduck',
            database: 'connection-db',
            schema: 'public',
            token: 'personal-token',
            requireUserCredentials: true,
        });
        expect(connection).toEqual(originalConnection);
        expect(stored).toEqual(originalStored);
        expect(personal).toEqual(originalPersonal);
    });
});

const databricksConnection: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    serverHostName: 'connection.cloud.databricks.com',
    httpPath: '/connection',
    database: 'connection-db',
    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
    oauthClientId: 'connection-client',
    oauthClientSecret: 'connection-secret',
};
test.each([
    [
        'shape A: Databricks OAuth row with empty host, httpPath and database is refused',
        { serverHostName: '', httpPath: '', database: '' },
    ],
    ['shape B: Databricks U2M row without a host is refused', {}],
    [
        'shape H: Databricks row bound to another host is refused',
        { serverHostName: 'other.cloud.databricks.com' },
    ],
])('%s', (_name, extra) => {
    const action = () =>
        composePersonalWarehouseCredentials(
            databricksConnection,
            project({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                refreshToken: 'personal-refresh',
                ...extra,
            }),
        );
    expect(action).toThrow(DatabricksTokenError);
    expect(action).toThrow(
        new DatabricksTokenError(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE),
    );
});
test.each(['oauth_m2m', 'oauth', 'unknown'])(
    'rejects Databricks mode %s before projection',
    (authenticationType) => {
        expect(() =>
            project({
                type: WarehouseTypes.DATABRICKS,
                authenticationType,
                personalAccessToken: 'pat',
                refreshToken: 'refresh',
            }),
        ).toThrow(
            new DatabricksTokenError(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE),
        );
    },
);
test('rejects an ambiguous Databricks row without a mode', () => {
    expect(() =>
        project({
            type: WarehouseTypes.DATABRICKS,
            personalAccessToken: 'pat',
            refreshToken: 'refresh',
        }),
    ).toThrow(new DatabricksTokenError(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE));
});
test('normalizes the Databricks host binding and inherits only the U2M app', () => {
    expect(
        composePersonalWarehouseCredentials(
            databricksConnection,
            project({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                refreshToken: 'personal-refresh',
                serverHostName: ' https://CONNECTION.cloud.databricks.com/ ',
                oauthClientId: '',
            }),
        ),
    ).toEqual({
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'connection.cloud.databricks.com',
        httpPath: '/connection',
        database: 'connection-db',
        authenticationType: 'oauth_u2m',
        refreshToken: 'personal-refresh',
        oauthClientId: 'connection-client',
        oauthClientSecret: 'connection-secret',
    });
});
test.each([
    DatabricksAuthenticationType.OAUTH_M2M,
    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
])('does not inherit the app from %s for U2M', (authenticationType) => {
    expect(
        composePersonalWarehouseCredentials(
            { ...databricksConnection, authenticationType },
            project({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                refreshToken: 'personal-refresh',
                serverHostName: 'connection.cloud.databricks.com',
            }),
        ),
    ).toEqual({
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'connection.cloud.databricks.com',
        httpPath: '/connection',
        database: 'connection-db',
        authenticationType: 'oauth_u2m',
        refreshToken: 'personal-refresh',
    });
});
test('does not inherit an app secret when the personal U2M app is explicit', () => {
    expect(
        composePersonalWarehouseCredentials(
            databricksConnection,
            project({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                refreshToken: 'personal-refresh',
                serverHostName: 'connection.cloud.databricks.com',
                oauthClientId: 'personal-client',
            }),
        ),
    ).toEqual({
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'connection.cloud.databricks.com',
        httpPath: '/connection',
        database: 'connection-db',
        authenticationType: 'oauth_u2m',
        refreshToken: 'personal-refresh',
        oauthClientId: 'personal-client',
    });
});
test('refuses a PAT explicitly bound to another host', () => {
    expect(() =>
        composePersonalWarehouseCredentials(
            databricksConnection,
            project({
                type: WarehouseTypes.DATABRICKS,
                personalAccessToken: 'pat',
                serverHostName: 'other.cloud.databricks.com',
            }),
        ),
    ).toThrow(new DatabricksTokenError(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE));
});
test.each(Object.values(AthenaAuthenticationType))(
    'shape E: Athena personal keys never inherit the connection role, session token or web identity (%s)',
    (authenticationType) => {
        expect(
            composePersonalWarehouseCredentials(
                {
                    type: WarehouseTypes.ATHENA,
                    region: 'region',
                    database: 'db',
                    schema: 'schema',
                    s3StagingDir: 's3://stage',
                    authenticationType,
                    sessionToken: 'connection-session',
                    assumeRoleArn: 'connection-arn',
                    assumeRoleExternalId: 'connection-external',
                    webIdentityAudience: 'connection-audience',
                },
                project({
                    type: WarehouseTypes.ATHENA,
                    accessKeyId: 'personal-access',
                    secretAccessKey: 'personal-secret',
                }),
            ),
        ).toEqual({
            type: WarehouseTypes.ATHENA,
            region: 'region',
            database: 'db',
            schema: 'schema',
            s3StagingDir: 's3://stage',
            authenticationType: 'access_key',
            accessKeyId: 'personal-access',
            secretAccessKey: 'personal-secret',
        });
    },
);
test('stored Athena row with a session token is refused with the reconnect error', () => {
    const action = () =>
        project({
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'access',
            secretAccessKey: 'secret',
            sessionToken: 'temporary-session',
        });
    expect(action).toThrow(MissingWarehouseCredentialsError);
    expect(action).toThrow(
        new MissingWarehouseCredentialsError(
            PERSONAL_CREDENTIAL_RECONNECT_MESSAGE,
        ),
    );
});
test('stored Redshift IAM row with only a role is refused with the reconnect error', () => {
    const action = () =>
        project({
            type: WarehouseTypes.REDSHIFT,
            authenticationType: 'iam',
            assumeRoleArn: 'personal-arn',
        });
    expect(action).toThrow(MissingWarehouseCredentialsError);
    expect(action).toThrow(
        new MissingWarehouseCredentialsError(
            PERSONAL_CREDENTIAL_RECONNECT_MESSAGE,
        ),
    );
});
test('rejects a warehouse type mismatch', () => {
    expect(() =>
        composePersonalWarehouseCredentials(
            databricksConnection,
            project({
                type: WarehouseTypes.POSTGRES,
                user: 'user',
                password: '',
            }),
        ),
    ).toThrow(DatabricksTokenError);
});
test.each([
    {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.EMBEDDED,
        dataset: 'dataset',
    },
    {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.ANALYTICS,
        database: 'memory',
        schema: 'main',
    },
    {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.DUCKLAKE,
        catalog: { type: 'sqlite', path: '/catalog' },
        dataPath: { type: 'local', path: '/data' },
        schema: 'main',
    },
])('rejects a non-MotherDuck connection ($connectionType)', (connection) => {
    expect(() =>
        composePersonalWarehouseCredentials(
            connection as CreateWarehouseCredentials,
            project({ type: WarehouseTypes.DUCKDB, token: 'token' }),
        ),
    ).toThrow(
        new MissingWarehouseCredentialsError(
            PERSONAL_CREDENTIAL_RECONNECT_MESSAGE,
        ),
    );
});
test.each([
    { type: WarehouseTypes.SNOWFLAKE, user: 'person', password: 'password' },
    { type: WarehouseTypes.REDSHIFT, user: 'person', password: 'password' },
])('derives the missing password mode for $type', (stored) => {
    expect(project(stored)).toEqual({
        ...stored,
        authenticationType: 'password',
    });
});
test('drops empty optional identity fields but preserves an empty required password', () => {
    expect(
        project({
            type: WarehouseTypes.DATABRICKS,
            personalAccessToken: 'pat',
            refreshToken: '',
            serverHostName: '',
        }),
    ).toEqual({
        type: WarehouseTypes.DATABRICKS,
        authenticationType: 'personal_access_token',
        personalAccessToken: 'pat',
    });
    expect(
        project({
            type: WarehouseTypes.POSTGRES,
            user: 'person',
            password: '',
        }),
    ).toEqual({ type: WarehouseTypes.POSTGRES, user: 'person', password: '' });
});

test('inherits the U2M app when the parsed personal row has an undefined client ID', () => {
    const personal = {
        type: WarehouseTypes.DATABRICKS,
        authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
        refreshToken: 'personal-refresh',
        serverHostName: 'connection.cloud.databricks.com',
        oauthClientId: undefined,
    } as const;
    expect(
        composePersonalWarehouseCredentials(databricksConnection, personal),
    ).toEqual({
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'connection.cloud.databricks.com',
        httpPath: '/connection',
        database: 'connection-db',
        authenticationType: 'oauth_u2m',
        refreshToken: 'personal-refresh',
        oauthClientId: 'connection-client',
        oauthClientSecret: 'connection-secret',
    });
});

test.each(Object.values(WarehouseTypes))(
    'missing stored identity for %s uses the reconnect error',
    (type) => {
        const ErrorClass =
            type === WarehouseTypes.DATABRICKS
                ? DatabricksTokenError
                : MissingWarehouseCredentialsError;
        expect(() => project({ type })).toThrow(ErrorClass);
        expect(() => project({ type })).toThrow(
            new ErrorClass(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE),
        );
    },
);

test('preserves connection-owned BigQuery SSH transport supplied alongside its credential type', () => {
    const connection: CreateWarehouseCredentials & {
        useSshTunnel: boolean;
        sshTunnelHost: string;
        sshTunnelPrivateKey: string;
    } = {
        type: WarehouseTypes.BIGQUERY,
        project: 'connection-project',
        dataset: 'connection-dataset',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: { private_key: 'connection-key' },
        useSshTunnel: true,
        sshTunnelHost: 'connection-bastion',
        sshTunnelPrivateKey: 'connection-tunnel-key',
    };
    expect(
        composePersonalWarehouseCredentials(
            connection,
            project({
                type: WarehouseTypes.BIGQUERY,
                keyfileContents: {
                    type: 'authorized_user',
                    client_id: 'personal-client',
                    refresh_token: 'personal-refresh',
                },
                useSshTunnel: false,
                sshTunnelHost: 'evil-bastion',
            }),
        ),
    ).toEqual({
        type: WarehouseTypes.BIGQUERY,
        project: 'connection-project',
        dataset: 'connection-dataset',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        authenticationType: 'sso',
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'personal-client',
            refresh_token: 'personal-refresh',
        },
        useSshTunnel: true,
        sshTunnelHost: 'connection-bastion',
        sshTunnelPrivateKey: 'connection-tunnel-key',
    });
});
