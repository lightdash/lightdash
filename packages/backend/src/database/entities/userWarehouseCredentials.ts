import { Knex } from 'knex';
import { WarehouseType } from './warehouseCredentials';

export type DbUserWarehouseCredentials = {
    user_warehouse_credentials_uuid: string;
    name: string;
    created_at: Date;
    updated_at: Date;
    user_uuid: string;
    warehouse_type: WarehouseType;
    encrypted_credentials: Buffer;
};
export const UserWarehouseCredentialsTableName = 'user_warehouse_credentials';
export type UserWarehouseCredentialsTable = Knex.CompositeTableType<
    DbUserWarehouseCredentials,
    Create,
    Update
>;

type Create = Pick<
    DbUserWarehouseCredentials,
    'name' | 'user_uuid' | 'warehouse_type' | 'encrypted_credentials'
>;
type Update = Pick<
    DbUserWarehouseCredentials,
    'name' | 'warehouse_type' | 'encrypted_credentials' | 'updated_at'
>;

export type DbProjectUserWarehouseCredentialPreference = {
    user_uuid: string;
    project_uuid: string;
    user_warehouse_credentials_uuid: string;
};
export const ProjectUserWarehouseCredentialPreferenceTableName =
    'project_user_warehouse_credentials_preference';
export type ProjectUserWarehouseCredentialPreferenceTable =
    Knex.CompositeTableType<DbProjectUserWarehouseCredentialPreference>;
