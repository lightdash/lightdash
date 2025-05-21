import { Knex } from 'knex';

export const AiAgentTableName = 'ai_agent';

export type DbAiAgent = {
    ai_agent_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    name: string;
    description: string;
    image_url: string;
    tags: string[] | null;
    created_at: Date;
};

export type AiAgentTable = Knex.CompositeTableType<
    DbAiAgent,
    Omit<DbAiAgent, 'ai_agent_uuid' | 'created_at'>
>;

export const AiAgentIntegrationTableName = 'ai_agent_integration';

export type DbAiAgentIntegration = {
    ai_agent_integration_uuid: string;
    ai_agent_uuid: string;
    integration_type: string;
    created_at: Date;
};

export type AiAgentIntegrationTable =
    Knex.CompositeTableType<DbAiAgentIntegration>;

export const AiAgentSlackIntegrationTableName = 'ai_agent_slack_integration';

export type DbAiAgentSlackIntegration = {
    ai_agent_integration_slack_uuid: string;
    organization_uuid: string;
    ai_agent_integration_uuid: string;
    slack_channel_id: string;
    created_at: Date;
};

export type AiAgentSlackIntegrationTable =
    Knex.CompositeTableType<DbAiAgentSlackIntegration>;
