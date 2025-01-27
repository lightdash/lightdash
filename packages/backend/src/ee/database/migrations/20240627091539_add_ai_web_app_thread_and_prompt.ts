import { Knex } from 'knex';

const AI_THREAD_TABLE_NAME = 'ai_thread';
const AI_PROMPT_TABLE_NAME = 'ai_prompt';

const AI_WEB_APP_THREAD_TABLE_NAME = 'ai_web_app_thread';
const AI_WEB_APP_PROMPT_TABLE_NAME = 'ai_web_app_prompt';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AI_WEB_APP_THREAD_TABLE_NAME))) {
        await knex.schema.createTable(
            AI_WEB_APP_THREAD_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('ai_web_app_thread_uuid')
                    .notNullable()
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('ai_thread_uuid')
                    .unique()
                    .notNullable()
                    .references('ai_thread_uuid')
                    .inTable(AI_THREAD_TABLE_NAME)
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('user_uuid')
                    .notNullable()
                    .references('user_uuid')
                    .inTable('users');

                tableBuilder.unique(['ai_thread_uuid', 'user_uuid']);
            },
        );
    }

    if (!(await knex.schema.hasTable(AI_WEB_APP_PROMPT_TABLE_NAME))) {
        await knex.schema.createTable(
            AI_WEB_APP_PROMPT_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('ai_web_app_prompt_uuid')
                    .notNullable()
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('ai_prompt_uuid')
                    .unique()
                    .notNullable()
                    .references('ai_prompt_uuid')
                    .inTable(AI_PROMPT_TABLE_NAME)
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('user_uuid')
                    .notNullable()
                    .references('user_uuid')
                    .inTable('users');

                tableBuilder.unique(['ai_prompt_uuid', 'user_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_WEB_APP_THREAD_TABLE_NAME);
    await knex.schema.dropTableIfExists(AI_WEB_APP_PROMPT_TABLE_NAME);
}
