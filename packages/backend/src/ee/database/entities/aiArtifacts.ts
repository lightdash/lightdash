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
        >
    >
>;
