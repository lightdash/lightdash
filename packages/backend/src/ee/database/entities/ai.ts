import { Knex } from 'knex';

export const AiThreadTableName = 'ai_thread';

export type DbAiThread = {
    ai_thread_uuid: string;
    created_at: Date;
    organization_uuid: string;
    project_uuid: string;
    created_from: string; // slack, web, etc
};

export type AiThreadTable = Knex.CompositeTableType<
    DbAiThread,
    Pick<DbAiThread, 'organization_uuid' | 'project_uuid' | 'created_from'>
>;

export const AiSlackThreadTableName = 'ai_slack_thread';

export const AiWebAppThreadTableName = 'ai_web_app_thread';

type DbAiSlackThread = {
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
    Pick<DbWebAppThread, 'user_uuid'>,
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
    metric_query: object | null;
};

type DbAiPromptUpdate = Partial<
    Pick<
        DbAiPrompt,
        | 'response'
        | 'responded_at'
        | 'viz_config_output'
        | 'filters_output'
        | 'human_score'
        | 'metric_query'
    >
>;

export type AiPromptTable = Knex.CompositeTableType<
    DbAiPrompt,
    Pick<DbAiPrompt, 'ai_thread_uuid' | 'created_by_user_uuid' | 'prompt'>,
    DbAiPromptUpdate
>;

export const AiSlackPromptTableName = 'ai_slack_prompt';
export const AiWebAppPromptTableName = 'ai_web_app_prompt';

type DbAiSlackPrompt = {
    ai_slack_prompt_uuid: string;
    ai_prompt_uuid: string;
    slack_user_id: string;
    slack_channel_id: string;
    prompt_slack_ts: string;
    response_slack_ts: string | null;
};

type DbAiWebAppPrompt = {
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
    Pick<DbAiWebAppPrompt, 'ai_prompt_uuid'>,
    Pick<DbAiWebAppPrompt, 'user_uuid'>
>;
