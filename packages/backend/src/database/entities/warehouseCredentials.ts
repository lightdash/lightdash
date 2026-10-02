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
    credential_subject_user_uuid: string | null;
};
type DbWarehouseCredentialsIn = Omit<
    DbWarehouseCredentials,
    | 'warehouse_credentials_id'
    | 'created_at'
    | 'preview_owns_credentials'
    | 'credential_subject_user_uuid'
> &
    Partial<Pick<DbWarehouseCredentials, 'credential_subject_user_uuid'>>;
type DbWarehouseCredentialsUpdate = Partial<
    Pick<
        DbWarehouseCredentials,
        | 'encrypted_credentials'
        | 'preview_owns_credentials'
        | 'credential_subject_user_uuid'
    >
>;

export type WarehouseCredentialTable = Knex.CompositeTableType<
    DbWarehouseCredentials,
    DbWarehouseCredentialsIn,
    DbWarehouseCredentialsUpdate
>;
