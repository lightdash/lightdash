import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable draft ownership metadata without rewriting existing write-backs',
} as const;

const WRITEBACKS_TABLE = 'content_as_code_writebacks';
const DRAFTS_TABLE = 'content_drafts';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(WRITEBACKS_TABLE, (table) => {
        table
            .uuid('content_draft_uuid')
            .nullable()
            .references('content_draft_uuid')
            .inTable(DRAFTS_TABLE)
            .onDelete('RESTRICT')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(WRITEBACKS_TABLE, (table) => {
        table.dropColumn('content_draft_uuid');
    });
}
