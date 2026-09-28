import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable jsonb column to app_threads that older binaries never read or write',
} as const;

const TABLE = 'app_threads';
const COLUMN = 'coding_agent_session_usage';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(
        `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS ${COLUMN} jsonb NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${COLUMN}`);
}
