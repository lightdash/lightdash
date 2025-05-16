import { Knex } from 'knex';

export const AiAgentTableName = 'ai_agent';

export type DbAiAgent = {
    ai_agent_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    name: string;
    description: string;
    image_url: string;
    data_sources: object;

    created_at: Date;
};

export type AiAgentTable = Knex.CompositeTableType<DbAiAgent>;

export const AiAgentIntegrationTableName = 'ai_agent_integration';

export type DbAiAgentIntegration = {
    ai_agent_integration_uuid: string;
    ai_agent_uuid: string;
    integration_type: string;
    configuration: object;
    created_at: Date;
};

export type AiAgentIntegrationTable =
    Knex.CompositeTableType<DbAiAgentIntegration>;
