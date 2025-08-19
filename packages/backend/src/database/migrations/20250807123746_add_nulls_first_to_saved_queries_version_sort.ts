import { Knex } from 'knex';

const TABLE_NAME = 'saved_queries_version_sorts';
const COLUMN_NAME = 'nulls_first';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.boolean(COLUMN_NAME).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn(COLUMN_NAME);
    });
}
