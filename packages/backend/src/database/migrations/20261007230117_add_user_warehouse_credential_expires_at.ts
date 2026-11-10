import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'The nullable expiry column preserves existing credentials without a backfill.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET LOCAL lock_timeout = 5000');
    await knex.schema.alterTable('user_warehouse_credentials', (table) => {
        table.timestamp('expires_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET LOCAL lock_timeout = 5000');
    await knex.schema.alterTable('user_warehouse_credentials', (table) => {
        table.dropColumn('expires_at');
    });
}
