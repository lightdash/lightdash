import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_queries', (tableBuilder) => {
        tableBuilder.text('description');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_queries', (tableBuilder) => {
        tableBuilder.dropColumn('description');
    });
}
