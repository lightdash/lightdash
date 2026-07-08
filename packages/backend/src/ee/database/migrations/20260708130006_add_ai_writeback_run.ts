import { Knex } from 'knex';

const AiWritebackRunTableName = 'ai_writeback_run';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiWritebackRunTableName))) {
        await knex.schema.createTable(AiWritebackRunTableName, (table) => {
            table
                .uuid('ai_writeback_run_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            // Nullable: a one-shot run (no conversation, e.g. a bare MCP call)
            // has no thread to attach to.
            table
                .uuid('ai_thread_uuid')
                .references('ai_thread_uuid')
                .inTable('ai_thread')
                .onDelete('CASCADE')
                .index();
            table.uuid('created_by_user_uuid').notNullable();
            table.text('source').notNullable();
            table.text('status').notNullable().defaultTo('pending');
            table.text('branch_name');
            table.text('pr_url');
            table.text('error_message');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiWritebackRunTableName);
}
