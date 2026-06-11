import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const INDEX_NAME = 'ai_prompt_thread_uuid_created_at_index';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
        table.index(['ai_thread_uuid', 'created_at'], INDEX_NAME);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
        table.dropIndex(['ai_thread_uuid', 'created_at'], INDEX_NAME);
    });
}
