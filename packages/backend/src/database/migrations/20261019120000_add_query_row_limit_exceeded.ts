import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.boolean('row_limit_exceeded').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.dropColumn('row_limit_exceeded');
    });
}
