import { Knex } from 'knex';

export const AiAgentReasoningTableName = 'ai_agent_reasoning';

export type DbAiAgentReasoning = {
    ai_agent_reasoning_uuid: string;
    ai_prompt_uuid: string;
    reasoning_id: string;
    text: string;
    created_at: Date;
};

type DbAiAgentReasoningInsert = Pick<
    DbAiAgentReasoning,
    'ai_prompt_uuid' | 'reasoning_id' | 'text'
>;

export type AiAgentReasoningTable = Knex.CompositeTableType<
    DbAiAgentReasoning,
    DbAiAgentReasoningInsert
>;
