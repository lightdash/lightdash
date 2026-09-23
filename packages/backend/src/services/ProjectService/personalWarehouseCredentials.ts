import {
    assertUnreachable,
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';

// Extra security measure, we remove the "secrets" from the project/org credentials
// and let the user override that token/password later on
function clearSecretsFromCredentials(
    credentials: CreateWarehouseCredentials,
): CreateWarehouseCredentials {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE: {
            // Every secret has to go: the user's own credential is merged
            // over this, so anything left here is inherited by whichever
            // field the user didn't supply (e.g. their key decrypted with
            // the project's passphrase). authenticationType goes too —
            // credentials stored before it was persisted would otherwise
            // inherit the project's mode and authenticate as SSO with no
            // refresh token. Absent, the client falls back to password.
            const {
                refreshToken,
                token,
                password,
                privateKey,
                privateKeyPass,
                authenticationType,
                ...rest
            } = credentials;
            return rest;
        }
        case WarehouseTypes.DATABRICKS: {
            const { refreshToken, token, personalAccessToken, ...rest } =
                credentials;
            return rest;
        }
        case WarehouseTypes.BIGQUERY: {
            return {
                ...credentials,
                keyfileContents: {},
            };
        }
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE: {
            return {
                ...credentials,
                password: '',
            };
        }
        case WarehouseTypes.REDSHIFT: {
            const { authenticationType, ...rest } = credentials;
            return {
                ...rest,
                user: '',
                password: '',
                accessKeyId: '',
                secretAccessKey: '',
                sessionToken: '',
                assumeRoleArn: '',
                assumeRoleExternalId: '',
            };
        }
        case WarehouseTypes.ATHENA: {
            return {
                ...credentials,
                accessKeyId: '',
                secretAccessKey: '',
            };
        }
        case WarehouseTypes.DUCKDB: {
            if (credentials.connectionType === DuckdbConnectionType.ANALYTICS) {
                return credentials;
            }
            if (
                credentials.connectionType === DuckdbConnectionType.MOTHERDUCK
            ) {
                return {
                    ...credentials,
                    token: '',
                };
            }
            if (credentials.connectionType === DuckdbConnectionType.EMBEDDED) {
                const clearedCredentials = {
                    ...credentials,
                } as typeof credentials & { dataDirectory?: string };
                delete clearedCredentials.dataDirectory;
                return clearedCredentials;
            }
            const { catalog, dataPath } = credentials;
            const clearedCatalog =
                catalog.type === 'postgres'
                    ? { ...catalog, user: '', password: '' }
                    : catalog;
            let clearedDataPath: typeof dataPath = dataPath;
            if (dataPath.type === 's3') {
                clearedDataPath = {
                    ...dataPath,
                    accessKeyId: '',
                    secretAccessKey: '',
                };
            } else if (dataPath.type === 'gcs') {
                clearedDataPath = {
                    ...dataPath,
                    hmacKeyId: '',
                    hmacSecret: '',
                };
            } else if (dataPath.type === 'azure') {
                clearedDataPath = {
                    ...dataPath,
                    connectionString: '',
                    accountKey: '',
                };
            }
            return {
                ...credentials,
                catalog: clearedCatalog,
                dataPath: clearedDataPath,
            };
        }

        default:
            return assertUnreachable(credentials, `Unexpected warehouse type`);
    }
}

export function mergePersonalWarehouseCredentials(
    projectCredentials: CreateWarehouseCredentials,
    userWarehouseCredentials: Pick<
        UserWarehouseCredentialsWithSecrets,
        'credentials'
    >,
): CreateWarehouseCredentials {
    let credentials = projectCredentials;
    credentials = clearSecretsFromCredentials(credentials);

    // User has credentials - use them
    credentials = {
        ...credentials,
        ...userWarehouseCredentials.credentials,
        requireUserCredentials:
            credentials.requireUserCredentials ||
            ('requireUserCredentials' in userWarehouseCredentials.credentials &&
                userWarehouseCredentials.credentials.requireUserCredentials),
    } as CreateWarehouseCredentials; // force type as typescript doesn't know the types match
    return credentials;
}
