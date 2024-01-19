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
    warehouseType: UserWarehouseCredentialsDetails['type'];
};

export type CreateUserWarehouseCredentials = {
    name: string;
    credentials: UserWarehouseCredentialsDetails;
};

export type UpdateUserWarehouseCredentials = {
    uuid: string;
    name: string;
    credentials: UserWarehouseCredentialsDetails;
};

export type UserWarehouseCredentialsDetails =
    | Pick<
          | CreateRedshiftCredentials
          | CreatePostgresCredentials
          | CreateSnowflakeCredentials
          | CreateTrinoCredentials,
          'type' | 'user' | 'password'
      >
    | Pick<CreateBigqueryCredentials, 'type' | 'keyfileContents'>
    | Pick<CreateDatabricksCredentials, 'type' | 'personalAccessToken'>;
