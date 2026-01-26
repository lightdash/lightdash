import { Knex } from 'knex';

const AI_ARTIFACT_VERSIONS_TABLE = 'ai_artifact_versions';

export async function up(knex: Knex): Promise<void> {
    // Enable pgvector extension (safe to re-run)
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

    // Add embedding_vector column (1536 dimensions for text-embedding-3-small)
    await knex.raw(`
        ALTER TABLE ${AI_ARTIFACT_VERSIONS_TABLE}
        ADD COLUMN embedding_vector vector(1536)
    `);

    // Create HNSW index for cosine similarity search
    await knex.raw(`
        CREATE INDEX ai_artifact_versions_embedding_vector_idx
        ON ${AI_ARTIFACT_VERSIONS_TABLE}
        USING hnsw (embedding_vector vector_cosine_ops)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.dropIndex(
            'embedding_vector',
            'ai_artifact_versions_embedding_vector_idx',
        );
    });

    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.dropColumn('embedding_vector');
    });
}
