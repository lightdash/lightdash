import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable query history column without a default or backfill; existing readers and writers remain compatible.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.jsonb('agent_identity').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('query_history', (table) => {
        table.dropColumn('agent_identity');
    });
}
