import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Adds nullable setup check state to provisioners without changing existing reads or writes.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_provisioners', (table) => {
        table.jsonb('setup_check').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_provisioners', (table) => {
        table.dropColumn('setup_check');
    });
}
