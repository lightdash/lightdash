import { Knex } from 'knex';

const WarehouseAvailableTablesTableName =
    'warehouse_credentials_available_tables';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(WarehouseAvailableTablesTableName, (table) => {
        table.text('database').notNullable().alter();
        table.text('schema').notNullable().alter();
        table.text('table').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(WarehouseAvailableTablesTableName, (table) => {
        table.string('database').notNullable().alter();
        table.string('schema').notNullable().alter();
        table.string('table').notNullable().alter();
    });
}
