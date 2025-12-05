import { Knex } from 'knex';

export const AiThreadTableName = 'ai_thread';

export type DbAiThread = {
    agent_uuid: string | null;
    ai_thread_uuid: string;
    created_at: Date;
    organization_uuid: string;
    project_uuid: string;
    created_from: 'slack' | 'web_app' | 'evals'; // slack, web_app, evals etc
    title: string | null;
    title_generated_at: Date | null;
};

export type AiThreadTable = Knex.CompositeTableType<
    DbAiThread,
    Pick<
        DbAiThread,
        'organization_uuid' | 'project_uuid' | 'created_from' | 'agent_uuid'
    >,
    Partial<
        Pick<
            DbAiThread,
            'agent_uuid' | 'title' | 'title_generated_at' | 'project_uuid'
        >
    >
>;

export const AiSlackThreadTableName = 'ai_slack_thread';

export const AiWebAppThreadTableName = 'ai_web_app_thread';

export type DbAiSlackThread = {
    ai_slack_thread_uuid: string;
    ai_thread_uuid: string;
    slack_user_id: string;
    slack_channel_id: string;
    slack_thread_ts: string;
};

type DbWebAppThread = {
    ai_slack_thread_uuid: string;
    ai_thread_uuid: string;
    user_uuid: string;
};

export type AiSlackThreadTable = Knex.CompositeTableType<
    DbAiSlackThread,
    Pick<
        DbAiSlackThread,
        | 'ai_thread_uuid'
        | 'slack_user_id'
        | 'slack_channel_id'
        | 'slack_thread_ts'
    >,
    never
>;

export type AiWebAppThreadTable = Knex.CompositeTableType<
    DbWebAppThread,
    Pick<DbWebAppThread, 'ai_thread_uuid'>,
    never
>;

export const AiPromptTableName = 'ai_prompt';

export type DbAiPrompt = {
    ai_prompt_uuid: string;
    created_at: Date;
    ai_thread_uuid: string;
    created_by_user_uuid: string | null;
    prompt: string;
    response: string | null;
    responded_at: Date | null;
    viz_config_output: object | null;
    filters_output: object | null;
    human_score: number | null;
    human_feedback: string | null;
    metric_query: object | null;
    saved_query_uuid: string | null;
    model_config: { modelName: string; modelProvider: string } | null;
};

export type AiPromptTable = Knex.CompositeTableType<
    // base
    DbAiPrompt,
    // insert
    Pick<DbAiPrompt, 'ai_thread_uuid' | 'created_by_user_uuid' | 'prompt'> &
        Partial<Pick<DbAiPrompt, 'model_config'>>,
    // update
    Partial<
        Pick<
            DbAiPrompt,
            | 'response'
            | 'viz_config_output'
            | 'filters_output'
            | 'human_score'
            | 'human_feedback'
            | 'metric_query'
            | 'saved_query_uuid'
            | 'model_config'
        > & {
            responded_at: Knex.Raw;
        }
    >
>;

export const AiSlackPromptTableName = 'ai_slack_prompt';
export const AiWebAppPromptTableName = 'ai_web_app_prompt';

export type DbAiSlackPrompt = {
    ai_slack_prompt_uuid: string;
    ai_prompt_uuid: string;
    slack_user_id: string;
    slack_channel_id: string;
    prompt_slack_ts: string;
    response_slack_ts: string | null;
};

export type DbAiWebAppPrompt = {
    ai_slack_prompt_uuid: string;
    ai_prompt_uuid: string;
    user_uuid: string;
};

export type AiSlackPromptTable = Knex.CompositeTableType<
    DbAiSlackPrompt,
    Pick<
        DbAiSlackPrompt,
        | 'ai_prompt_uuid'
        | 'slack_user_id'
        | 'slack_channel_id'
        | 'prompt_slack_ts'
    >,
    Pick<DbAiSlackPrompt, 'response_slack_ts'>
>;

export type AiWebAppPromptTable = Knex.CompositeTableType<
    DbAiWebAppPrompt,
    Pick<DbAiWebAppPrompt, 'ai_prompt_uuid' | 'user_uuid'>,
    Pick<DbAiWebAppPrompt, 'user_uuid'>
>;

export const AiAgentToolCallTableName = 'ai_agent_tool_call';

export type DbAiAgentToolCall = {
    ai_agent_tool_call_uuid: string;
    ai_prompt_uuid: string;
    tool_call_id: string;
    tool_name: string;
    tool_args: object;
    created_at: Date;
};

export type AiAgentToolCallTable = Knex.CompositeTableType<
    DbAiAgentToolCall,
    Pick<
        DbAiAgentToolCall,
        'ai_prompt_uuid' | 'tool_call_id' | 'tool_name' | 'tool_args'
    >,
    never
>;

export const AiAgentToolResultTableName = 'ai_agent_tool_result';

export type DbAiAgentToolResult = {
    ai_agent_tool_result_uuid: string;
    ai_prompt_uuid: string;
    tool_call_id: string;
    tool_name: string;
    result: string;
    metadata: object | null;
    created_at: Date;
    // TODO add updated_at
};

export type AiAgentToolResultTable = Knex.CompositeTableType<
    DbAiAgentToolResult,
    Pick<
        DbAiAgentToolResult,
        'ai_prompt_uuid' | 'tool_call_id' | 'tool_name' | 'result'
    > &
        Partial<Pick<DbAiAgentToolResult, 'metadata'>>,
    Partial<Pick<DbAiAgentToolResult, 'metadata'>>
>;

export const AiOrganizationSettingsTableName = 'ai_organization_settings';

export type DbAiOrganizationSettings = {
    organization_uuid: string;
    ai_agents_visible: boolean;
    created_at: Date;
    updated_at: Date;
};

export type AiOrganizationSettingsTable = Knex.CompositeTableType<
    DbAiOrganizationSettings,
    Pick<DbAiOrganizationSettings, 'organization_uuid' | 'ai_agents_visible'>,
    Partial<Pick<DbAiOrganizationSettings, 'ai_agents_visible'>>
>;
