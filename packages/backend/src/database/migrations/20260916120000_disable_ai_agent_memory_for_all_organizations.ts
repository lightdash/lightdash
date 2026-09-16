import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Sets an existing boolean column to false for every organization and changes its default; no schema shape change and every reader tolerates false',
} as const;

const OrganizationsTableName = 'organizations';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        UPDATE ${OrganizationsTableName}
        SET ai_agent_memory_enabled = false
    `);
    await knex.raw(`
        ALTER TABLE ${OrganizationsTableName}
        ALTER COLUMN ai_agent_memory_enabled SET DEFAULT false
    `);
}

export async function down(): Promise<void> {
    throw new Error('irreversible: per-organization prior values are lost');
}
