import { Knex } from 'knex';

export const AiArtifactsTableName = 'ai_artifacts';

export type DbAiArtifact = {
    ai_artifact_uuid: string;
    created_at: Date;
    ai_thread_uuid: string;
    artifact_type: string;
    saved_query_uuid: string | null;
};

export type AiArtifactsTable = Knex.CompositeTableType<
    DbAiArtifact,
    Pick<DbAiArtifact, 'ai_thread_uuid' | 'artifact_type' | 'saved_query_uuid'>
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
    viz_config_output: Record<string, unknown> | null;
};

export type AiArtifactVersionsTable = Knex.CompositeTableType<
    DbAiArtifactVersion,
    Pick<
        DbAiArtifactVersion,
        | 'ai_artifact_uuid'
        | 'ai_prompt_uuid'
        | 'version_number'
        | 'title'
        | 'description'
        | 'viz_config_output'
    >
>;
