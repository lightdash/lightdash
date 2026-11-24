import { Knex } from 'knex';

const AiArtifactVersionsTableName = 'ai_artifact_versions';
const AiPromptArtifactReferencesTableName = 'ai_prompt_artifact_references';

export const classification = {
    kind: 'breaking',
    reason: 'Drops the verified answers columns of ai_artifact_versions (verified_by_user_uuid, verified_at, verified_question, embedding_vector with its HNSW index, embedding_model_provider, embedding_model) and the ai_prompt_artifact_references table. Releases that contain the verified answers removal neither read nor write them; older releases still read them when loading artifacts and threads. Raw SQL sets a lock timeout and drops the columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(AiPromptArtifactReferencesTableName);
    // Dropping embedding_vector also drops its HNSW index.
    await knex.raw(
        `ALTER TABLE ${AiArtifactVersionsTableName} DROP COLUMN IF EXISTS verified_by_user_uuid, DROP COLUMN IF EXISTS verified_at, DROP COLUMN IF EXISTS verified_question, DROP COLUMN IF EXISTS embedding_vector, DROP COLUMN IF EXISTS embedding_model_provider, DROP COLUMN IF EXISTS embedding_model`,
    );
}

export async function down(): Promise<void> {
    throw new Error('irreversible: verified answers data was dropped');
}
