import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table.text('automatically_disabled_reason').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table.dropColumn('automatically_disabled_reason');
    });
}
