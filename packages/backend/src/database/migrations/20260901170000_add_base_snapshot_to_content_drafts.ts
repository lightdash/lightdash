import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable columns recording the upload snapshot a draft was started from',
} as const;

const DRAFTS_TABLE = 'content_drafts';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(DRAFTS_TABLE, (table) => {
        table.jsonb('base_snapshot').nullable();
        table.string('base_snapshot_hash', 64).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(DRAFTS_TABLE, (table) => {
        table.dropColumn('base_snapshot');
        table.dropColumn('base_snapshot_hash');
    });
}
