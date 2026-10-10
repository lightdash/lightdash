import {
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    DuckdbConnectionType,
    MissingWarehouseCredentialsError,
    personalCredentialIdentityFields,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    strictBigqueryPersonalCredentialsSchema,
    strictPersonalWarehouseCredentialsSchema,
    WarehouseTypes,
    type CreateDuckdbCredentials,
    type CreateWarehouseCredentials,
    type StrictPersonalWarehouseCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import { pick } from 'lodash';
import { normalizeDatabricksHostLenient } from '../../controllers/authentication/strategies/databricksStrategy';
import { copyWarehouseCredentialVersions } from '../../utils/warehouseCredentialVersion';

export const PERSONAL_CREDENTIAL_RECONNECT_MESSAGE =
    'Your saved warehouse credentials can no longer be used with this connection. Reconnect your credentials and try again.';

type NonDuckdbWarehouseType = Exclude<WarehouseTypes, WarehouseTypes.DUCKDB>;
type CredentialsFor<W extends NonDuckdbWarehouseType> = Extract<
    CreateWarehouseCredentials,
    { type: W }
>;
type FieldClass = 'auth' | 'connection';

export const personalCredentialFieldClassification = {
    [WarehouseTypes.BIGQUERY]: {
        type: 'connection',
        project: 'connection',
        dataset: 'connection',
        threads: 'connection',
        timeoutSeconds: 'connection',
        priority: 'connection',
        retries: 'connection',
        location: 'connection',
        maximumBytesBilled: 'connection',
        executionProject: 'connection',
        accessUrl: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        keyfileContents: 'auth',
        allowUserCredentials: 'connection',
        authenticationType: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.DATABRICKS]: {
        type: 'connection',
        catalog: 'connection',
        database: 'connection',
        serverHostName: 'connection',
        httpPath: 'connection',
        compute: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        personalAccessToken: 'auth',
        refreshToken: 'auth',
        token: 'auth',
        oauthClientId: 'auth',
        oauthClientSecret: 'auth',
        authenticationType: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.REDSHIFT]: {
        type: 'connection',
        host: 'connection',
        port: 'connection',
        dbname: 'connection',
        schema: 'connection',
        threads: 'connection',
        keepalivesIdle: 'connection',
        sslmode: 'connection',
        ra3Node: 'connection',
        timeoutSeconds: 'connection',
        region: 'connection',
        isServerless: 'connection',
        clusterIdentifier: 'connection',
        workgroupName: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        useSshTunnel: 'connection',
        sshTunnelHost: 'connection',
        sshTunnelPort: 'connection',
        sshTunnelUser: 'connection',
        sshTunnelPublicKey: 'connection',
        sshTunnelPrivateKey: 'connection',
        user: 'auth',
        password: 'auth',
        autoCreate: 'connection',
        dbGroups: 'connection',
        accessKeyId: 'auth',
        secretAccessKey: 'auth',
        sessionToken: 'auth',
        assumeRoleArn: 'auth',
        assumeRoleExternalId: 'auth',
        awsSsoStartUrl: 'connection',
        awsSsoRegion: 'connection',
        awsSsoAccountId: 'connection',
        awsSsoRoleName: 'connection',
        authenticationType: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.ATHENA]: {
        type: 'connection',
        region: 'connection',
        database: 'connection',
        schema: 'connection',
        threads: 'connection',
        numRetries: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        accessKeyId: 'auth',
        secretAccessKey: 'auth',
        sessionToken: 'auth',
        assumeRoleArn: 'auth',
        assumeRoleExternalId: 'auth',
        webIdentityAudience: 'auth',
        workGroup: 'connection',
        s3StagingDir: 'connection',
        s3DataDir: 'connection',
        authenticationType: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.POSTGRES]: {
        type: 'connection',
        host: 'connection',
        port: 'connection',
        dbname: 'connection',
        schema: 'connection',
        threads: 'connection',
        keepalivesIdle: 'connection',
        searchPath: 'connection',
        timeoutSeconds: 'connection',
        sslmode: 'connection',
        sslrootcert: 'connection',
        sslrootcertFileName: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        useSshTunnel: 'connection',
        sshTunnelHost: 'connection',
        sshTunnelPort: 'connection',
        sshTunnelUser: 'connection',
        sshTunnelPublicKey: 'connection',
        sshTunnelPrivateKey: 'connection',
        user: 'auth',
        password: 'auth',
        role: 'connection',
        sslcert: 'connection',
        sslcertFileName: 'connection',
        sslkey: 'connection',
        sslkeyFileName: 'connection',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.TRINO]: {
        type: 'connection',
        host: 'connection',
        port: 'connection',
        dbname: 'connection',
        schema: 'connection',
        http_scheme: 'connection',
        source: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        user: 'auth',
        password: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.CLICKHOUSE]: {
        type: 'connection',
        host: 'connection',
        port: 'connection',
        schema: 'connection',
        secure: 'connection',
        timeoutSeconds: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        user: 'auth',
        password: 'auth',
        requireUserCredentials: 'connection',
    },
    [WarehouseTypes.SNOWFLAKE]: {
        type: 'connection',
        account: 'connection',
        database: 'connection',
        warehouse: 'connection',
        schema: 'connection',
        threads: 'connection',
        clientSessionKeepAlive: 'connection',
        accessUrl: 'connection',
        quotedIdentifiersIgnoreCase: 'connection',
        disableTimestampConversion: 'connection',
        timeoutSeconds: 'connection',
        override: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
        user: 'auth',
        password: 'auth',
        requireAgentSession: 'connection',
        privateKey: 'auth',
        privateKeyPass: 'auth',
        refreshToken: 'auth',
        token: 'auth',
        role: 'connection',
        queryTag: 'connection',
        organizationWarehouseCredentialsUuid: 'connection',
        authenticationType: 'auth',
        requireUserCredentials: 'connection',
    },
} as const satisfies {
    [W in NonDuckdbWarehouseType]: Record<keyof CredentialsFor<W>, FieldClass>;
};

export const personalDuckdbFieldClassification = {
    [DuckdbConnectionType.MOTHERDUCK]: {
        type: 'connection',
        connectionType: 'connection',
        database: 'connection',
        schema: 'connection',
        token: 'auth',
        threads: 'connection',
        requireUserCredentials: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
    },
    [DuckdbConnectionType.EMBEDDED]: {
        type: 'connection',
        connectionType: 'connection',
        dataset: 'connection',
        bundleVersion: 'connection',
        requireUserCredentials: 'connection',
        dataTimezone: 'connection',
        startOfWeek: 'connection',
        schema: 'connection',
    },
    [DuckdbConnectionType.ANALYTICS]: {
        type: 'connection',
        connectionType: 'connection',
        database: 'connection',
        schema: 'connection',
        requireUserCredentials: 'connection',
        dataTimezone: 'connection',
        startOfWeek: 'connection',
    },
    [DuckdbConnectionType.DUCKLAKE]: {
        type: 'connection',
        connectionType: 'connection',
        catalog: 'auth',
        dataPath: 'auth',
        schema: 'connection',
        catalogAlias: 'connection',
        threads: 'connection',
        requireUserCredentials: 'connection',
        startOfWeek: 'connection',
        dataTimezone: 'connection',
    },
} as const satisfies {
    [C in DuckdbConnectionType]: Record<
        keyof Extract<CreateDuckdbCredentials, { connectionType: C }>,
        FieldClass
    >;
};

type ConnectionFields<T, Classification> = Pick<
    T,
    {
        [K in keyof T]: K extends keyof Classification
            ? Classification[K] extends 'connection'
                ? K
                : never
            : never;
    }[keyof T]
>;

const omitConnectionAuthFields = <
    T extends object,
    Classification extends Record<keyof T, FieldClass>,
>(
    connection: T,
    classification: Classification,
): ConnectionFields<T, Classification> =>
    Object.fromEntries(
        Object.entries(connection).filter(
            ([key]) => classification[key as keyof T] !== 'auth',
        ),
    ) as ConnectionFields<T, Classification>;

export const refusedPersonalCredentials = (type: `${WarehouseTypes}`) =>
    type === WarehouseTypes.DATABRICKS
        ? new DatabricksTokenError(PERSONAL_CREDENTIAL_RECONNECT_MESSAGE)
        : new MissingWarehouseCredentialsError(
              PERSONAL_CREDENTIAL_RECONNECT_MESSAGE,
          );

export const projectPersonalWarehouseCredentials = (
    stored: UserWarehouseCredentialsWithSecrets['credentials'],
): StrictPersonalWarehouseCredentials => {
    const fields = personalCredentialIdentityFields[stored.type];
    if (!fields) throw refusedPersonalCredentials(stored.type);
    const raw = stored as unknown as Record<string, unknown>;
    if (
        stored.type === WarehouseTypes.ATHENA &&
        raw.sessionToken !== undefined &&
        raw.sessionToken !== ''
    ) {
        throw refusedPersonalCredentials(stored.type);
    }
    if (
        stored.type === WarehouseTypes.DATABRICKS &&
        raw.authenticationType !== undefined &&
        raw.authenticationType !== '' &&
        raw.authenticationType !==
            DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN &&
        raw.authenticationType !== DatabricksAuthenticationType.OAUTH_U2M
    ) {
        throw refusedPersonalCredentials(stored.type);
    }
    const projected: Record<string, unknown> = { type: stored.type };
    fields.forEach((field) => {
        const value = raw[field];
        const requiredPassword =
            field === 'password' &&
            (stored.type === WarehouseTypes.POSTGRES ||
                stored.type === WarehouseTypes.TRINO ||
                stored.type === WarehouseTypes.CLICKHOUSE);
        if (value !== undefined && (value !== '' || requiredPassword))
            projected[field] = value;
    });
    if (stored.type === WarehouseTypes.BIGQUERY) {
        projected.keyfileContents = pick(
            stored.keyfileContents,
            Object.keys(
                strictBigqueryPersonalCredentialsSchema.shape.keyfileContents
                    .shape,
            ),
        );
    }
    if (projected.authenticationType === undefined) {
        switch (stored.type) {
            case WarehouseTypes.DATABRICKS:
                if (!projected.personalAccessToken || projected.refreshToken)
                    throw refusedPersonalCredentials(stored.type);
                projected.authenticationType =
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;
                break;
            case WarehouseTypes.REDSHIFT:
                projected.authenticationType =
                    RedshiftAuthenticationType.PASSWORD;
                break;
            case WarehouseTypes.BIGQUERY:
                projected.authenticationType = BigqueryAuthenticationType.SSO;
                break;
            case WarehouseTypes.SNOWFLAKE:
                projected.authenticationType =
                    SnowflakeAuthenticationType.PASSWORD;
                break;
            case WarehouseTypes.ATHENA:
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.CLICKHOUSE:
            case WarehouseTypes.DUCKDB:
                break;
            default:
                assertUnreachable(stored, 'Unknown personal credential type');
        }
    }
    const parsed =
        strictPersonalWarehouseCredentialsSchema.safeParse(projected);
    if (!parsed.success) throw refusedPersonalCredentials(stored.type);
    return copyWarehouseCredentialVersions(parsed.data, stored);
};

const composePersonalWarehouseCredentialsWithoutVersions = (
    connection: CreateWarehouseCredentials,
    personal: StrictPersonalWarehouseCredentials,
): CreateWarehouseCredentials => {
    if (connection.type !== personal.type) {
        throw refusedPersonalCredentials(connection.type);
    }
    switch (personal.type) {
        case WarehouseTypes.POSTGRES:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                user: personal.user,
                password: personal.password,
            };
        case WarehouseTypes.TRINO:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                user: personal.user,
                password: personal.password,
            };
        case WarehouseTypes.CLICKHOUSE:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                user: personal.user,
                password: personal.password,
            };
        case WarehouseTypes.SNOWFLAKE:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                ...pick(
                    personal,
                    personalCredentialIdentityFields[personal.type],
                ),
                user: personal.user ?? '',
                authenticationType:
                    personal.authenticationType ??
                    SnowflakeAuthenticationType.PASSWORD,
            };
        case WarehouseTypes.BIGQUERY:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                keyfileContents: personal.keyfileContents,
                authenticationType: BigqueryAuthenticationType.SSO,
            };
        case WarehouseTypes.REDSHIFT:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                ...pick(
                    personal,
                    personalCredentialIdentityFields[personal.type],
                ),
                user: personal.user ?? '',
                authenticationType:
                    personal.authenticationType ??
                    RedshiftAuthenticationType.PASSWORD,
            };
        case WarehouseTypes.DATABRICKS: {
            if (connection.type !== personal.type) break;
            const personalHost = normalizeDatabricksHostLenient(
                personal.serverHostName,
            );
            const connectionHost = normalizeDatabricksHostLenient(
                connection.serverHostName,
            );
            if (
                (personal.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_U2M &&
                    !personalHost) ||
                (personalHost && personalHost !== connectionHost)
            ) {
                throw refusedPersonalCredentials(personal.type);
            }
            const connectionFields = omitConnectionAuthFields(
                connection,
                personalCredentialFieldClassification[personal.type],
            );
            if (
                personal.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
            ) {
                const inheritedApp =
                    !personal.oauthClientId &&
                    connection.authenticationType ===
                        DatabricksAuthenticationType.OAUTH_U2M
                        ? pick(connection, [
                              'oauthClientId',
                              'oauthClientSecret',
                          ])
                        : {};
                return {
                    ...connectionFields,
                    ...inheritedApp,
                    refreshToken: personal.refreshToken,
                    ...(personal.oauthClientId
                        ? { oauthClientId: personal.oauthClientId }
                        : {}),
                    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
                };
            }
            return {
                ...connectionFields,
                personalAccessToken: personal.personalAccessToken,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            };
        }
        case WarehouseTypes.ATHENA:
            if (connection.type !== personal.type) break;
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalCredentialFieldClassification[personal.type],
                ),
                accessKeyId: personal.accessKeyId,
                secretAccessKey: personal.secretAccessKey,
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            };
        case WarehouseTypes.DUCKDB:
            if (connection.type !== personal.type) break;
            if (connection.connectionType !== DuckdbConnectionType.MOTHERDUCK)
                throw refusedPersonalCredentials(personal.type);
            return {
                ...omitConnectionAuthFields(
                    connection,
                    personalDuckdbFieldClassification[
                        connection.connectionType
                    ],
                ),
                token: personal.token,
            };
        default:
            return assertUnreachable(
                personal,
                'Unknown personal credential type',
            );
    }
    throw refusedPersonalCredentials(connection.type);
};

export const composePersonalWarehouseCredentials = (
    connection: CreateWarehouseCredentials,
    personal: StrictPersonalWarehouseCredentials,
): CreateWarehouseCredentials =>
    copyWarehouseCredentialVersions(
        composePersonalWarehouseCredentialsWithoutVersions(
            connection,
            personal,
        ),
        connection,
        personal,
    );
