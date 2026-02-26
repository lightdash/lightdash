import { z } from 'zod';
import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
    type CreateClickhouseCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
    type CreateTrinoCredentials,
    type DatabricksOAuthU2MCredentials,
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
              | CreateRedshiftCredentials
              | CreatePostgresCredentials
              | CreateSnowflakeCredentials
              | CreateTrinoCredentials
              | CreateClickhouseCredentials,
              'type' | 'user'
          >
        | Pick<CreateBigqueryCredentials, 'type'>
        | Pick<DatabricksOAuthU2MCredentials, 'type'>
        | Pick<CreateAthenaCredentials, 'type'>;
    project: UserWarehouseCredentialsProject | null;
};

export type UserWarehouseCredentialsWithSecrets = Pick<
    UserWarehouseCredentials,
    'uuid'
> & {
    credentials:
        | Pick<CreateRedshiftCredentials, 'type' | 'user' | 'password'>
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
              DatabricksOAuthU2MCredentials,
              'type' | 'authenticationType' | 'refreshToken' | 'oauthClientId'
          > &
              Partial<
                  Pick<
                      DatabricksOAuthU2MCredentials,
                      'database' | 'serverHostName' | 'httpPath'
                  >
              >)
        | Pick<
              CreateAthenaCredentials,
              'type' | 'accessKeyId' | 'secretAccessKey'
          >;
};

export type UpsertUserWarehouseCredentials = {
    name: string;
    credentials: UserWarehouseCredentialsWithSecrets['credentials'];
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
// Requires refreshToken and allows optional fields from DatabricksOAuthU2MCredentials
export const databricksOauthU2mUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.DATABRICKS),
        authenticationType: z.literal(DatabricksAuthenticationType.OAUTH_U2M),
        refreshToken: z.string(),
        oauthClientId: z.string().optional(),
        database: z.string().optional(),
        serverHostName: z.string().optional(),
        httpPath: z.string().optional(),
    })
    .strict();

// Compile-time check: Zod schema keys must be valid keys of DatabricksOAuthU2MCredentials
type DatabricksU2MSchemaKeys = keyof z.infer<
    typeof databricksOauthU2mUserCredentialsSchema
>;
type DatabricksU2MSchemaCheck =
    DatabricksU2MSchemaKeys extends keyof DatabricksOAuthU2MCredentials
        ? true
        : never;
const databricksU2mSchemaValid: DatabricksU2MSchemaCheck = true; // eslint-disable-line @typescript-eslint/no-unused-vars
