import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable columns that freeze the reviewed documents of a written-back draft',
} as const;

const DRAFTS_TABLE = 'content_drafts';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(DRAFTS_TABLE, (table) => {
        table.jsonb('written_back_published').nullable();
        table.jsonb('written_back_draft').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(DRAFTS_TABLE, (table) => {
        table.dropColumn('written_back_published');
        table.dropColumn('written_back_draft');
    });
}
