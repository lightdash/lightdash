import { z } from 'zod';
import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateDuckdbMotherduckCredentials,
    type CreateWarehouseCredentials,
} from './projects';
import { snowflakeUserCredentialsSchema } from './userWarehouseCredentials';

type PersonalConnection<W extends WarehouseTypes> =
    W extends WarehouseTypes.DUCKDB
        ? CreateDuckdbMotherduckCredentials
        : Extract<CreateWarehouseCredentials, { type: W }>;

export const personalCredentialIdentityFields = {
    [WarehouseTypes.SNOWFLAKE]: [
        'user',
        'password',
        'privateKey',
        'privateKeyPass',
        'refreshToken',
        'authenticationType',
    ],
    [WarehouseTypes.BIGQUERY]: ['keyfileContents', 'authenticationType'],
    [WarehouseTypes.DATABRICKS]: [
        'authenticationType',
        'personalAccessToken',
        'refreshToken',
        'oauthClientId',
        'serverHostName',
    ],
    [WarehouseTypes.REDSHIFT]: [
        'user',
        'password',
        'authenticationType',
        'accessKeyId',
        'secretAccessKey',
        'sessionToken',
        'assumeRoleArn',
        'assumeRoleExternalId',
    ],
    [WarehouseTypes.POSTGRES]: ['user', 'password'],
    [WarehouseTypes.TRINO]: ['user', 'password'],
    [WarehouseTypes.CLICKHOUSE]: ['user', 'password'],
    [WarehouseTypes.ATHENA]: ['accessKeyId', 'secretAccessKey'],
    [WarehouseTypes.DUCKDB]: ['token'],
} as const satisfies {
    [W in WarehouseTypes]: readonly (keyof PersonalConnection<W>)[];
};

export const strictBigqueryPersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.BIGQUERY),
        keyfileContents: z
            .object({
                type: z.literal('authorized_user'),
                client_id: z.string().min(1),
                client_secret: z.string().optional(),
                refresh_token: z.string().min(1),
            })
            .catchall(z.string()),
        authenticationType: z
            .literal(BigqueryAuthenticationType.SSO)
            .optional(),
    })
    .strict();

export const strictDatabricksPersonalCredentialsSchema = z.union([
    z
        .object({
            type: z.literal(WarehouseTypes.DATABRICKS),
            authenticationType: z
                .literal(DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN)
                .optional(),
            personalAccessToken: z.string().min(1),
            serverHostName: z.string().optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal(WarehouseTypes.DATABRICKS),
            authenticationType: z.literal(
                DatabricksAuthenticationType.OAUTH_U2M,
            ),
            refreshToken: z.string().min(1),
            oauthClientId: z.string().optional(),
            serverHostName: z.string().optional(),
        })
        .strict(),
]);

export const strictRedshiftPersonalCredentialsSchema = z.union([
    z
        .object({
            type: z.literal(WarehouseTypes.REDSHIFT),
            user: z.string().min(1),
            password: z.string().min(1),
            authenticationType: z
                .literal(RedshiftAuthenticationType.PASSWORD)
                .optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal(WarehouseTypes.REDSHIFT),
            authenticationType: z.union([
                z.literal(RedshiftAuthenticationType.IAM),
                z.literal(RedshiftAuthenticationType.IAM_BROWSER),
            ]),
            user: z.string().optional(),
            password: z.string().optional(),
            accessKeyId: z.string().min(1),
            secretAccessKey: z.string().min(1),
            sessionToken: z.string().optional(),
            assumeRoleArn: z.string().optional(),
            assumeRoleExternalId: z.string().optional(),
        })
        .strict(),
]);

export const strictPostgresPersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.POSTGRES),
        user: z.string().min(1),
        password: z.string(),
    })
    .strict();
export const strictTrinoPersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.TRINO),
        user: z.string().min(1),
        password: z.string(),
    })
    .strict();
export const strictClickhousePersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.CLICKHOUSE),
        user: z.string().min(1),
        password: z.string(),
    })
    .strict();
export const strictAthenaPersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.ATHENA),
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
    })
    .strict();
export const strictDuckdbPersonalCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.DUCKDB),
        token: z.string().min(1),
    })
    .strict();

export const strictPersonalWarehouseCredentialsSchema = z.union([
    snowflakeUserCredentialsSchema,
    strictBigqueryPersonalCredentialsSchema,
    strictDatabricksPersonalCredentialsSchema,
    strictRedshiftPersonalCredentialsSchema,
    strictPostgresPersonalCredentialsSchema,
    strictTrinoPersonalCredentialsSchema,
    strictClickhousePersonalCredentialsSchema,
    strictAthenaPersonalCredentialsSchema,
    strictDuckdbPersonalCredentialsSchema,
]);

export type StrictPersonalWarehouseCredentials = z.infer<
    typeof strictPersonalWarehouseCredentialsSchema
>;
