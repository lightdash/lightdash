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
export const warehouseTypeDisplayNames: Record<WarehouseType, string> = {
    bigquery: 'BigQuery',
    redshift: 'Redshift',
    snowflake: 'Snowflake',
    postgres: 'Postgres',
    databricks: 'Databricks',
    trino: 'Trino',
    clickhouse: 'ClickHouse',
    athena: 'Athena',
    duckdb: 'DuckDB',
};
type DbWarehouseCredentials = {
    warehouse_credentials_id: number;
    warehouse_credentials_uuid: string;
    project_id: number;
    created_at: Date;
    warehouse_type: WarehouseType;
    name: string;
    organization_warehouse_credentials_uuid: string | null;
    list_all_databases: boolean;
    additional_databases: string[];
    superseded_at: Date | null;
    encrypted_credentials: Buffer | null;
};
type DbWarehouseCredentialsIn = Omit<
    DbWarehouseCredentials,
    | 'warehouse_credentials_id'
    | 'warehouse_credentials_uuid'
    | 'created_at'
    | 'superseded_at'
    | 'name'
    | 'organization_warehouse_credentials_uuid'
    | 'list_all_databases'
    | 'additional_databases'
> &
    Partial<
        Pick<
            DbWarehouseCredentials,
            | 'name'
            | 'organization_warehouse_credentials_uuid'
            | 'list_all_databases'
            | 'additional_databases'
        >
    >;
type DbWarehouseCredentialsUpdate = Partial<
    Pick<
        DbWarehouseCredentials,
        | 'name'
        | 'warehouse_type'
        | 'encrypted_credentials'
        | 'organization_warehouse_credentials_uuid'
        | 'list_all_databases'
        | 'additional_databases'
    >
>;

export type WarehouseCredentialTable = Knex.CompositeTableType<
    DbWarehouseCredentials,
    DbWarehouseCredentialsIn,
    DbWarehouseCredentialsUpdate
>;
