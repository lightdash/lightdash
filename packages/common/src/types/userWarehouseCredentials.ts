import { z } from 'zod';
import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
    type CreateClickhouseCredentials,
    type CreateDatabricksCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
    type CreateTrinoCredentials,
} from './projects';

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
        | Pick<CreateDatabricksCredentials, 'type'>
        | Pick<CreateAthenaCredentials, 'type'>;
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
              CreateDatabricksCredentials,
              | 'type'
              | 'personalAccessToken'
              | 'authenticationType'
              | 'refreshToken'
          > &
              Partial<
                  Pick<
                      CreateDatabricksCredentials,
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
// Requires refreshToken and allows optional compatibility fields
export const databricksOauthU2mUserCredentialsSchema = z
    .object({
        type: z.literal(WarehouseTypes.DATABRICKS),
        authenticationType: z.literal(DatabricksAuthenticationType.OAUTH_U2M),
        refreshToken: z.string(),
        personalAccessToken: z.string().optional(),
        database: z.string().optional(),
        serverHostName: z.string().optional(),
        httpPath: z.string().optional(),
    })
    .strict();
