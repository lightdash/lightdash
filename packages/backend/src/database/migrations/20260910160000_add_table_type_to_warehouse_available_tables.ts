import { Knex } from 'knex';

const TABLE_NAME = 'warehouse_credentials_available_tables';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.string('table_type').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn('table_type');
    });
}
