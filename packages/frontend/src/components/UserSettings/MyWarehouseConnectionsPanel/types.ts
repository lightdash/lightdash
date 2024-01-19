import {
    CreateBigqueryCredentials,
    CreateDatabricksCredentials,
    CreatePostgresCredentials,
    CreateRedshiftCredentials,
    CreateSnowflakeCredentials,
    CreateTrinoCredentials,
} from '@lightdash/common';

export type CreateUserCredentials = {
    name: string;
    credentials: UpsertUserWarehouseCredentials;
};

export type UpdateUserCredentials = {
    uuid: string;
    name: string;
    credentials: UpsertUserWarehouseCredentials;
};

export type UpsertUserWarehouseCredentials =
    | Pick<
          | CreateRedshiftCredentials
          | CreatePostgresCredentials
          | CreateSnowflakeCredentials
          | CreateTrinoCredentials,
          'type' | 'user' | 'password'
      >
    | Pick<CreateBigqueryCredentials, 'type' | 'keyfileContents'>
    | Pick<CreateDatabricksCredentials, 'type' | 'personalAccessToken'>;
