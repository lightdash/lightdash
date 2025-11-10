import { Knex } from 'knex';

const AI_ARTIFACT_VERSIONS_TABLE = 'ai_artifact_versions';

export async function up(knex: Knex): Promise<void> {
    // Add columns to track embedding model provider and model name
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.text('embedding_model_provider').nullable();
        table.text('embedding_model').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.dropColumn('embedding_model_provider');
        table.dropColumn('embedding_model');
    });
}
