import { Knex } from 'knex';

const AI_THREAD_TABLE = 'ai_thread';
const THREAD_METADATA_COLUMN = 'thread_metadata';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(AI_THREAD_TABLE, (table) => {
        table.jsonb(THREAD_METADATA_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(AI_THREAD_TABLE, (table) => {
        table.dropColumn(THREAD_METADATA_COLUMN);
    });
}
