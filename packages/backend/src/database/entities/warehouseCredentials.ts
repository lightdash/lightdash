import { Knex } from 'knex';

export const WarehouseCredentialTableName = 'warehouse_credentials';

export const warehouseTypes = [
    'bigquery',
    'redshift',
    'snowflake',
    'postgres',
    'databricks',
    'trino',
    'athena',
] as const;
export type WarehouseType = typeof warehouseTypes[number];
type DbWarehouseCredentials = {
    warehouse_credentials_id: number;
    project_id: number;
    created_at: Date;
    warehouse_type: WarehouseType;
    encrypted_credentials: Buffer;
};
type DbWarehouseCredentialsIn = Omit<
    DbWarehouseCredentials,
    'warehouse_credentials_id' | 'created_at'
>;
type DbWarehouseCredentialsUpdate = Pick<
    DbWarehouseCredentials,
    'encrypted_credentials'
>;

export type WarehouseCredentialTable = Knex.CompositeTableType<
    DbWarehouseCredentials,
    DbWarehouseCredentialsIn,
    DbWarehouseCredentialsUpdate
>;
