import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a partial index so delete paths find open drafts without scanning the table',
} as const;

const DRAFTS_TABLE = 'content_drafts';
const INDEX_NAME = 'content_drafts_open_by_content_index';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
        ON ${DRAFTS_TABLE} (content_type, content_uuid)
        WHERE status = 'open'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
}
