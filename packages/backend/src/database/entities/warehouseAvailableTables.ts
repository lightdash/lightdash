import { Knex } from 'knex';

export type DbWarehouseAvailableTables = {
    database: string;
    schema: string;
    table: string;
    project_warehouse_credentials_id: number | null;
    user_warehouse_credentials_uuid: string | null;
};

export const WarehouseAvailableTablesTableName =
    'warehouse_credentials_available_tables';
export type WarehouseAvailableTablesTable =
    Knex.CompositeTableType<DbWarehouseAvailableTables>;
