import { Knex } from 'knex';

const AiWritebackPromptTableName = 'ai_writeback_prompt';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiWritebackPromptTableName))) {
        await knex.schema.createTable(AiWritebackPromptTableName, (table) => {
            table
                .uuid('ai_writeback_prompt_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table
                .uuid('ai_thread_uuid')
                .references('ai_thread_uuid')
                .inTable('ai_thread')
                .onDelete('SET NULL')
                .index();
            table
                .uuid('created_by_user_uuid')
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table.text('sandbox_id').notNullable();
            table.boolean('is_resume').notNullable();
            table.text('system_prompt').notNullable();
            table.text('prompt').notNullable();
            table.text('response');
            table.integer('exit_code');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.timestamp('responded_at', { useTz: false });
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiWritebackPromptTableName);
}
