import { Knex } from 'knex';

const TABLE_NAME = 'saved_queries_version_table_calculations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (tableBuilder) => {
        tableBuilder.text('formula').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('formula');
    });
}
