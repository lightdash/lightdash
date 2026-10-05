import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table.text('paused_reason').nullable();
        table.timestamp('paused_at', { useTz: true }).nullable();
        table.uuid('paused_user_uuid').nullable().index();
        table.text('paused_warehouse_type').nullable();
        table.timestamp('paused_reminded_at', { useTz: true }).nullable();
        table.timestamp('missed_run_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('scheduler', (table) => {
        table.dropColumn('missed_run_at');
        table.dropColumn('paused_reminded_at');
        table.dropColumn('paused_warehouse_type');
        table.dropColumn('paused_user_uuid');
        table.dropColumn('paused_at');
        table.dropColumn('paused_reason');
    });
}
