import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds two nullable columns to user warehouse credentials; older binaries ignore both columns',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('user_warehouse_credentials', (table) => {
        table.timestamp('needs_sign_in_at', { useTz: true }).nullable();
        table.text('needs_sign_in_reason').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('user_warehouse_credentials', (table) => {
        table.dropColumn('needs_sign_in_at');
        table.dropColumn('needs_sign_in_reason');
    });
}
