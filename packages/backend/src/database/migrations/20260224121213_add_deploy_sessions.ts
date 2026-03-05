import { Knex } from 'knex';

const DEPLOY_SESSIONS_TABLE_NAME = 'deploy_sessions';
const DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME =
    'deploy_session_batch_explores';

export async function up(knex: Knex): Promise<void> {
    // Create deploy_sessions table
    await knex.schema.createTable(DEPLOY_SESSIONS_TABLE_NAME, (table) => {
        table
            .uuid('deploy_session_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.uuid('user_uuid').notNullable();
        table
            .enu('status', ['uploading', 'finalizing', 'completed', 'failed'])
            .notNullable()
            .defaultTo('uploading');
        table.integer('batch_count').notNullable().defaultTo(0);
        table.integer('explore_count').notNullable().defaultTo(0);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Index for cleanup queries
        table.index('created_at');
        table.index('project_uuid');
    });

    // Create deploy_session_batch_explores table
    await knex.schema.createTable(
        DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME,
        (table) => {
            table
                .uuid('deploy_session_batch_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('deploy_session_uuid')
                .notNullable()
                .references('deploy_session_uuid')
                .inTable(DEPLOY_SESSIONS_TABLE_NAME)
                .onDelete('CASCADE');
            table.uuid('project_uuid').notNullable();
            table.integer('batch_number').notNullable();
            table.jsonb('explores').notNullable(); // Array of explores in this batch
            table.integer('explore_count').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            // Index for performance
            table.index('deploy_session_uuid');
            table.unique(['deploy_session_uuid', 'batch_number']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(
        DEPLOY_SESSION_BATCH_EXPLORES_TABLE_NAME,
    );
    await knex.schema.dropTableIfExists(DEPLOY_SESSIONS_TABLE_NAME);
}
