import { Knex } from 'knex';

export const AiAgentUserPreferencesTableName = 'ai_agent_user_preferences';

export type DbAiAgentUserPreferences = {
    user_uuid: string;
    project_uuid: string;
    default_agent_uuid: string;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentUserPreferencesTable = Knex.CompositeTableType<
    DbAiAgentUserPreferences,
    Omit<DbAiAgentUserPreferences, 'created_at' | 'updated_at'>,
    Partial<Omit<DbAiAgentUserPreferences, 'created_at'>>
>;
