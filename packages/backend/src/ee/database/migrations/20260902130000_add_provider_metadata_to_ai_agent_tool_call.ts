import type { Knex } from 'knex';

const TABLE_NAME = 'ai_agent_tool_call';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable provider_metadata jsonb column to ai_agent_tool_call so provider thought signatures can be replayed; no default, no backfill.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.jsonb('provider_metadata').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn('provider_metadata');
    });
}
