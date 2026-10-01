import { Knex } from 'knex';

export const WarehouseCredentialTableName = 'warehouse_credentials';

export const warehouseTypes = [
    'bigquery',
    'redshift',
    'snowflake',
    'postgres',
    'databricks',
    'trino',
    'clickhouse',
    'athena',
    'duckdb',
] as const;
export type WarehouseType = (typeof warehouseTypes)[number];
type DbWarehouseCredentials = {
    warehouse_credentials_id: number;
    project_id: number;
    created_at: Date;
    warehouse_type: WarehouseType;
    encrypted_credentials: Buffer;
    preview_owns_credentials: boolean | null;
};
type DbWarehouseCredentialsIn = Omit<
    DbWarehouseCredentials,
    'warehouse_credentials_id' | 'created_at' | 'preview_owns_credentials'
>;
type DbWarehouseCredentialsUpdate = Partial<
    Pick<
        DbWarehouseCredentials,
        'encrypted_credentials' | 'preview_owns_credentials'
    >
>;

export type WarehouseCredentialTable = Knex.CompositeTableType<
    DbWarehouseCredentials,
    DbWarehouseCredentialsIn,
    DbWarehouseCredentialsUpdate
>;
