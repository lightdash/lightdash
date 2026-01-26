import { Knex } from 'knex';

export const AiArtifactsTableName = 'ai_artifacts';

export type DbAiArtifact = {
    ai_artifact_uuid: string;
    created_at: Date;
    ai_thread_uuid: string;
    artifact_type: 'chart' | 'dashboard';
};

export type AiArtifactsTable = Knex.CompositeTableType<
    DbAiArtifact,
    Pick<DbAiArtifact, 'ai_thread_uuid' | 'artifact_type'>
>;

export const AiArtifactVersionsTableName = 'ai_artifact_versions';

export type DbAiArtifactVersion = {
    ai_artifact_version_uuid: string;
    ai_artifact_uuid: string;
    ai_prompt_uuid: string | null;
    created_at: Date;
    version_number: number;
    title: string | null;
    description: string | null;
    saved_query_uuid: string | null;
    saved_dashboard_uuid: string | null;
    chart_config: Record<string, unknown> | null;
    dashboard_config: Record<string, unknown> | null;
    verified_by_user_uuid: string | null;
    verified_at: Date | null;
    verified_question: string | null;
    embedding_vector: number[] | null;
    embedding_model_provider: string | null;
    embedding_model: string | null;
};

export type AiArtifactVersionsTable = Knex.CompositeTableType<
    DbAiArtifactVersion,
    Partial<
        Pick<
            DbAiArtifactVersion,
            | 'ai_artifact_uuid'
            | 'ai_prompt_uuid'
            | 'version_number'
            | 'title'
            | 'description'
            | 'saved_query_uuid'
            | 'saved_dashboard_uuid'
            | 'chart_config'
            | 'dashboard_config'
            | 'verified_by_user_uuid'
            | 'verified_at'
            | 'verified_question'
            | 'embedding_vector'
            | 'embedding_model_provider'
            | 'embedding_model'
        >
    >
>;

export const AiPromptArtifactReferencesTableName =
    'ai_prompt_artifact_references';

export type DbAiPromptArtifactReference = {
    ai_prompt_uuid: string;
    ai_artifact_version_uuid: string;
    project_uuid: string;
    similarity_score: number | null;
    created_at: Date;
};

export type AiPromptArtifactReferencesTable = Knex.CompositeTableType<
    DbAiPromptArtifactReference,
    Pick<
        DbAiPromptArtifactReference,
        'ai_prompt_uuid' | 'ai_artifact_version_uuid' | 'project_uuid'
    > &
        Partial<Pick<DbAiPromptArtifactReference, 'similarity_score'>>
>;
