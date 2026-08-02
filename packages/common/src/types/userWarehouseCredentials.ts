import { z } from 'zod';
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
              | CreateSnowflakeCredentials
              | CreateTrinoCredentials
              | CreateClickhouseCredentials,
              'type' | 'user'
          >
        | Pick<CreateBigqueryCredentials, 'type'>
        | Pick<CreateDatabricksCredentials, 'type'>
        | Pick<CreateAthenaCredentials, 'type'>
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
        | Pick<
              CreateSnowflakeCredentials,
              | 'type'
              | 'user'
              | 'password'
              | 'authenticationType'
              | 'refreshToken'
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
              'type' | 'accessKeyId' | 'secretAccessKey'
          >
        | Pick<CreateDuckdbMotherduckCredentials, 'type' | 'token'>;
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
        refreshToken: z.string(),
    })
    .strict();

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
                code: z.ZodIssueCode.custom,
                message:
                    'Redshift IAM credentials require both AWS access key ID and secret access key.',
            });
        }

        if (!hasStaticCredentials && !hasAssumeRole) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'Redshift IAM credentials require an assume-role ARN or AWS access keys.',
            });
        }
    });
