import { Knex } from 'knex';

const AiArtifactVersionsTableName = 'ai_artifact_versions';
const AiPromptArtifactReferencesTableName = 'ai_prompt_artifact_references';
const EmbeddingVectorIndexName = 'ai_artifact_versions_embedding_vector_idx';

export const classification = {
    kind: 'breaking',
    reason: 'Drops the verified answers columns of ai_artifact_versions (verified_by_user_uuid, verified_at, verified_question, embedding_vector with its HNSW index, embedding_model_provider, embedding_model) and the ai_prompt_artifact_references table. Releases that contain the verified answers removal neither read nor write them; older releases still read them when loading artifacts and threads. Raw SQL only sets a lock timeout.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(AiPromptArtifactReferencesTableName);
    // Dropping embedding_vector also drops its HNSW index.
    await knex.raw(
        `ALTER TABLE ${AiArtifactVersionsTableName} DROP COLUMN IF EXISTS verified_by_user_uuid, DROP COLUMN IF EXISTS verified_at, DROP COLUMN IF EXISTS verified_question, DROP COLUMN IF EXISTS embedding_vector, DROP COLUMN IF EXISTS embedding_model_provider, DROP COLUMN IF EXISTS embedding_model`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(AiArtifactVersionsTableName, (table) => {
        table
            .uuid('verified_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table.timestamp('verified_at').nullable();
        table.text('verified_question').nullable();
        table.specificType('embedding_vector', 'vector(1536)').nullable();
        table.text('embedding_model_provider').nullable();
        table.text('embedding_model').nullable();
    });
    await knex.raw(
        `CREATE INDEX ${EmbeddingVectorIndexName} ON ${AiArtifactVersionsTableName} USING hnsw (embedding_vector vector_cosine_ops)`,
    );
    await knex.schema.createTable(
        AiPromptArtifactReferencesTableName,
        (table) => {
            table
                .uuid('ai_prompt_uuid')
                .notNullable()
                .references('ai_prompt_uuid')
                .inTable('ai_prompt')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('ai_artifact_version_uuid')
                .notNullable()
                .references('ai_artifact_version_uuid')
                .inTable(AiArtifactVersionsTableName)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table.float('similarity_score').nullable();
            table
                .timestamp('created_at')
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['ai_prompt_uuid', 'ai_artifact_version_uuid']);
        },
    );
}
