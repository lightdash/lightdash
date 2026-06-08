import { Knex } from 'knex';

const AI_THREAD_TABLE_NAME = 'ai_thread';
const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const AI_THREAD_SHARE_TABLE_NAME = 'ai_thread_share';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AI_THREAD_SHARE_TABLE_NAME, (table) => {
        table
            .uuid('ai_thread_share_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('nanoid').notNullable().unique();
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable(AI_THREAD_TABLE_NAME)
            .onDelete('CASCADE');
        table.uuid('agent_uuid').notNullable();
        table.uuid('project_uuid').notNullable();
        table.uuid('organization_uuid').notNullable();
        table
            .uuid('snapshot_prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable(AI_PROMPT_TABLE_NAME)
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('revoked_at', { useTz: false }).nullable();

        table.index(['ai_thread_uuid']);
        table.index(['snapshot_prompt_uuid']);
    });

    await knex.schema.alterTable(AI_THREAD_TABLE_NAME, (table) => {
        table
            .uuid('share_source_thread_share_uuid')
            .nullable()
            .references('ai_thread_share_uuid')
            .inTable(AI_THREAD_SHARE_TABLE_NAME)
            .onDelete('SET NULL');
        table.index(['share_source_thread_share_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_THREAD_TABLE_NAME, (table) => {
        table.dropIndex(['share_source_thread_share_uuid']);
        table.dropColumn('share_source_thread_share_uuid');
    });
    await knex.schema.dropTableIfExists(AI_THREAD_SHARE_TABLE_NAME);
}
