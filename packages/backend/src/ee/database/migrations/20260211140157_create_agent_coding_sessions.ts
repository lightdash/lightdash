import { Knex } from 'knex';

const SESSIONS_TABLE = 'agent_coding_sessions';
const MESSAGES_TABLE = 'agent_coding_session_messages';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SESSIONS_TABLE))) {
        await knex.schema.createTable(SESSIONS_TABLE, (table) => {
            table.increments('session_id').primary();
            table
                .uuid('session_uuid')
                .notNullable()
                .unique()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .uuid('created_by_user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');
            table.string('github_repo').notNullable();
            table.string('github_branch').notNullable();
            table.string('e2b_sandbox_id').nullable();
            table.string('claude_session_id').nullable();
            table.string('status').notNullable().defaultTo('pending');
            table.text('error_message').nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            // Indexes
            table.index('project_uuid');
            table.index('created_by_user_uuid');
            table.index(['project_uuid', 'created_by_user_uuid']);
        });
    }

    if (!(await knex.schema.hasTable(MESSAGES_TABLE))) {
        await knex.schema.createTable(MESSAGES_TABLE, (table) => {
            table.increments('message_id').primary();
            table
                .uuid('message_uuid')
                .notNullable()
                .unique()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('session_uuid')
                .notNullable()
                .references('session_uuid')
                .inTable(SESSIONS_TABLE)
                .onDelete('CASCADE');
            table.string('role').notNullable(); // 'user' | 'assistant'
            table.text('content').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            // Index for fetching messages by session
            table.index('session_uuid');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(MESSAGES_TABLE);
    await knex.schema.dropTableIfExists(SESSIONS_TABLE);
}
