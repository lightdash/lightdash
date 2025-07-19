import { Knex } from 'knex';

const AiArtifactsTable = 'ai_artifacts';
const AiArtifactVersionsTable = 'ai_artifact_versions';
const AiPromptTable = 'ai_prompt';
const AiThreadTable = 'ai_thread';
const UsersTable = 'users';
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
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(UsersTable)
            .onDelete('SET NULL');
        table.text('artifact_type').notNullable().defaultTo('chart'); // 'chart', 'visualization', etc.
        table.text('title').nullable();
        table.text('description').nullable();
        table
            .uuid('saved_query_uuid')
            .nullable()
            .references('saved_query_uuid')
            .inTable(SavedQueriesTable)
            .onDelete('SET NULL');

        table.index('ai_thread_uuid');
        table.index('created_by_user_uuid');
        table.index('saved_query_uuid');
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
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(UsersTable)
            .onDelete('SET NULL');
        table.integer('version_number').notNullable();
        table.jsonb('viz_config_output').nullable();
        table.jsonb('filters_output').nullable();
        table.jsonb('metric_query').nullable();

        table.unique(['ai_artifact_uuid', 'version_number']);

        table.index('ai_artifact_uuid');
        table.index('ai_prompt_uuid');
        table.index('created_by_user_uuid');
        table.index('created_at');
    });

    /*
    Could we do this? 
    
    1. Each ai_prompt with viz_config_output could become its own artifact
    2. Create artifacts for prompts with viz configs:
    
    const promptsWithVizConfig = await knex('ai_prompt')
        .select(['ai_prompt_uuid', 'ai_thread_uuid', 'created_by_user_uuid', 
                 'created_at', 'responded_at', 'viz_config_output', 
                 'filters_output', 'metric_query', 'saved_query_uuid'])
        .whereNotNull('viz_config_output')
        .orderBy('created_at');

    for (const prompt of promptsWithVizConfig) {
        // Create individual artifact for each prompt
        const [artifact] = await knex('ai_artifacts').insert({
            ai_thread_uuid: prompt.ai_thread_uuid,
            created_by_user_uuid: prompt.created_by_user_uuid,
            created_at: prompt.created_at,
            artifact_type: 'chart',
            title: extractTitleFromVizConfig(prompt.viz_config_output), // Custom logic
            description: extractDescriptionFromVizConfig(prompt.viz_config_output),
            saved_query_uuid: prompt.saved_query_uuid,
        }).returning('ai_artifact_uuid');

        // Create initial version
        await knex('ai_artifact_versions').insert({
            ai_artifact_uuid: artifact.ai_artifact_uuid,
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            created_at: prompt.responded_at || prompt.created_at,
            created_by_user_uuid: prompt.created_by_user_uuid,
            version_number: 1,
            viz_config_output: prompt.viz_config_output,
            filters_output: prompt.filters_output,
            metric_query: prompt.metric_query,
        });
    }

    3. After migration is complete and verified:
       - Update application code to use artifacts instead of ai_prompt.viz_config_output
       - Eventually drop viz_config_output, filters_output, metric_query from ai_prompt
       - Remove backwards compatibility code
    */
}

export async function down(knex: Knex): Promise<void> {
    // Drop tables in reverse order due to foreign key constraints
    await knex.schema.dropTableIfExists(AiArtifactVersionsTable);
    await knex.schema.dropTableIfExists(AiArtifactsTable);
}
