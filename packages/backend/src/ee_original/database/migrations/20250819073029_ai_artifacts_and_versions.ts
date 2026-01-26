import { Knex } from 'knex';

const AiArtifactsTable = 'ai_artifacts';
const AiArtifactVersionsTable = 'ai_artifact_versions';
const AiPromptTable = 'ai_prompt';
const AiThreadTable = 'ai_thread';
const SavedQueriesTable = 'saved_queries';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiArtifactsTable, (table) => {
        table
            .uuid('ai_artifact_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable(AiThreadTable)
            .onDelete('CASCADE');
        table.text('artifact_type').notNullable().defaultTo('chart');

        table.index('ai_thread_uuid');
        table.index('created_at');
    });

    await knex.schema.createTable(AiArtifactVersionsTable, (table) => {
        table
            .uuid('ai_artifact_version_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_artifact_uuid')
            .notNullable()
            .references('ai_artifact_uuid')
            .inTable(AiArtifactsTable)
            .onDelete('CASCADE');
        table
            .uuid('ai_prompt_uuid')
            .nullable()
            .references('ai_prompt_uuid')
            .inTable(AiPromptTable)
            .onDelete('SET NULL');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.integer('version_number').notNullable();
        table.text('title').nullable();
        table.text('description').nullable();
        table
            .uuid('saved_query_uuid')
            .nullable()
            .references('saved_query_uuid')
            .inTable(SavedQueriesTable)
            .onDelete('SET NULL');
        table.jsonb('chart_config').nullable();

        table.unique(['ai_artifact_uuid', 'version_number']);

        table.index('ai_artifact_uuid');
        table.index('ai_prompt_uuid');
        table.index('saved_query_uuid');
        table.index('created_at');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop tables in reverse order due to foreign key constraints
    await knex.schema.dropTableIfExists(AiArtifactVersionsTable);
    await knex.schema.dropTableIfExists(AiArtifactsTable);
}
