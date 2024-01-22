import {
    CreateBigqueryCredentials,
    CreateDatabricksCredentials,
    CreatePostgresCredentials,
    CreateRedshiftCredentials,
    CreateSnowflakeCredentials,
    CreateTrinoCredentials,
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
              | CreateTrinoCredentials,
              'type' | 'user'
          >
        | Pick<CreateBigqueryCredentials, 'type'>
        | Pick<CreateDatabricksCredentials, 'type'>;
};

export type UpsertUserWarehouseCredentials = {
    name: string;
    credentials:
        | Pick<CreateRedshiftCredentials, 'type' | 'user' | 'password'>
        | Pick<CreatePostgresCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateSnowflakeCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateTrinoCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateBigqueryCredentials, 'type' | 'keyfileContents'>
        | Pick<CreateDatabricksCredentials, 'type' | 'personalAccessToken'>;
};
