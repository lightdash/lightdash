import { z } from 'zod';
import assertUnreachable from '../utils/assertUnreachable';
import {
    DatabricksAuthenticationType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
    type CreateClickhouseCredentials,
    type CreateDatabricksCredentials,
    type CreateDuckdbCredentials,
    type CreateDuckdbMotherduckCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
    type CreateTrinoCredentials,
    type CreateWarehouseCredentials,
    type ProjectType,
} from './projects';

export type UserWarehouseCredentialsProject = {
    projectUuid: string;
    name: string;
    type: ProjectType;
};

export type UserWarehouseCredentials = {
    uuid: string;
    userUuid: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    credentials:
        | Pick<
              CreateRedshiftCredentials,
              'type' | 'user' | 'authenticationType' | 'assumeRoleArn'
          >
        | Pick<
              | CreatePostgresCredentials
              | CreateTrinoCredentials
              | CreateClickhouseCredentials,
              'type' | 'user'
          >
        | Pick<
              CreateSnowflakeCredentials,
              'type' | 'user' | 'authenticationType'
          >
        | Pick<CreateBigqueryCredentials, 'type'>
        | Pick<CreateDatabricksCredentials, 'type'>
        | Pick<CreateAthenaCredentials, 'type' | 'accessKeyId'>
        | Pick<CreateDuckdbCredentials, 'type'>;
    project: UserWarehouseCredentialsProject | null;
};

export type UserWarehouseCredentialsWithSecrets = Pick<
    UserWarehouseCredentials,
    'uuid'
> & {
    credentials:
        | Pick<CreateRedshiftCredentials, 'type' | 'user' | 'password'>
        | Pick<
              CreateRedshiftCredentials,
              | 'type'
              | 'user'
              | 'authenticationType'
              | 'accessKeyId'
              | 'secretAccessKey'
              | 'sessionToken'
              | 'assumeRoleArn'
              | 'assumeRoleExternalId'
          >
        | Pick<CreatePostgresCredentials, 'type' | 'user' | 'password'>
        // Kept as two members rather than one wider Pick: merging them renames
        // the generated OpenAPI schema, which reads as a removed `anyOf` member.
        | Pick<
              CreateSnowflakeCredentials,
              | 'type'
              | 'user'
              | 'password'
              | 'authenticationType'
              | 'refreshToken'
              | 'token'
          >
        | Pick<
              CreateSnowflakeCredentials,
              | 'type'
              | 'user'
              | 'privateKey'
              | 'privateKeyPass'
              | 'authenticationType'
          >
        | Pick<CreateTrinoCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateClickhouseCredentials, 'type' | 'user' | 'password'>
        | Pick<
              CreateBigqueryCredentials,
              'type' | 'keyfileContents' | 'authenticationType'
          >
        | (Pick<
              CreateDatabricksCredentials,
              | 'type'
              | 'personalAccessToken'
              | 'authenticationType'
              | 'refreshToken'
              | 'token'
          > &
              Partial<
                  Pick<
                      CreateDatabricksCredentials,
                      | 'database'
                      | 'serverHostName'
                      | 'httpPath'
                      | 'oauthClientId'
                  >
              >)
        | Pick<
              CreateAthenaCredentials,
              | 'type'
              | 'accessKeyId'
              | 'secretAccessKey'
              | 'sessionToken'
              | 'assumeRoleArn'
              | 'assumeRoleExternalId'
          >
        | Pick<CreateDuckdbMotherduckCredentials, 'type' | 'token'>;
};

export const mergeUserWarehouseCredentials = (
    connection: CreateWarehouseCredentials,
    userCredentials: UserWarehouseCredentialsWithSecrets['credentials'],
): CreateWarehouseCredentials => {
    switch (connection.type) {
        case WarehouseTypes.ATHENA:
            if (userCredentials.type !== WarehouseTypes.ATHENA)
                return connection;
            return {
                ...connection,
                accessKeyId: userCredentials.accessKeyId,
                secretAccessKey: userCredentials.secretAccessKey,
                sessionToken: userCredentials.sessionToken,
                assumeRoleArn: userCredentials.assumeRoleArn,
                assumeRoleExternalId: userCredentials.assumeRoleExternalId,
            };
        case WarehouseTypes.POSTGRES:
            if (userCredentials.type !== WarehouseTypes.POSTGRES)
                return connection;
            return {
                ...connection,
                user: userCredentials.user,
                password: userCredentials.password,
            };
        case WarehouseTypes.REDSHIFT:
            if (userCredentials.type !== WarehouseTypes.REDSHIFT)
                return connection;
            const redshiftCredentials =
                userCredentials as Partial<CreateRedshiftCredentials>;
            return {
                ...connection,
                user: redshiftCredentials.user ?? '',
                password: redshiftCredentials.password,
                authenticationType: redshiftCredentials.authenticationType,
                accessKeyId: redshiftCredentials.accessKeyId,
                secretAccessKey: redshiftCredentials.secretAccessKey,
                sessionToken: redshiftCredentials.sessionToken,
                assumeRoleArn: redshiftCredentials.assumeRoleArn,
                assumeRoleExternalId: redshiftCredentials.assumeRoleExternalId,
            };
        case WarehouseTypes.SNOWFLAKE:
            if (userCredentials.type !== WarehouseTypes.SNOWFLAKE)
                return connection;
            const snowflakeCredentials =
                userCredentials as Partial<CreateSnowflakeCredentials>;
            return {
                ...connection,
                user: snowflakeCredentials.user ?? '',
                password: snowflakeCredentials.password,
                privateKey: snowflakeCredentials.privateKey,
                privateKeyPass: snowflakeCredentials.privateKeyPass,
                token: snowflakeCredentials.token,
                refreshToken: snowflakeCredentials.refreshToken,
                authenticationType: snowflakeCredentials.authenticationType,
            };
        case WarehouseTypes.BIGQUERY:
            if (userCredentials.type !== WarehouseTypes.BIGQUERY)
                return connection;
            return {
                ...connection,
                keyfileContents: userCredentials.keyfileContents,
                authenticationType: userCredentials.authenticationType,
            };
        case WarehouseTypes.DATABRICKS:
            if (userCredentials.type !== WarehouseTypes.DATABRICKS)
                return connection;
            return {
                ...connection,
                personalAccessToken: userCredentials.personalAccessToken,
                authenticationType: userCredentials.authenticationType,
                refreshToken: userCredentials.refreshToken,
                token: userCredentials.token,
                oauthClientId: userCredentials.oauthClientId,
            };
        case WarehouseTypes.TRINO:
            if (userCredentials.type !== WarehouseTypes.TRINO)
                return connection;
            return {
                ...connection,
                user: userCredentials.user,
                password: userCredentials.password,
            };
        case WarehouseTypes.CLICKHOUSE:
            if (userCredentials.type !== WarehouseTypes.CLICKHOUSE)
                return connection;
            return {
                ...connection,
                user: userCredentials.user,
                password: userCredentials.password,
            };
        case WarehouseTypes.DUCKDB:
            if (
                connection.connectionType !== 'motherduck' ||
                userCredentials.type !== WarehouseTypes.DUCKDB
            )
                return connection;
            return {
                ...connection,
                token: userCredentials.token,
            };
        default:
            return assertUnreachable(connection, 'Unknown warehouse type');
    }
};

export type UpsertUserWarehouseCredentials = {
    name: string;
    credentials: UserWarehouseCredentialsWithSecrets['credentials'];
};

export type RedshiftAwsSsoStartRequest = {
    projectUuid?: string;
    startUrl?: string;
    region?: string;
};

export type RedshiftAwsSsoStartResults = {
    verificationUri: string;
    verificationUriComplete: string;
    userCode: string;
    expiresIn: number;
    interval: number;
};

export type RedshiftAwsSsoStartResponse = {
    status: 'ok';
    results: RedshiftAwsSsoStartResults;
};

export type RedshiftAwsSsoCompleteRequest = {
    accountId?: string;
    roleName?: string;
    projectUuid?: string;
    projectName?: string;
    credentialsName?: string;
    databaseUser?: string;
};

export type RedshiftAwsSsoCompleteResults =
    | {
          status: 'pending';
      }
    | {
          status: 'authenticated';
          credentials: UserWarehouseCredentials;
      };

export type RedshiftAwsSsoCompleteResponse = {
    status: 'ok';
    results: RedshiftAwsSsoCompleteResults;
};

// Zod schema for validating Snowflake SSO user warehouse credentials
// Requires refreshToken and disallows token field
export const snowflakeSsoUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.SNOWFLAKE),
        user: z.string().optional(),
        password: z.string().optional(),
        authenticationType: z.literal(SnowflakeAuthenticationType.SSO),
        refreshToken: z.string().min(1),
    })
    .strict();

export const snowflakeUserCredentialsSchema = z.union([
    snowflakeSsoUserCredentialsSchema,
    z
        .object({
            type: z.literal(WarehouseTypes.SNOWFLAKE),
            user: z.string().trim().min(1),
            password: z.string().min(1),
            authenticationType: z
                .literal(SnowflakeAuthenticationType.PASSWORD)
                .optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal(WarehouseTypes.SNOWFLAKE),
            user: z.string().trim().min(1),
            privateKey: z.string().trim().min(1),
            privateKeyPass: z.string().optional(),
            authenticationType: z.literal(
                SnowflakeAuthenticationType.PRIVATE_KEY,
            ),
        })
        .strict(),
]);

// Zod schema for validating Databricks OAuth U2M user warehouse credentials
// Requires refreshToken and allows optional compatibility fields
export const databricksOauthU2mUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.DATABRICKS),
        authenticationType: z.literal(DatabricksAuthenticationType.OAUTH_U2M),
        refreshToken: z.string(),
        oauthClientId: z.string().optional(),
        personalAccessToken: z.string().optional(),
        database: z.string().optional(),
        serverHostName: z.string().optional(),
        httpPath: z.string().optional(),
    })
    .strict();

// Zod schema for validating BigQuery SSO user warehouse credentials.
// Per-user BigQuery credentials are always SSO ("authorized_user" keyfile),
// so a usable keyfile must carry a non-empty refresh_token. This guards
// against an empty `keyfileContents: {}` being persisted or used, which
// otherwise surfaces as the opaque "does not contain a client_email field".
export const bigquerySsoUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.BIGQUERY),
        keyfileContents: z
            .object({ refresh_token: z.string().min(1) })
            .passthrough(),
    })
    .passthrough();

export const redshiftIamUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.REDSHIFT),
        authenticationType: z.union([
            z.literal(RedshiftAuthenticationType.IAM),
            z.literal(RedshiftAuthenticationType.IAM_BROWSER),
        ]),
        user: z.string().optional(),
        password: z.string().optional(),
        accessKeyId: z.string().optional(),
        secretAccessKey: z.string().optional(),
        sessionToken: z.string().optional(),
        assumeRoleArn: z.string().optional(),
        assumeRoleExternalId: z.string().optional(),
    })
    .strict()
    .superRefine((credentials, ctx) => {
        const hasAccessKeyId = !!credentials.accessKeyId;
        const hasSecretAccessKey = !!credentials.secretAccessKey;
        const hasStaticCredentials = hasAccessKeyId && hasSecretAccessKey;
        const hasAssumeRole = !!credentials.assumeRoleArn;

        if (hasAccessKeyId !== hasSecretAccessKey) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Redshift IAM credentials require both AWS access key ID and secret access key.',
            });
        }

        if (!hasStaticCredentials && !hasAssumeRole) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Redshift IAM credentials require an assume-role ARN or AWS access keys.',
            });
        }
    });
