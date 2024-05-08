import {
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
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
              | CreateTrinoCredentials,
              'type' | 'user'
          >
        | Pick<CreateBigqueryCredentials, 'type'>
        | Pick<CreateAthenaCredentials, 'type'>
        | Pick<CreateDatabricksCredentials, 'type'>;
};

export type UserWarehouseCredentialsWithSecrets = Pick<
    UserWarehouseCredentials,
    'uuid'
> & {
    credentials:
        | Pick<CreateRedshiftCredentials, 'type' | 'user' | 'password'>
        | Pick<CreatePostgresCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateSnowflakeCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateTrinoCredentials, 'type' | 'user' | 'password'>
        | Pick<CreateBigqueryCredentials, 'type' | 'keyfileContents'>
        | Pick<CreateAthenaCredentials, 'type' | 'awsSecretKey'>
        | Pick<CreateDatabricksCredentials, 'type' | 'personalAccessToken'>;
};

export type UpsertUserWarehouseCredentials = {
    name: string;
    credentials: UserWarehouseCredentialsWithSecrets['credentials'];
};
