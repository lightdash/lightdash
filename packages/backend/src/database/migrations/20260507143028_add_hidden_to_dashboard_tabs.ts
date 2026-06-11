import { Knex } from 'knex';

const tableName = 'dashboard_tabs';
const columnName = 'hidden';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(tableName, columnName))) {
        await knex.schema.alterTable(tableName, (table) => {
            table.boolean(columnName).notNullable().defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(tableName, columnName)) {
        await knex.schema.alterTable(tableName, (table) => {
            table.dropColumn(columnName);
        });
    }
}
