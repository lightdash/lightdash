import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.timestamp('executing_heartbeat_at').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.dropColumn('executing_heartbeat_at');
    });
}
