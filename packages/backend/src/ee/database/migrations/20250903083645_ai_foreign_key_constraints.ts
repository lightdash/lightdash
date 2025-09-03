import { Knex } from 'knex';

const AI_WEB_APP_THREAD_TABLE_NAME = 'ai_web_app_thread';
const AI_WEB_APP_PROMPT_TABLE_NAME = 'ai_web_app_prompt';

export async function up(knex: Knex): Promise<void> {
    const threadTableExists = await knex.schema.hasTable(
        AI_WEB_APP_THREAD_TABLE_NAME,
    );
    const promptTableExists = await knex.schema.hasTable(
        AI_WEB_APP_PROMPT_TABLE_NAME,
    );

    if (threadTableExists) {
        await knex.schema.alterTable(AI_WEB_APP_THREAD_TABLE_NAME, (table) => {
            table.dropForeign(['user_uuid']);
        });

        await knex.schema.alterTable(AI_WEB_APP_THREAD_TABLE_NAME, (table) => {
            table
                .foreign('user_uuid')
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');
        });
    }

    if (promptTableExists) {
        await knex.schema.alterTable(AI_WEB_APP_PROMPT_TABLE_NAME, (table) => {
            table.dropForeign(['user_uuid']);
        });

        await knex.schema.alterTable(AI_WEB_APP_PROMPT_TABLE_NAME, (table) => {
            table
                .foreign('user_uuid')
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    // This migration fixes a bug in foreign key constraints.
    // Rolling back would restore the broken state that prevents user deletion.
    // No rollback is provided for this bug fix.
}
