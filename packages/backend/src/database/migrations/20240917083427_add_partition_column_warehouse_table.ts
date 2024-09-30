import { Knex } from 'knex';

const WarehouseAvailableTablesTableName =
    'warehouse_credentials_available_tables';
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(WarehouseAvailableTablesTableName, (table) => {
        table.jsonb('partition_column').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(WarehouseAvailableTablesTableName, (table) => {
        table.dropColumn('partition_column');
    });
}
