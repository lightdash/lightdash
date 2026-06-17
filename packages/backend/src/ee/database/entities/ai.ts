import { type AiChartRuntimeOverrides } from '@lightdash/common';
import { Knex } from 'knex';

export const AiThreadTableName = 'ai_thread';

export type DbAiThread = {
    agent_uuid: string | null;
    ai_thread_uuid: string;
    share_source_thread_share_uuid: string | null;
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
            | 'agent_uuid'
            | 'title'
            | 'title_generated_at'
            | 'project_uuid'
            | 'share_source_thread_share_uuid'
        >
    >
>;

export const AiThreadShareTableName = 'ai_thread_share';

export type DbAiThreadShare = {
    ai_thread_share_uuid: string;
    nanoid: string;
    ai_thread_uuid: string;
    agent_uuid: string;
    project_uuid: string;
    organization_uuid: string;
    snapshot_prompt_uuid: string;
    created_by_user_uuid: string;
    created_at: Date;
    revoked_at: Date | null;
};

export type AiThreadShareTable = Knex.CompositeTableType<
    DbAiThreadShare,
    Pick<
        DbAiThreadShare,
        | 'nanoid'
        | 'ai_thread_uuid'
        | 'agent_uuid'
        | 'project_uuid'
        | 'organization_uuid'
        | 'snapshot_prompt_uuid'
        | 'created_by_user_uuid'
    >,
    Pick<DbAiThreadShare, 'revoked_at'>
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
    ai_web_app_thread_uuid: string;
    ai_thread_uuid: string;
    user_uuid: string;
    embed_space_uuid: string | null;
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
    Pick<DbWebAppThread, 'ai_thread_uuid' | 'user_uuid'> &
        Partial<Pick<DbWebAppThread, 'embed_space_uuid'>>,
    never
>;

export const AiWritebackThreadTableName = 'ai_writeback_thread';

export type DbAiWritebackThread = {
    ai_writeback_thread_uuid: string;
    ai_thread_uuid: string;
    sandbox_id: string;
    pull_request_uuid: string | null;
    created_at: Date;
};

export type AiWritebackThreadTable = Knex.CompositeTableType<
    DbAiWritebackThread,
    Pick<
        DbAiWritebackThread,
        'ai_thread_uuid' | 'sandbox_id' | 'pull_request_uuid'
    >,
    Pick<DbAiWritebackThread, 'sandbox_id' | 'pull_request_uuid'>
>;

export const AiPromptTableName = 'ai_prompt';

export type DbAiPrompt = {
    ai_prompt_uuid: string;
    created_at: Date;
    ai_thread_uuid: string;
    created_by_user_uuid: string | null;
    prompt: string;
    response: string | null;
    error_message: string | null;
    responded_at: Date | null;
    viz_config_output: object | null;
    filters_output: object | null;
    human_score: number | null;
    human_feedback: string | null;
    metric_query: object | null;
    saved_query_uuid: string | null;
    model_config: { modelName: string; modelProvider: string } | null;
    token_usage: { totalTokens: number } | null;
    // Hidden turn: the agent receives and responds to the prompt, but the UI
    // doesn't render the user bubble (e.g. the post-merge migration prompt).
    hidden: boolean;
};

export type AiPromptTable = Knex.CompositeTableType<
    // base
    DbAiPrompt,
    // insert
    Pick<DbAiPrompt, 'ai_thread_uuid' | 'created_by_user_uuid' | 'prompt'> &
        Partial<Pick<DbAiPrompt, 'model_config' | 'hidden'>>,
    // update
    Partial<
        Pick<
            DbAiPrompt,
            | 'response'
            | 'error_message'
            | 'viz_config_output'
            | 'filters_output'
            | 'human_score'
            | 'human_feedback'
            | 'metric_query'
            | 'saved_query_uuid'
            | 'model_config'
            | 'token_usage'
        > & {
            responded_at: Knex.Raw;
        }
    >
>;

export const AiThreadCompactionTableName = 'ai_thread_compaction';

export type DbAiThreadCompaction = {
    ai_thread_compaction_uuid: string;
    ai_thread_uuid: string;
    compacted_through_ai_prompt_uuid: string;
    triggering_ai_prompt_uuid: string;
    serialized_input: string;
    summary: string;
    created_at: Date;
};

export type AiThreadCompactionTable = Knex.CompositeTableType<
    DbAiThreadCompaction,
    Pick<
        DbAiThreadCompaction,
        | 'ai_thread_uuid'
        | 'compacted_through_ai_prompt_uuid'
        | 'triggering_ai_prompt_uuid'
        | 'serialized_input'
        | 'summary'
    >,
    never
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
    ai_mcp_server_uuid: string | null;
    parent_tool_call_id: string | null;
    created_at: Date;
};

export type AiAgentToolCallTable = Knex.CompositeTableType<
    DbAiAgentToolCall,
    Pick<
        DbAiAgentToolCall,
        | 'ai_prompt_uuid'
        | 'tool_call_id'
        | 'tool_name'
        | 'tool_args'
        | 'ai_mcp_server_uuid'
        | 'parent_tool_call_id'
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

export const AiPromptContextTableName = 'ai_prompt_context';

export type AiPromptContextEntityType =
    | 'chart'
    | 'dashboard'
    | 'thread'
    | 'file'
    | 'repository';

export type DbAiPromptContext = {
    ai_prompt_context_uuid: string;
    ai_prompt_uuid: string;
    entity_type: AiPromptContextEntityType;
    // UUID-keyed entities (chart/dashboard/thread) store their uuid here;
    // string-keyed entities (file/repository) leave it null and use entity_ref.
    entity_uuid: string | null;
    // Natural-key reference for entities without a uuid: a file path or a
    // repository `owner/repo`. Null for uuid-keyed entities.
    entity_ref: string | null;
    pinned_version_uuid: string | null;
    display_name: string | null;
    runtime_overrides: AiChartRuntimeOverrides | null;
    created_at: Date;
};

export type AiPromptContextTable = Knex.CompositeTableType<
    DbAiPromptContext,
    Pick<DbAiPromptContext, 'ai_prompt_uuid' | 'entity_type'> &
        Partial<
            Pick<
                DbAiPromptContext,
                | 'entity_uuid'
                | 'entity_ref'
                | 'pinned_version_uuid'
                | 'display_name'
                | 'runtime_overrides'
            >
        >,
    never
>;

export const AiOrganizationSettingsTableName = 'ai_organization_settings';

export type DbAiOrganizationSettings = {
    organization_uuid: string;
    ai_agents_visible: boolean;
    ai_agent_reviews_enabled: boolean;
    mcp_content_writes_enabled: boolean;
    created_at: Date;
    updated_at: Date;
};

export type AiOrganizationSettingsTable = Knex.CompositeTableType<
    DbAiOrganizationSettings,
    Pick<DbAiOrganizationSettings, 'organization_uuid' | 'ai_agents_visible'> &
        Partial<
            Pick<
                DbAiOrganizationSettings,
                'ai_agent_reviews_enabled' | 'mcp_content_writes_enabled'
            >
        >,
    Partial<
        Pick<
            DbAiOrganizationSettings,
            | 'ai_agents_visible'
            | 'ai_agent_reviews_enabled'
            | 'mcp_content_writes_enabled'
        >
    >
>;

export const AiSqlApprovalTableName = 'ai_sql_approval';

export type AiSqlApprovalDecision = 'approved' | 'rejected';

export type DbAiSqlApproval = {
    tool_call_id: string;
    decision: AiSqlApprovalDecision;
    decided_by_user_uuid: string | null;
    decided_at: Date;
};

export type AiSqlApprovalTable = Knex.CompositeTableType<
    DbAiSqlApproval,
    Pick<DbAiSqlApproval, 'tool_call_id' | 'decision'> &
        Partial<Pick<DbAiSqlApproval, 'decided_by_user_uuid'>>,
    never
>;
